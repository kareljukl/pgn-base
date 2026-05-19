# Feature: ŠSČR player autocomplete in HeaderForm

## Motivation

Filling `White` / `Black` plus all the ID and Elo columns by hand for every imported game is tedious and error-prone. `api.chess.cz` exposes a public REST API with player records that include `fullName`, `czeId`, `fideId`, `czeStdElo`, `fideStdElo`, `clubName` — enough to fill the entire header.

**Constraint:** the API aggressively blocks IPs after roughly 3 requests/minute. A block shows as a `connect timeout` to port 443 (not 429), and lasts hours. The endpoint is not designed for live autocomplete, so every architectural choice has to defend the IP budget.

## Architecture (4 layers)

```
[Browser HeaderForm — debounced 1s, min 4 chars]
    ↓ React Query (staleTime 5 min, gcTime 30 min)
    ↓ GET /api/v1/chesscz/search?q=Novák
[Worker /api/v1/chesscz/*]
    ↓ Layer 1: chesscz_search D1 cache (7-day TTL)
       hit → JOIN chesscz_player → return
    ↓ miss
    ↓ Layer 2: atomic rate-limit gate (10 s min gap; wait-and-retry up to 12 s)
       blocked → return stale cache if any, else 503
       still throttled after wait → 429 (Retry-After: 20)
    ↓ allow
    ↓ Layer 3: fetch api.chess.cz with 10 s AbortSignal timeout
       timeout → markBlocked() → blocked_until = now + 1 h → 503
    ↓ ok
    ↓ Layer 4: trim + upsert chesscz_player, upsert chesscz_search with cze_id[]
    ↓ return players
```

## Backend

`backend/src/routes/chesscz.ts` (mounted under `/api/v1/chesscz`):

- `GET /search?q=…` — name search, min 4 chars.
- `GET /player/cze/:czeId` and `GET /player/fide/:fideId` — single-player lookup. `?refresh=true` bypasses the 30-day cache.

All routes require auth. The atomic gate uses `UPDATE chesscz_rate SET last_fetch_at = ? WHERE id = 1 AND last_fetch_at <= ? - 10000` and checks `meta.changes` — two concurrent workers can't both win the slot.

`acquireSlotWithWait` lets a request sleep up to `MAX_WAIT_FOR_SLOT_MS = 12_000` before giving up — so a second user search 5 s after the first quietly waits and then succeeds instead of returning an error.

API response shape is inconsistent (single object vs array — the skill `~/.claude/skills/api-chess-cz/SKILL.md` documents this). `normalizeMembers()` always returns an array.

`upsertPlayers()` trims every string value defensively because the upstream API occasionally returns trailing whitespace.

## Frontend

`frontend/src/hooks/useChessczSearch.ts`:

- `useDebounced(value, 1000)` — wait for 1 s of input stability before allowing a query.
- `useChessczSearch(rawQuery)` — React Query keyed on the debounced + normalized query. Returns `{ ...query, debouncedQuery }` so the component knows whether the input still leads the query.
- `fetchPlayerByCzeId(id, refresh)` / `fetchPlayerByFideId(id, refresh)` — explicit refresh for the ⟳ button.

`frontend/src/components/GameEditor/PlayerAutocomplete.tsx` — input + dropdown:

- Dropdown shows `Hledám…` whenever the input has changed since the last debounced fire (`inputTrimmed !== debouncedQuery`) — avoids the misleading flash of stale results or "Žádné výsledky" during the 1 s debounce window.
- Rows render `{fullName} ({birthYear})`, then club, then `FIDE` / `Cze` Elo badges.
- Keyboard nav: ArrowUp / ArrowDown / Enter / Esc.
- Server errors mapped to Czech messages: 429 → "Vyhledávání je dočasně omezeno…", 503 → "ŠSČR dočasně nedostupné", `stale` flag → yellow notice.

`frontend/src/components/GameEditor/HeaderForm.tsx`:

- `White` / `Black` inputs are `PlayerAutocomplete` instances.
- `applyPlayer(side, player)` fills 7 fields: `White`, `WhiteCzeId`, `WhiteFideId`, `WhiteCzeElo`, `WhiteFideElo`, `WhiteElo` (= FideStdElo with CzeStdElo fallback), `WhiteTeam` (= clubName). Same for Black. All string values `.trim()`-ed.
- Refresh ⟳ icon only next to `WhiteCzeId` and `BlackCzeId` (CzeId is the primary ŠSČR key; FideId points at the same record, so two icons per side would just confuse). Click → `fetchPlayerByCzeId(id, true)` → `applyPlayer`.

## Schema

```sql
CREATE TABLE chesscz_player (
  cze_id          INTEGER PRIMARY KEY,
  fide_id         INTEGER,
  full_name       TEXT,
  first_name      TEXT,
  last_name       TEXT,
  club_id         TEXT,
  club_name       TEXT,
  birth_year      INTEGER,
  gender          TEXT,
  player_class    TEXT,
  cze_std_elo     INTEGER,
  cze_rapid_elo   INTEGER,
  fide_std_elo    INTEGER,
  fide_rapid_elo  INTEGER,
  fide_blitz_elo  INTEGER,
  raw_json        TEXT NOT NULL,
  fetched_at      INTEGER NOT NULL
);
CREATE INDEX idx_chesscz_player_fide_id ON chesscz_player(fide_id);
CREATE INDEX idx_chesscz_player_full_name ON chesscz_player(full_name COLLATE NOCASE);

CREATE TABLE chesscz_search (
  query_norm  TEXT PRIMARY KEY,
  result_ids  TEXT NOT NULL,   -- JSON array of cze_ids in original order
  fetched_at  INTEGER NOT NULL
);

CREATE TABLE chesscz_rate (
  id              INTEGER PRIMARY KEY,
  last_fetch_at   INTEGER NOT NULL DEFAULT 0,
  blocked_until   INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO chesscz_rate (id, last_fetch_at, blocked_until) VALUES (1, 0, 0);
```

## Tuning constants

```ts
const MIN_QUERY_LEN = 4;
const SEARCH_TTL_MS = 7 * 24 * 3600 * 1000;
const PLAYER_TTL_MS = 30 * 24 * 3600 * 1000;
const RATE_MIN_GAP_MS = 10_000;          // started at 20, lowered for UX
const MAX_WAIT_FOR_SLOT_MS = 12_000;
const BLOCK_DURATION_MS = 3_600_000;
const SSCR_FETCH_TIMEOUT_MS = 10_000;
```

Front-end debounce: 1 000 ms.

## Out of scope

- Bulk Elo refresh across an entire database (would need queue + rate-limited iteration).
- Weekly cron sync of `/clubs/all` to a `clubs` table. Skill recommends it but `clubName` from `/members/name` is good enough for v1.
- Cross-origin direct call from browser. Backend must remain the only caller — protects shared IP budget and avoids CORS.
- Diacritics-insensitive search cache (`Nová` vs `nova` would split). Lowercase + trim only for v1.
- Team field from team-tournament schedule. See memory `project_team_field`.
