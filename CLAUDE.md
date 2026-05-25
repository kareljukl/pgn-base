# CLAUDE.md

PGN Base — chess database web app for club players. Code in English, UI in Czech.

- **Frontend:** https://pgn-base.pages.dev (Cloudflare Pages, React 18 + Vite)
- **Backend:** https://pgn-base-api.kareljukl.workers.dev (Cloudflare Worker + Hono + D1)
- **D1:** `pgn-base-db`, region EEUR, ID `a9a08b8f-db2c-48ec-ba3c-20e4739eba14`

Project layout: `backend/` and `frontend/` are independent npm projects. Vite proxies `/api` to the backend at `:8787` in dev. All API routes under `/api/v1/`. Backend routes live in `backend/src/routes/`, frontend pages in `frontend/src/pages/`, components in `frontend/src/components/`, hooks in `frontend/src/hooks/`, libs in `frontend/src/lib/`. Use `ls`/`grep` for the current inventory — don't ask me to maintain it here.

## Work style

**Verify UI changes before reporting done.** Pokud změna sahá na něco, co uživatel vidí nebo s tím interaguje (nová komponenta, upravený dialog, button, layout, nová column…), zavolej skill `verify` — spustí dev server, otevře feature v prohlížeči, screenshot — **před** hlášením „hotovo". `tsc --noEmit` dokazuje, že typy sedí, ne že feature funguje.

Výjimka: čistý backend / type-only refactor / docs / dep bump → `node_modules/.bin/tsc --noEmit` stačí.

## Commands

```bash
# Backend
cd backend
npm run dev                              # Wrangler dev :8787 (type `rs`+Enter to restart)
npm run db:reset                         # init + seed local D1
node_modules/.bin/tsc --noEmit           # type check (avoid `npx tsc` — cache EPERM)

# Frontend
cd frontend
npm install
cp node_modules/stockfish/bin/stockfish-18-single.{js,wasm} public/   # required after install
npm run dev                              # Vite :5173 (5174 if taken)
node_modules/.bin/tsc --noEmit
node_modules/.bin/vite build
```

### Deploy

```bash
# Backend
env -u https_proxy -u HTTPS_PROXY -u http_proxy -u HTTP_PROXY \
  npx wrangler deploy

# Frontend (Pages)
node_modules/.bin/vite build
rm -f dist/stockfish-18-single.*
echo "/*  /index.html  200" > dist/_redirects
env -u https_proxy -u HTTPS_PROXY -u http_proxy -u HTTP_PROXY \
  npx wrangler pages deploy dist --project-name pgn-base --commit-dirty=true \
  --commit-message="ASCII only"
```

### Dev login

`POST /api/v1/auth/dev-login` (dev-only) or "Dev Login" button on `/login`. Returns `{user, token}` → localStorage.

### Secrets (`backend/.dev.vars`, gitignored)

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`, `FRONTEND_URL`, `LICHESS_TOKEN`. `api.chess.cz` is anonymous.

## Gotchas (the stuff I'd otherwise get wrong)

- **Wrangler needs unset proxy.** Local HTTPS proxy blocks Cloudflare API → `Failed to fetch auth token`. Always prefix `env -u https_proxy -u HTTPS_PROXY -u http_proxy -u HTTP_PROXY` before `wrangler deploy` / `pages deploy` / `git push`.
- **`npx tsc` fails on EPERM** (root-owned npm cache). Use `node_modules/.bin/tsc --noEmit` directly.
- **Wrangler `dev` / `d1 execute`** need `dangerouslyDisableSandbox: true` (binds localhost).
- **Pages `--commit-message` must be ASCII.** Non-ASCII fails deploy silently.
- **Pages SPA routing**: must `echo "/*  /index.html  200" > dist/_redirects` before deploy.
- **Stockfish WASM (108 MB) > Pages 25 MB.** Build script removes it from `dist/`; production loads from unpkg CDN (`unpkg.com/stockfish@18.0.7/bin`), dev from `/public`.
- **D1 schema migrations**: `CREATE TABLE IF NOT EXISTS` won't add new columns. Use `ALTER TABLE` via `npx wrangler d1 execute pgn-base-db --local|--remote --command "..."`.
- **Cross-domain auth**: workers.dev ≠ pages.dev → third-party cookies blocked. Token via `Authorization: Bearer` + localStorage in prod; cookies only in dev. OAuth callback redirects to `/login#token=JWT`.
- **`api.chess.cz` brittle**: ~3 req/min before IP block (manifests as `connect timeout`, hours-long). All calls go through backend `/chesscz/*` proxies — atomic 10 s rate-limit gate, multi-tier D1 cache (`chesscz_player` 30 d, `chesscz_search` 7 d, `chesscz_cache` per-endpoint TTL). Frontend never calls `api.chess.cz` directly.

## Critical invariants (cross-file rules)

- **`moves_pgn` is raw text.** Backend never validates moves; parsing happens client-side via `lib/moveTree.ts`. Backend only computes `ply_count` via SAN regex on insert/update.
- **SAN localization is display-only.** Storage (D1, exports, chess.js) stays English; `formatSan(san, mode)` transforms only at render-time. Never round-trip.
- **Single PATCH endpoint** for game updates: `/databases/:dbId/games/:gameId` with `{ headers, movesPgn? }`. With `movesPgn` → updates moves + recomputes `ply_count`. Without → headers only. Same endpoint serves GameViewer's header panel and GameEditor's full edit.
- **ECO storage = code only** (`eco` column = `B12`). Opening name resolved client-side via `lib/ecoNames.ts` (bundled ~500 entries from lichess-org/chess-openings, CC0). After "Nahraj tahy", ECO is auto-detected via `lib/detectEco.ts` sampling FENs at plies 16/12/8/4 through `/explorer`.
- **Cloud eval > local Stockfish.** Single Analysis box; Lichess `/cloud-eval` wins when it has data, local engine pauses (`stopAnalysis()`) and resumes on cache miss.
- **Match mode trigger**: `database.import_source === 'chesscz'` + all four `chesscz_*` IDs present. Drives `HeaderForm` roster-only autocomplete (no global `/search` fallback) and `DatabaseDetail` zápasový view (Šach./Domácí/Hosté/Výsledek/Tahy/ECO). In match mode, ⟳ refresh on CzeId fills FideId/Elo but **never overwrites `{side}Team`** — league team name ≠ player's club name.
- **Variations in PGN parser**: when entering `(`, parser creates a new Chess instance from FEN **before** the preceding move (variation is an alternative to that move). Editor only consumes main line (`tree.moves`).
- **Board orientation** is local per page mount, resets to white on navigation, `⇅` toggles per session.
- **GameEditor dirty tracked per section** (`movesDirty` vs `headersDirty`) vs `initialMoves`/`initialHeaders` baseline. Drives Discard wording + Save enabled.
- **TanStack Query cache keys**: `['game', id, gameId]`, `['games', id]`, `['sidebar-games', dbId]`, `['database', id]`. After PATCH/POST/DELETE, invalidate the relevant subset.
- **Editor autosave** to localStorage every 60 s (when dirty). Keys: `pgn-base-draft-${dbId}` (create) / `pgn-base-draft-edit-${gameId}` (edit). `RestoreDraftDialog` on next mount.
- **Routes**: `/db/:id/game/new` must be declared before `/db/:id/game/:gameId` in React Router (specificity matters).

## Schema (D1 / SQLite)

Source of truth: `backend/src/db/schema.sql`. Seven tables: `users`, `databases`, `games`, `chesscz_player`, `chesscz_search`, `chesscz_rate`, `chesscz_cache`. PGN headers live as typed columns on `games` (21 of them) for filter/sort; the raw movetext is `moves_pgn`. ŠSČR import metadata lives on `databases` as `import_source` + `chesscz_comp_id` + `chesscz_round_nr` + `chesscz_home_team_id` + `chesscz_away_team_id`.

## Feature docs

`docs/feat-*.md` — per-feature spec / changelog, written when the feature lands. Filenames are self-describing (`feat-chesscz-roster-autocomplete.md`, `feat-engine-improvements.md`, …); look them up by name when working on that area. I should **not** maintain a TOC here — `ls docs/feat-*.md` is faster and never stale.

When adding a non-trivial feature, write a new `docs/feat-*.md` documenting decisions and edge cases. Update this CLAUDE.md **only** if the change introduces a new gotcha or invariant.
