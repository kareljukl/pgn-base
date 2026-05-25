# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PGN Base — chess database web app for club players. Code in English, UI in Czech.

Production:
- **Frontend:** https://pgn-base.pages.dev (Cloudflare Pages)
- **Backend:** https://pgn-base-api.kareljukl.workers.dev (Cloudflare Worker)
- **D1 database:** region EEUR, ID `a9a08b8f-db2c-48ec-ba3c-20e4739eba14`

## Commands

### Backend (Cloudflare Worker + Hono + D1)
```bash
cd backend
npm run dev          # Wrangler dev server on :8787 (type `rs` + Enter to restart)
npm run db:init      # Create D1 tables locally
npm run db:seed      # Insert test data (dev user + 3 sample games)
npm run db:reset     # init + seed combined
```

Secrets for local dev are in `backend/.dev.vars` (gitignored). Required vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`, `FRONTEND_URL`, `LICHESS_TOKEN`. (`api.chess.cz` is anonymous, no token.)

**Note:** After changing `database_id` in `wrangler.toml`, the local D1 SQLite file changes. Run `npm run db:reset` to recreate local data.

**Schema migrations:** `schema.sql` uses `CREATE TABLE IF NOT EXISTS`, so new columns added to an existing table won't apply via `db:reset`. For local dev either delete the SQLite file or run an explicit `ALTER TABLE` via `npx wrangler d1 execute pgn-base-db --local --command "..."`. For production, run the same `--remote` (see `docs/feat-game-editor-v2.md` for the FIDE/CzeId column migration as an example).

### Frontend (React 18 + Vite)
```bash
cd frontend
npm install
cp node_modules/stockfish/bin/stockfish-18-single.{js,wasm} public/  # required after install
npm run dev          # Vite dev server on :5173 (5174 if taken)
npx tsc --noEmit     # type check
npx vite build       # production build
```

### Deployment
```bash
# Backend
cd backend && npx wrangler deploy

# Frontend — stockfish WASM (108MB) exceeds Pages 25MB limit, served from CDN in prod
cd frontend && npx vite build
rm -f dist/stockfish-18-single.*
echo "/*  /index.html  200" > dist/_redirects
npx wrangler pages deploy dist --project-name pgn-base --commit-dirty=true --commit-message="Deploy"
```

Note: Pages deploy fails with non-ASCII commit messages — always pass `--commit-message` with ASCII text.

### Testing auth locally
Use `POST /api/v1/auth/dev-login` (dev-only endpoint) — logs in as the seed user without Google OAuth. The Login page shows a "Dev Login" button in dev mode. Returns `{ user, token }` — token is stored in localStorage.

## Routes

Frontend routes (`App.tsx`):
- `/login` — Google OAuth + dev-login
- `/` — list of user's databases (protected)
- `/db/:id` — database detail with game list (protected)
- `/db/:id/game/new` — `GameEditor` in create mode (protected)
- `/db/:id/game/:gameId/edit` — `GameEditor` in edit mode (protected)
- `/db/:id/game/:gameId` — `GameViewer` (protected)
- `/public` — list of public databases
- `/public/:id` — public database detail
- `/public/:id/game/:gameId` — `PublicGameViewer` (read-only)

Backend routes (all under `/api/v1/`):
- `auth/*` — login, callback, me, dev-login, logout
- `databases` — list/create/update/delete user's databases (POST accepts optional `import_source` + `chesscz_comp_id` / `chesscz_round_nr` / `chesscz_home_team_id` / `chesscz_away_team_id` for ŠSČR imports)
- `databases/:id` — GET single database with `game_count` and ŠSČR metadata
- `databases/:dbId/games` — GET list (filter/sort/paginate, optional `includeMoves=true`, `limit` up to 1000), POST batch import (returns `{ imported, ids }`)
- `databases/:dbId/games/:gameId` — GET / PATCH (headers + optional `movesPgn`) / DELETE
- `databases/:dbId/games/bulk-update` — POST array of `{ gameId, headers, movesPgn? }` (atomic D1 batch); used by DatabaseDetail bulk diacritics / cleanup
- `databases/:dbId/games/:gameId/export` and `databases/:dbId/export` — PGN download
- `public/databases/*` — read-only mirror for public DBs
- `explorer` — Lichess Masters API proxy (requires `LICHESS_TOKEN`)
- `chesscz/search?q=...` — debounced player autocomplete proxy to `api.chess.cz/api/members/name` (auth required, D1 cache + atomic rate limit)
- `chesscz/player/cze/:czeId` and `chesscz/player/fide/:fideId` — single-player lookup / refresh; `?refresh=true` bypasses 30-day cache
- `chesscz/competitions` (1 d, katalog soutěží podle krajů — viz `ChessczImportDialog` cascade), `chesscz/competitions/:compId/details` (1 d), `chesscz/competitions/:compId/table` (1 h), `chesscz/competitions/:compId/schedule` (1 d, full season — rounds + matches per round), `chesscz/competitions/:compId/team/:teamId/schedule` (1 d), `chesscz/competitions/:compId/team/:teamId/roster` (1 d — soupiska týmu pro roster-only autocomplete v zápasovém režimu), `chesscz/competitions/:compId/round/:round/schedule` (1 d), `chesscz/competitions/:compId/round/:round/matches` (30 min) — generic cached ŠSČR proxies backing the UC1 league-match import. Cache lives in `chesscz_cache` (key/payload/ttl/fetched_at). Stale cache is served on rate-limit block / timeout.

## Architecture

Two separate npm projects: `backend/` and `frontend/`. Vite proxies `/api` to the backend at `:8787` in dev.

### Backend (`backend/src/`)
- **Hono** app with typed bindings (`types.ts: AppEnv`) — D1 database binding is `DB`
- `routes/auth.ts` — Google OAuth flow + JWT (HMAC-SHA256). In production: token returned via URL hash redirect (`/login#token=JWT`), stored in localStorage. In dev: cookie-based. Dev-login bypass returns token in response body.
- `routes/databases.ts` — CRUD for user's databases (auth required)
- `routes/games.ts` — game import (POST batch, max 1000, returns inserted IDs), list with filtering/sorting/pagination + optional `includeMoves=true`, single game, **PATCH for header + movetext updates**, delete, PGN export, **`POST /:dbId/games/bulk-update`** (atomic D1 batch for bulk diacritics / cleanup). PATCH body: `{ headers: Record<string,string>, movesPgn?: string }` — when `movesPgn` is provided, also updates `moves_pgn` and recomputes `ply_count` via `countPlies()`. All write paths bind 21 PGN-tag columns including `white_fide_elo`/`black_fide_elo`/`white_cze_elo`/`black_cze_elo`.
- `routes/public.ts` — read-only mirror of games/databases endpoints for public databases (no auth)
- `routes/explorer.ts` — proxy to Lichess Masters explorer (returns `opening.eco`/`opening.name` plus move statistics)
- `routes/chesscz.ts` — proxy to ŠSČR `api.chess.cz/api` (`/members/name` search + `/members/{id}/cze|fide` detail + competition endpoints via generic `cachedFetchSscr` helper backed by `chesscz_cache`). Three D1-backed layers: `chesscz_search` query cache (7-day TTL), `chesscz_player` record cache (30-day TTL), `chesscz_rate` atomic rate-limit gate (10 s min gap, wait-and-retry up to 12 s before 429; on `fetch` timeout sets `blocked_until = now + 1 h`). Search responses are normalized (single object vs array) and per-player records are trimmed + upserted; the search cache stores ordered `cze_id` arrays.
- `middleware/auth.ts` — checks `Authorization: Bearer` header first, then cookie fallback. Loads user from D1, sets `c.get('user')`
- `lib/jwt.ts` — JWT sign/verify using Web Crypto API (no external deps)
- `lib/pgn.ts` — `buildPgn()` assembles PGN from DB row (21 header columns including the three Elo variants + ply count + movetext), `stripMoveText()` removes comments/variations/NAGs, `countPlies()` counts half-moves via SAN regex

All API routes are under `/api/v1/`. Games routes are mounted on `/api/v1/databases` alongside database routes (via `/:dbId/games` patterns).

### Frontend (`frontend/src/`)

**Pages:**
- `Login.tsx`, `Databases.tsx` (offers "+ Nová databáze" plus "Importovat ze ŠSČR" via `ChessczImportDialog`), `DatabaseDetail.tsx` (with bulk diacritics / Vyčisti PGN refused-row highlight, double-confirm for multi-page filters, **"Načíst výsledky"** button + **Standardní / Zápasový** view toggle when `import_source === 'chesscz'`. Standard view shows the seven-column game list (dates rendered `DD.MM.YYYY`, result column centered and colored via `getResultColor`). Zápasový view fetches up to 1000 games, sorts client-side by `board`, renders a one-line match summary (`Kolo N · DD.MM.YYYY · Home – Away · X:Y`) and a four-column `Šach. / Domácí / Hosté / Výsledek` table — each player cell shows name + Elo + a 10 px white/black `ColorCube` and a team-name subtitle read straight from `game.white_team` / `game.black_team`; the per-board result is rendered from the home team's perspective (`1:0` green / `0:1` red / `½:½` gray / `*` gray). View choice persisted in `localStorage[pgn-base-view-mode-${dbId}]` (`'standard'` | `'match'`); non-chesscz DBs are forced back to `'standard'`.)
- `GameViewer.tsx` — playback + editable header panel ("Upravit hlavičku") + "Upravit tahy" button to enter editor (disabled when tree has any variation) + per-game cleanup actions (Odstranění diakritiky, Vyčisti PGN) + **"Nahraj tahy"** (inline `LoadMovesDialog` — file/text PGN, must contain exactly one game, headers ignored; nahrazené tahy se nahrají přes stejný `cleanedMovesPgn` dirty flow jako Vyčisti PGN, takže user musí kliknout Uložit / Zahodit; po importu se asynchronně detekuje ECO přes `lib/detectEco.ts` — vzorkuje FENy na hloubkách 16/12/8/4 přes `/explorer` a hluboko-první hit naplní `headers.ECO` + summary) + board flip button (⇅) in nav row.
- `GameEditor.tsx` — dual-mode (create / edit) editor. Mode detected from presence of `gameId` route param. Tracks `initialMoves` / `initialHeaders` to derive `movesDirty` / `headersDirty`; Save disabled when nothing changed, Discard confirm message branches on what's dirty. Edit mode fetches existing game (shares `['game', id, gameId]` query cache with GameViewer) and parses `moves_pgn` via `parseMoveText` (main line only). Board flip button under board.
- `PublicDatabases.tsx`, `PublicDatabase.tsx`, `PublicGameViewer.tsx` — public read-only mirror. Sidebar navigation works in both authenticated and public viewers via router state; board flip button under board.

**Components:**
- `components/Layout.tsx` — app header (nav + user block only).
- `components/SanFormatToggle.tsx` — global 3-state selector for SAN display mode, persisted in localStorage `pgn-base-san-format`. Default `PGN` (English chess.js output). Rendered inline next to the "Tahy" label inside `MoveList` and `EditorMoveList` (not in the app header).
- `components/Board/Board.tsx` — read-only Chessground (used in GameViewer, PublicGameViewer, ReplaceConfirmModal mini-board). Accepts `orientation`, `lastMove`, `autoShapes`.
- `components/Board/EditableBoard.tsx` — interactive Chessground for the editor with chess.js move validation, promotion dialog, `orientation`, and `autoShapes` support. `drawable.enabled: true` (allows engine arrows + user-drawn shapes on right-click).
- `components/GameEditor/` — `HeaderForm` (21-field PGN tag form with `PlayerAutocomplete` for `White`/`Black` and ⟳ refresh icons next to `WhiteCzeId`/`BlackCzeId`, reused by both editor and GameViewer's header panel; accepts optional `chessczContext={compId, homeTeamId, awayTeamId}` — when present, swaps `PlayerAutocomplete` for `RosterAutocomplete` and uses board parity to pick which team's roster feeds White vs Black), `PlayerAutocomplete` (debounced ŠSČR dropdown), `RosterAutocomplete` (offline filter over the team's `/roster` — no debounce, shows whole roster on focus, never falls back to global `/search`), `EditorMoveList`, `ReplaceMoveDialog` (inline + confirm modal with mini-board), `RestoreDraftDialog`.
- `components/Analysis/Analysis.tsx` — single "Analýza" box that merges Lichess Cloud Eval and local Stockfish. **Cloud has priority**: when `/cloud-eval` has data, displayed PVs come from the cloud and the local engine stays paused (`stopAnalysis()`); on cache miss the engine resumes if enabled. Best-move arrow follows whichever source is currently rendered. Source label in the header (`Lichess cloud · d{N}` vs `Stockfish 18 · d{N}`). MultiPV (1–5) bounds rows from both sources; depth slider applies only to local engine. Rendered in GameViewer, PublicGameViewer, and GameEditor.
- `components/OpeningBook/OpeningBook.tsx` — Lichess Masters move statistics, gated by an ON/OFF toggle persisted in localStorage.
- `components/ImportDialog.tsx` — PGN file/text import.
- `components/Databases/ChessczImportDialog.tsx` — 4-step ŠSČR import dialog (kraj/liga → soutěž **nebo** compId → team or round → match → confirm). Krok 1 nabízí dvouúrovňový cascade picker (region → soutěž; ŠSČR id=98 pinned top, soutěže v rámci regionu sorted by `compLevel` ASC, mládežnické označené suffixem „(mládež)") + paralelně manuální zadání `compId`. Katalog z `useChessczCompetitions()`, staleTime 24 h. Round mode lists real rounds from `useChessczCompSchedule` (no hardcoded range); match picker is a clickable HTML table (`Kolo · datum · Domácí · Skóre · Hosté`) with scores in tabular-nums and `?:?` for unplayed games. On submit creates database with `import_source='chesscz'` and N placeholder games (8 default, or `matchGames.length` if results are already published). Uses helpers from `lib/chesscz.ts`. Modal width is `fit-content` with `minWidth: min(560px, 96vw)` so the table sets its own width without internal scroll.

**Libs / hooks:**
- **Auth** (`lib/auth.ts`, `hooks/useAuth.ts`) — token stored in localStorage. In production, OAuth callback redirects to `/login#token=JWT`, Login page reads it from hash. All API requests include `Authorization: Bearer` header.
- **API client** (`lib/api.ts`) — `API_ORIGIN` switches between empty string (dev, via Vite proxy) and workers.dev URL (prod). Methods: `get`, `post`, `patch`, `delete`.
- **Custom PGN parser** (`lib/moveTree.ts`) — tokenizer + recursive descent parser producing a tree of `MoveNode[]` with FEN at each node. Supports nested variations `()`, comments `{}`, NAG symbols `$N`, inline annotations (`Nf3!`). Uses chess.js for move validation and FEN generation. Editor parses moves linearly (main line only) by reading `tree.moves`.
- **UCI → SAN** (`lib/uciToSan.ts`) — `uciSequenceToSan(fen, uciMoves)` replays UCI through chess.js, returning SAN per ply. Shared by `useStockfish` and `useCloudEval`.
- **SAN format** (`lib/sanFormat.tsx`) — `formatSan(san, mode)` returns `ReactNode`. `'en'` returns the input, `'cs'` substitutes Czech piece letters (K/D/V/S/J + `=X`), `'fig'` wraps the first letter (and any promotion piece) in a styled `<span>` with filled Unicode glyphs `♚♛♜♝♞` at `font-size: 1.4em`, slight vertical-align tweak. Used in `MoveList`, `Analysis` PvLine, `OpeningBook`, `EditorMoveList`.
- **SAN format hook** (`hooks/useSanFormat.ts`) — `useSyncExternalStore` + localStorage `pgn-base-san-format`, mirrors the `useVariantArrowsToggle.ts` pattern.
- **Editor PGN helpers** (`lib/editorPgn.ts`) — `EditorHeaders` type (21 fields including `WhiteFideElo`/`WhiteCzeElo`/`BlackFideElo`/`BlackCzeElo`), `emptyHeaders`, `headersFromGameRow`, `headersEqual`, `toApiHeaders`, `buildEditorMovesPgn`.
- **Zustand store** (`store/gameStore.ts`) — holds the move tree + current path. Path is `number[]`: `[moveIdx]` for main line, `[moveIdx, varIdx, moveIdx, ...]` for variations. Used by viewers (read-only); GameEditor maintains its own linear `moves` + `fens` + `cursor` state.
- **Chessground** board — requires explicit pixel dimensions (uses ResizeObserver). CSS imported in `main.tsx`. Drag cursor offset is fixed by clearing chessground's cached bounds on `mousedown`/`touchstart` capture in `EditableBoard`. Board orientation lives as `useState<'white'|'black'>('white')` per page mount; flip button toggles it.
- **Stockfish** (`hooks/useStockfish.ts`) — in dev loads from `/public`, in production loads from unpkg CDN (`unpkg.com/stockfish@18.0.7/bin`). UCI protocol over postMessage. WASM files are gitignored. Tracks per-MultiPV evaluations in a `Map<index, eval>`, converts UCI PV to SAN via the shared `uciToSan` helper, persists settings (`multiPV`, `depth`, `arrows`) in `localStorage` under `pgn-base-engine-settings`. **Analysis component pauses the engine** (`stopAnalysis()`) whenever cloud eval has data for the current FEN and resumes (`startAnalysis(fen)`) on cache miss.
- **Lichess Cloud Eval** (`hooks/useCloudEval.ts`) — proxied through Vite in dev (`/lichess-explorer` → `lichess.org/api`), direct in production. Returns full SAN PVs (up to 10 plies) via `uciSequenceToSan`, plus depth/staleness. Consumed only by `Analysis.tsx`.
- **Editor ECO** (`hooks/useEditorEco.ts`) — sticky last-known ECO from `/api/v1/explorer`, debounce 300 ms. Used by GameEditor's header form.
- **ŠSČR autocomplete** (`hooks/useChessczSearch.ts`) — `useDebounced` (1 s, "no-keystroke" condition) + `useChessczSearch(rawQuery)` returning `{ data, isFetching, error, debouncedQuery }`. Fires only when `query.trim().length >= 4`. React Query cache: staleTime 5 min, gcTime 30 min. `fetchPlayerByCzeId(id, refresh)` and `fetchPlayerByFideId(id, refresh)` for the explicit refresh path. Backend handles all rate limiting; frontend only debounces.
- **ŠSČR competition hooks** (`hooks/useChessczCompetition.ts`) — `useChessczCompetitions` (paramless catalog of regions + competitions, staleTime 24 h), `useChessczDetails`, `useChessczTable`, `useChessczCompSchedule` (full-season rounds + matches), `useChessczTeamSchedule`, `useChessczRoster` (team lineup for roster-only autocomplete), `useChessczRoundSchedule`, `useChessczRoundMatches` over the cached proxy endpoints; `fetchChessczRoundMatches(compId, round)` for imperative use in DatabaseDetail's "Načíst výsledky" handler. All hooks accept `null` ids and gate with `enabled`.
- **ŠSČR mappers** (`lib/chesscz.ts`) — types matching the OpenAPI shapes, `asArray()` normalizer for the single-object-or-array responses, `formatChessczDate()` (DD.MM.YYYY → YYYY.MM.DD), `formatMatchScore()` (`4.5:3.5` / `?:?` when unplayed), `buildPlaceholderGames()` (board → home/away alternation + `removeDiacritics`), `boardGameToHeaders()` (BoardGame + match → 21-field PGN header subset including `WhiteCzeId`/`BlackCzeId`), `findMatch()` (filter round matches by home+away team).
- **Display date** (`lib/dateFormat.ts`) — `formatPgnDate("YYYY.MM.DD")` → `"DD.MM.YYYY"`. Handles partial PGN dates (`2025.??.??` → `2025`; `2025.10.??` → `10.2025`). Used in DatabaseDetail and the match summary header.
- **Result color** (`lib/pgnUtils.ts` `getResultColor`) — green for `1-0`, red for `0-1`, gray for `1/2-1/2` / `*` / null. Used in both standard and match views; match view also exposes a per-board helper that flips the perspective for even boards so the rendered text becomes `1:0` / `0:1` / `½:½` from the home team's viewpoint.
- **GameViewer sidebar** — when navigating from DatabaseDetail, router state passes query context (`filter`, `sort`, `order`, `dbId`, `dbName`). Sidebar fetches its own game list from API with same parameters and independent pagination.
- **TanStack Query** for all API calls. Shared cache keys: `['game', id, gameId]` (single game), `['games', id]` (DatabaseDetail list), `['sidebar-games', dbId]` (viewer sidebar). After PATCH/POST/DELETE, mutations invalidate all three so GameViewer, sidebar, and list refresh together.
- **React Router v6** for routing.

**Drafts:** Editor autosaves every minute to localStorage. Keys: `pgn-base-draft-${dbId}` (create mode) / `pgn-base-draft-edit-${gameId}` (edit mode). Restored via `RestoreDraftDialog` on next mount.

### Database schema (D1/SQLite)
Seven tables: `users`, `databases`, `games` + `chesscz_player`, `chesscz_search`, `chesscz_rate`, `chesscz_cache`.

The `games` table stores all PGN headers as typed columns (for filtering/sorting): `event`, `site`, `date`, `round`, `board`, `white`, `black`, `white_elo`, `black_elo`, `white_fide_elo`, `black_fide_elo`, `white_cze_elo`, `black_cze_elo`, `white_team`, `black_team`, `white_fide_id`, `black_fide_id`, `white_cze_id`, `black_cze_id`, `result`, `eco`, `ply_count` (computed from movetext on insert/update), plus `moves_pgn` for the raw movetext.

The `databases` table also stores ŠSČR-import metadata: `import_source` ('manual' | 'chesscz'), `chesscz_comp_id`, `chesscz_round_nr`, `chesscz_home_team_id`, `chesscz_away_team_id` (all nullable; populated when DB was created via the ŠSČR import flow).

The `chesscz_*` tables back the ŠSČR proxies: `chesscz_player` (cze_id PK, full Member fields, `fetched_at`), `chesscz_search` (query_norm PK → JSON `result_ids` of cze_ids, `fetched_at`), `chesscz_rate` (single row id=1 with `last_fetch_at` and `blocked_until` for the atomic rate-limit gate), `chesscz_cache` (generic `cache_key`/`payload` JSON/`ttl_ms`/`fetched_at` for the competition/table/schedule/matches endpoints).

See `backend/src/db/schema.sql`.

## Key Design Decisions
- PGN movetext is stored as raw text, parsed on the frontend only when viewing. No server-side move validation. Backend only computes `ply_count` via SAN regex on insert/update.
- Variations in the PGN parser: when encountering `(`, the parser creates a new Chess instance from the FEN **before** the preceding move (the variation is an alternative to that move). The editor only consumes the main line (`tree.moves`).
- Cross-domain auth: workers.dev and pages.dev are different domains — third-party cookies are blocked by browsers. Solution: token-based auth via `Authorization` header + localStorage (production), cookies (dev only).
- Export links use `API_ORIGIN` prefix to point directly to the Worker URL in production.
- Stockfish WASM (108MB) exceeds Pages 25MB file limit — served from unpkg CDN in production, from local `/public` in dev.
- Cloudflare Pages deploy requires ASCII commit messages (`--commit-message` flag).
- Single PATCH endpoint `/games/:gameId` handles both header-only edits (from GameViewer Hlavička panel) and full edits with movetext (from GameEditor edit mode). Body shape: `{ headers, movesPgn? }`.
- POST `/games` returns `{ imported, ids }` so the editor can redirect to the newly-created game's viewer after save.
- GameEditor is a single component handling both `create` and `edit` modes — distinguished by presence of `:gameId` route param. Shares HeaderForm, draft autosave, ECO sticky, Stockfish, OpeningBook, and replace-move logic.
- Dirty state in GameEditor is tracked per-section (`movesDirty` vs `headersDirty`) against `initialMoves` / `initialHeaders` baseline. Drives the Discard confirm wording and disables Save when nothing has changed.
- GoatCounter analytics snippet in `index.html` (`<script data-goatcounter=...>`) — counts visits anonymously.
- **SAN localization is display-only.** All storage (`moves_pgn` in D1, PGN export, chess.js internal SAN) stays English. `formatSan(san, mode)` transforms at render-time only — never round-tripped.
- **Cloud eval has priority over local Stockfish.** Single Analysis box, cloud data wins when present; local engine fills cache misses to keep CPU low for opening theory.
- **`api.chess.cz` is brittle** — ~3 req/min before IP block (manifests as `connect timeout`, not 429, hours-long). Backend handles all proxying with a D1-atomic rate-limit gate (10 s min gap, server-side wait-and-retry up to 12 s) plus 7-day search cache and 30-day player cache. Frontend debounces 1 s and never calls `api.chess.cz` directly.
- **Team field semantics.** `WhiteTeam` / `BlackTeam` is auto-filled from `clubName` for individual events. Future team-tournament flow will overwrite with `teamName` from the league `/competitions` rozpis (not implemented yet — see memory entry `project_team_field`).
- **Board orientation is local per page mount.** Resets to white when navigating to a new game; explicit flip button (⇅) toggles per session.

## Feature docs

Detailed feature specs live in `docs/`:
- `feat-game-editor.md` — interactive editor for creating new games (v1)
- `feat-game-editor-v2.md` — FIDE/CzeId columns and PlyCount tag
- `feat-game-edit.md` — editing existing games via shared GameEditor
- `feat-engine-improvements.md` — MultiPV, SAN PV, board arrows for Stockfish
- `feat-analysis-merge.md` — single "Analýza" box, cloud-eval priority, engine as fallback
- `feat-san-localization.md` — PGN / Cze / figurine SAN display toggle in the app header
- `feat-elo-variants.md` — `WhiteFideElo`/`WhiteCzeElo` (+ Black) PGN tags and DB columns
- `feat-chesscz-autocomplete.md` — ŠSČR player autocomplete in HeaderForm + rate-limited backend proxy
- `feat-board-flip.md` — board orientation toggle under the chessboard
- `feat-chesscz-import-uc1.md` — UC1 import of a single league match from ŠSČR (compId → team → match → 8 placeholder games, "Načíst výsledky" button in DatabaseDetail)
- `feat-chesscz-roster-autocomplete.md` — roster-only autocomplete v zápasovém režimu (HeaderForm v editaci hlavičky našeptává jen ze soupisky týmu, ne z globálního /search; Elo bere ze soupisky)

When adding a new feature, write a spec doc here before implementation so future Claude sessions have the context.
