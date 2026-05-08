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

Secrets for local dev are in `backend/.dev.vars` (gitignored). Required vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`, `FRONTEND_URL`.

**Note:** After changing `database_id` in `wrangler.toml`, the local D1 SQLite file changes. Run `npm run db:reset` to recreate local data.

### Frontend (React 18 + Vite)
```bash
cd frontend
npm install
cp node_modules/stockfish/bin/stockfish-18-single.{js,wasm} public/  # required after install
npm run dev          # Vite dev server on :5173
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

## Architecture

Two separate npm projects: `backend/` and `frontend/`. Vite proxies `/api` to the backend at `:8787` in dev.

### Backend (`backend/src/`)
- **Hono** app with typed bindings (`types.ts: AppEnv`) — D1 database binding is `DB`
- `routes/auth.ts` — Google OAuth flow + JWT (HMAC-SHA256). In production: token returned via URL hash redirect (`/login#token=JWT`), stored in localStorage. In dev: cookie-based. Dev-login bypass returns token in response body.
- `routes/databases.ts` — CRUD for user's databases (auth required)
- `routes/games.ts` — game import (batch, max 1000), list with filtering/sorting/pagination, single game, delete, PGN export
- `routes/public.ts` — mirrors games/databases endpoints for public databases (no auth), includes game list/detail and export
- `middleware/auth.ts` — checks `Authorization: Bearer` header first, then cookie fallback. Loads user from D1, sets `c.get('user')`
- `lib/jwt.ts` — JWT sign/verify using Web Crypto API (no external deps)
- `lib/pgn.ts` — `buildPgn()` assembles PGN from DB row, `stripMoveText()` removes comments/variations/NAGs

All API routes are under `/api/v1/`. Games routes are mounted on `/api/v1/databases` alongside database routes (via `/:dbId/games` patterns).

### Frontend (`frontend/src/`)
- **Auth** (`lib/auth.ts`, `hooks/useAuth.ts`) — token stored in localStorage. In production, OAuth callback redirects to `/login#token=JWT`, Login page reads it from hash. All API requests include `Authorization: Bearer` header.
- **API client** (`lib/api.ts`) — `API_ORIGIN` switches between empty string (dev, via Vite proxy) and workers.dev URL (prod).
- **Custom PGN parser** (`lib/moveTree.ts`) — tokenizer + recursive descent parser producing a tree of `MoveNode[]` with FEN at each node. Supports nested variations `()`, comments `{}`, NAG symbols `$N`, inline annotations (`Nf3!`). Uses chess.js for move validation and FEN generation.
- **Zustand store** (`store/gameStore.ts`) — holds the move tree + current path. Path is `number[]`: `[moveIdx]` for main line, `[moveIdx, varIdx, moveIdx, ...]` for variations.
- **Chessground** board (`components/Board/`) — requires explicit pixel dimensions (uses ResizeObserver). CSS imported in `main.tsx`.
- **Stockfish** (`hooks/useStockfish.ts`) — in dev loads from `/public`, in production loads from jsdelivr CDN. UCI protocol over postMessage. WASM files are gitignored.
- **Lichess Cloud Eval** (`hooks/useOpeningExplorer.ts`) — proxied through Vite in dev (`/lichess-explorer` → `lichess.org/api`), direct in production. Note: `explorer.lichess.ovh` Masters API returns 401, using `/api/cloud-eval` instead.
- **GameViewer sidebar** — when navigating from DatabaseDetail, router state passes query context (`filter`, `sort`, `order`, `dbId`, `dbName`). Sidebar fetches its own game list from API with same parameters and independent pagination.
- **TanStack Query** for all API calls, **React Router v6** for routing.
- Public routes (`/public/*`) duplicate viewer functionality but hit `/api/v1/public/` endpoints (no auth).

### Database schema (D1/SQLite)
Three tables: `users`, `databases`, `games`. Games store PGN headers as columns (for filtering/sorting) and full movetext in `moves_pgn`. See `backend/src/db/schema.sql`.

## Key Design Decisions
- PGN movetext is stored as raw text, parsed on the frontend only when viewing. No server-side move validation.
- Variations in the PGN parser: when encountering `(`, the parser creates a new Chess instance from the FEN **before** the preceding move (the variation is an alternative to that move).
- Cross-domain auth: workers.dev and pages.dev are different domains — third-party cookies are blocked by browsers. Solution: token-based auth via `Authorization` header + localStorage (production), cookies (dev only).
- Export links use `API_ORIGIN` prefix to point directly to the Worker URL in production.
- Stockfish WASM (108MB) exceeds Pages 25MB file limit — served from jsdelivr CDN in production, from local `/public` in dev.
- Cloudflare Pages deploy requires ASCII commit messages (`--commit-message` flag).
