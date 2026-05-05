# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PGN Base — chess database web app for club players. Code in English, UI in Czech.

## Commands

### Backend (Cloudflare Worker + Hono + D1)
```bash
cd backend
npm run dev          # Wrangler dev server on :8787
npm run db:init      # Create D1 tables locally
npm run db:seed      # Insert test data (dev user + 3 sample games)
npm run db:reset     # init + seed combined
```

Secrets for local dev are in `backend/.dev.vars` (gitignored). Required vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`, `FRONTEND_URL`.

### Frontend (React 18 + Vite)
```bash
cd frontend
npm install
cp node_modules/stockfish/bin/stockfish-18-single.{js,wasm} public/  # required after install
npm run dev          # Vite dev server on :5173
npx tsc --noEmit     # type check
npx vite build       # production build
```

### Testing auth locally
Use `POST /api/v1/auth/dev-login` (dev-only endpoint) — logs in as the seed user without Google OAuth. The Login page shows a "Dev Login" button in dev mode.

## Architecture

Two separate npm projects: `backend/` and `frontend/`. Vite proxies `/api` to the backend at `:8787`.

### Backend (`backend/src/`)
- **Hono** app with typed bindings (`types.ts: AppEnv`) — D1 database binding is `DB`
- `routes/auth.ts` — Google OAuth flow + JWT (HMAC-SHA256) in httpOnly cookie + dev-login bypass
- `routes/databases.ts` — CRUD for user's databases (auth required)
- `routes/games.ts` — game import (batch), list with filtering/sorting/pagination, single game, delete, PGN export
- `routes/public.ts` — mirrors games/databases endpoints for public databases (no auth), includes export
- `middleware/auth.ts` — verifies JWT cookie, loads user from D1, sets `c.get('user')`
- `lib/jwt.ts` — JWT sign/verify using Web Crypto API (no external deps)
- `lib/pgn.ts` — `buildPgn()` assembles PGN from DB row, `stripMoveText()` removes comments/variations/NAGs

All API routes are under `/api/v1/`. Auth routes don't share prefix with databases — games routes are mounted on `/api/v1/databases` alongside database routes (via `/:dbId/games` patterns).

### Frontend (`frontend/src/`)
- **Custom PGN parser** (`lib/moveTree.ts`) — tokenizer + recursive descent parser that produces a tree of `MoveNode[]` with FEN at each node. Supports nested variations `()`, comments `{}`, NAG symbols `$N`, inline annotations (`Nf3!`). This is the core of the app — not using any external PGN parsing library.
- **Zustand store** (`store/gameStore.ts`) — holds the move tree + current path. Path is `number[]`: `[moveIdx]` for main line, `[moveIdx, varIdx, moveIdx, ...]` for variations. All navigation (forward/back/start/end/jump) updates the path and derives FEN.
- **Chessground** board (`components/Board/`) — requires explicit pixel dimensions (uses ResizeObserver). CSS imported in `main.tsx`.
- **Stockfish** (`hooks/useStockfish.ts`) — loads `stockfish-18-single.js` from `/public` as a Web Worker. UCI protocol over postMessage. WASM files are gitignored (copied from `node_modules/stockfish` after install).
- **Lichess Cloud Eval** (`hooks/useOpeningExplorer.ts`) — proxied through Vite (`/lichess-explorer` → `lichess.org/api`). Note: the traditional `explorer.lichess.ovh` Masters API returns 401 as of May 2025.
- **TanStack Query** for all API calls, **React Router v6** for routing.
- Auth state via `hooks/useAuth.ts` (calls `/auth/me`). Protected routes wrapped in `ProtectedRoute` component.
- Public routes (`/public/*`) duplicate viewer functionality but hit `/api/v1/public/` endpoints (no auth).

### Database schema (D1/SQLite)
Three tables: `users`, `databases`, `games`. Games store PGN headers as columns (for filtering/sorting) and full movetext in `moves_pgn`. See `backend/src/db/schema.sql`.

## Key Design Decisions
- PGN movetext is stored as raw text, parsed on the frontend only when viewing. No server-side move validation.
- Variations in the PGN parser: when encountering `(`, the parser creates a new Chess instance from the FEN **before** the preceding move (the variation is an alternative to that move).
- JWT tokens are in httpOnly cookies (not localStorage). The `dev-login` endpoint only works when `FRONTEND_URL` contains `localhost`.
- Export uses `Content-Disposition: attachment` to trigger download. Stripped mode removes comments, variations, and NAGs via simple character-level parsing.
