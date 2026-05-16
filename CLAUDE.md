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

Secrets for local dev are in `backend/.dev.vars` (gitignored). Required vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`, `FRONTEND_URL`, `LICHESS_TOKEN`.

**Note:** After changing `database_id` in `wrangler.toml`, the local D1 SQLite file changes. Run `npm run db:reset` to recreate local data.

**Schema migrations:** `schema.sql` uses `CREATE TABLE IF NOT EXISTS`, so new columns added to an existing table won't apply via `db:reset`. For local dev either delete the SQLite file or run an explicit `ALTER TABLE` via `npx wrangler d1 execute pgn-base-db --local --command "..."`. For production, run the same `--remote` (see `docs/feat-game-editor-v2.md` for the FIDE/CzId column migration as an example).

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
- `databases` — list/create/update/delete user's databases
- `databases/:dbId/games` — GET list, POST batch import (returns `{ imported, ids }`)
- `databases/:dbId/games/:gameId` — GET / PATCH (headers + optional `movesPgn`) / DELETE
- `databases/:dbId/games/:gameId/export` and `databases/:dbId/export` — PGN download
- `public/databases/*` — read-only mirror for public DBs
- `explorer` — Lichess Masters API proxy (requires `LICHESS_TOKEN`)

## Architecture

Two separate npm projects: `backend/` and `frontend/`. Vite proxies `/api` to the backend at `:8787` in dev.

### Backend (`backend/src/`)
- **Hono** app with typed bindings (`types.ts: AppEnv`) — D1 database binding is `DB`
- `routes/auth.ts` — Google OAuth flow + JWT (HMAC-SHA256). In production: token returned via URL hash redirect (`/login#token=JWT`), stored in localStorage. In dev: cookie-based. Dev-login bypass returns token in response body.
- `routes/databases.ts` — CRUD for user's databases (auth required)
- `routes/games.ts` — game import (POST batch, max 1000, returns inserted IDs), list with filtering/sorting/pagination, single game, **PATCH for header + movetext updates**, delete, PGN export. PATCH body: `{ headers: Record<string,string>, movesPgn?: string }` — when `movesPgn` is provided, also updates `moves_pgn` and recomputes `ply_count` via `countPlies()`.
- `routes/public.ts` — read-only mirror of games/databases endpoints for public databases (no auth)
- `routes/explorer.ts` — proxy to Lichess Masters explorer (returns `opening.eco`/`opening.name` plus move statistics)
- `middleware/auth.ts` — checks `Authorization: Bearer` header first, then cookie fallback. Loads user from D1, sets `c.get('user')`
- `lib/jwt.ts` — JWT sign/verify using Web Crypto API (no external deps)
- `lib/pgn.ts` — `buildPgn()` assembles PGN from DB row (all 17 header columns + ply count + movetext), `stripMoveText()` removes comments/variations/NAGs, `countPlies()` counts half-moves via SAN regex

All API routes are under `/api/v1/`. Games routes are mounted on `/api/v1/databases` alongside database routes (via `/:dbId/games` patterns).

### Frontend (`frontend/src/`)

**Pages:**
- `Login.tsx`, `Databases.tsx`, `DatabaseDetail.tsx`
- `GameViewer.tsx` — playback + editable header panel ("Hlavička" toggle) + "Upravit partii" button to enter editor. Both toggle buttons disable while header panel is dirty.
- `GameEditor.tsx` — dual-mode (create / edit) editor. Mode detected from presence of `gameId` route param. Tracks `initialMoves` / `initialHeaders` to derive `movesDirty` / `headersDirty`; Save disabled when nothing changed, Discard confirm message branches on what's dirty. Edit mode fetches existing game (shares `['game', id, gameId]` query cache with GameViewer) and parses `moves_pgn` via `parseMoveText` (main line only).
- `PublicDatabases.tsx`, `PublicDatabase.tsx`, `PublicGameViewer.tsx` — public read-only mirror. Sidebar navigation works in both authenticated and public viewers via router state.

**Components:**
- `components/Board/Board.tsx` — read-only Chessground (used in GameViewer, PublicGameViewer, ReplaceConfirmModal mini-board). Optional `autoShapes` prop for engine arrow rendering.
- `components/Board/EditableBoard.tsx` — interactive Chessground for the editor with chess.js move validation, promotion dialog, and `autoShapes` support. `drawable.enabled: true` (allows engine arrows + user-drawn shapes on right-click).
- `components/GameEditor/` — `HeaderForm` (15-field PGN tag form, reused by both editor and GameViewer's Hlavička panel), `EditorMoveList`, `ReplaceMoveDialog` (inline + confirm modal with mini-board), `RestoreDraftDialog`.
- `components/Analysis/Analysis.tsx` — Stockfish panel with MultiPV (1–5), engine toggle, depth select, "Šipky" toggle. Rendered in GameViewer, PublicGameViewer, and GameEditor (both modes).
- `components/OpeningBook/OpeningBook.tsx` — Lichess Masters move statistics, gated by an ON/OFF toggle persisted in localStorage.
- `components/OpeningExplorer/OpeningExplorer.tsx` — Lichess Cloud Eval display.
- `components/ImportDialog.tsx` — PGN file/text import.

**Libs / hooks:**
- **Auth** (`lib/auth.ts`, `hooks/useAuth.ts`) — token stored in localStorage. In production, OAuth callback redirects to `/login#token=JWT`, Login page reads it from hash. All API requests include `Authorization: Bearer` header.
- **API client** (`lib/api.ts`) — `API_ORIGIN` switches between empty string (dev, via Vite proxy) and workers.dev URL (prod). Methods: `get`, `post`, `patch`, `delete`.
- **Custom PGN parser** (`lib/moveTree.ts`) — tokenizer + recursive descent parser producing a tree of `MoveNode[]` with FEN at each node. Supports nested variations `()`, comments `{}`, NAG symbols `$N`, inline annotations (`Nf3!`). Uses chess.js for move validation and FEN generation. Editor parses moves linearly (main line only) by reading `tree.moves`.
- **Editor PGN helpers** (`lib/editorPgn.ts`) — `EditorHeaders` type (15 fields), `emptyHeaders`, `headersFromGameRow`, `headersEqual`, `toApiHeaders`, `buildEditorMovesPgn`.
- **Zustand store** (`store/gameStore.ts`) — holds the move tree + current path. Path is `number[]`: `[moveIdx]` for main line, `[moveIdx, varIdx, moveIdx, ...]` for variations. Used by viewers (read-only); GameEditor maintains its own linear `moves` + `fens` + `cursor` state.
- **Chessground** board — requires explicit pixel dimensions (uses ResizeObserver). CSS imported in `main.tsx`. Drag cursor offset is fixed by clearing chessground's cached bounds on `mousedown`/`touchstart` capture in `EditableBoard`.
- **Stockfish** (`hooks/useStockfish.ts`) — in dev loads from `/public`, in production loads from unpkg CDN (`unpkg.com/stockfish@18.0.7/bin`). UCI protocol over postMessage. WASM files are gitignored. Tracks per-MultiPV evaluations in a `Map<index, eval>`, converts UCI PV to SAN via chess.js, persists settings (`multiPV`, `depth`, `arrows`) in `localStorage` under `pgn-base-engine-settings`.
- **Lichess Cloud Eval** (`hooks/useOpeningExplorer.ts`) — proxied through Vite in dev (`/lichess-explorer` → `lichess.org/api`), direct in production. Uses `/api/cloud-eval` (the public Masters API at `explorer.lichess.ovh` returns 401, so the backend `routes/explorer.ts` uses the authenticated Masters endpoint with `LICHESS_TOKEN`).
- **Editor ECO** (`hooks/useEditorEco.ts`) — sticky last-known ECO from `/api/v1/explorer`, debounce 300 ms. Used by GameEditor's header form.
- **GameViewer sidebar** — when navigating from DatabaseDetail, router state passes query context (`filter`, `sort`, `order`, `dbId`, `dbName`). Sidebar fetches its own game list from API with same parameters and independent pagination.
- **TanStack Query** for all API calls. Shared cache keys: `['game', id, gameId]` (single game), `['games', id]` (DatabaseDetail list), `['sidebar-games', dbId]` (viewer sidebar). After PATCH/POST/DELETE, mutations invalidate all three so GameViewer, sidebar, and list refresh together.
- **React Router v6** for routing.

**Drafts:** Editor autosaves every minute to localStorage. Keys: `pgn-base-draft-${dbId}` (create mode) / `pgn-base-draft-edit-${gameId}` (edit mode). Restored via `RestoreDraftDialog` on next mount.

### Database schema (D1/SQLite)
Three tables: `users`, `databases`, `games`. The `games` table stores all PGN headers as typed columns (for filtering/sorting): `event`, `site`, `date`, `round`, `board`, `white`, `black`, `white_elo`, `black_elo`, `white_team`, `black_team`, `white_fide_id`, `black_fide_id`, `white_cz_id`, `black_cz_id`, `result`, `eco`, `ply_count` (computed from movetext on insert/update), plus `moves_pgn` for the raw movetext. See `backend/src/db/schema.sql`.

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

## Feature docs

Detailed feature specs live in `docs/`:
- `feat-game-editor.md` — interactive editor for creating new games (v1)
- `feat-game-editor-v2.md` — FIDE/ČŠS ID columns and PlyCount tag
- `feat-game-edit.md` — editing existing games via shared GameEditor
- `feat-engine-improvements.md` — MultiPV, SAN PV, board arrows for Stockfish

When adding a new feature, write a spec doc here before implementation so future Claude sessions have the context.
