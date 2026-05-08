# PGN Base — Technical Specification (MVP)

## 1. Tech Stack

### Frontend
- **React 18** + **TypeScript**
- **Vite** — build tool
- **React Router v6** — routing
- **Chessground** — šachovnice (lichess open source komponenta)
- **chess.js** — validace tahů, FEN generování, PGN parsing
- **Stockfish WASM** — šachový engine v prohlížeči (Web Worker)
- **TanStack Query** — server state management, caching
- **Zustand** — client state (aktuální partie, pozice na šachovnici)

### Backend
- **Cloudflare Workers** — serverless API (TypeScript)
- **Cloudflare D1** — SQLite databáze na edge
- **Cloudflare Pages** — hosting frontendu
- **Hono** — lightweight web framework pro Workers

### Auth
- **Google OAuth 2.0** — implementováno přímo ve Workers
- JWT tokeny: v produkci `Authorization: Bearer` header + localStorage (cross-domain cookies nefungují mezi workers.dev a pages.dev), v dev httpOnly cookie

---

## 2. Struktura projektu

```
pgn-base/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Board/          # Chessground wrapper (ResizeObserver pro rozměry)
│   │   │   ├── MoveList/       # Seznam tahů s variantami, komentáři, NAG
│   │   │   ├── Analysis/       # Stockfish panel (toggle, hloubka, PV)
│   │   │   ├── OpeningExplorer/# Lichess Cloud Eval panel
│   │   │   ├── ImportDialog.tsx # PGN import (soubor + textarea)
│   │   │   ├── Layout.tsx      # Header s navigací a uživatelem
│   │   │   └── ProtectedRoute.tsx # Auth guard
│   │   ├── pages/
│   │   │   ├── Login.tsx       # Google OAuth + dev-login + token z hash
│   │   │   ├── Databases.tsx   # Seznam vlastních DB s CRUD
│   │   │   ├── DatabaseDetail.tsx # Tabulka partií, import, export
│   │   │   ├── GameViewer.tsx  # Šachovnice + tahy + analýza + sidebar
│   │   │   ├── PublicDatabases.tsx
│   │   │   ├── PublicDatabase.tsx
│   │   │   ├── PublicGameViewer.tsx
│   │   │   └── NotFound.tsx
│   │   ├── hooks/
│   │   │   ├── useAuth.ts      # Auth stav, login/logout
│   │   │   ├── useStockfish.ts # Web Worker, UCI protokol
│   │   │   └── useOpeningExplorer.ts # Lichess Cloud Eval API
│   │   ├── lib/
│   │   │   ├── pgn.ts          # splitPgn, parseHeaders, extractMoveText
│   │   │   ├── moveTree.ts     # Vlastní PGN parser → strom tahů s FEN
│   │   │   ├── api.ts          # Fetch wrapper, API_ORIGIN (dev/prod)
│   │   │   └── auth.ts         # localStorage token management
│   │   └── store/
│   │       └── gameStore.ts    # Zustand: move tree, path navigace
│   ├── public/
│   │   └── stockfish-18-single.{js,wasm}  # gitignored, z npm
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.ts         # Google OAuth + JWT + dev-login
│   │   │   ├── databases.ts    # CRUD databází
│   │   │   ├── games.ts        # Import, seznam, detail, smazání, export
│   │   │   └── public.ts       # Veřejné endpointy (bez auth)
│   │   ├── middleware/
│   │   │   └── auth.ts         # Bearer header / cookie → user
│   │   ├── lib/
│   │   │   ├── jwt.ts          # HMAC-SHA256 sign/verify (Web Crypto)
│   │   │   └── pgn.ts          # buildPgn, stripMoveText
│   │   ├── db/
│   │   │   ├── schema.sql
│   │   │   └── seed.sql
│   │   ├── types.ts            # Bindings, User, AppEnv
│   │   └── index.ts            # Hono app entry + CORS
│   ├── wrangler.toml
│   ├── .dev.vars               # gitignored, lokální secrets
│   └── package.json
│
├── docs/
│   ├── pgn-base-prd.md
│   ├── pgn-base-spec.md
│   ├── PLAN.md
│   └── feat-game-sidebar-navigation.md
│
├── CLAUDE.md
└── .gitignore
```

---

## 3. Databázové schéma (D1 / SQLite)

```sql
CREATE TABLE users (
  id          TEXT PRIMARY KEY,        -- UUID
  email       TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  avatar_url  TEXT,
  role        TEXT DEFAULT 'user',     -- 'user' | 'admin'
  created_at  INTEGER NOT NULL         -- Unix timestamp
);

CREATE TABLE databases (
  id          TEXT PRIMARY KEY,        -- UUID
  owner_id    TEXT NOT NULL REFERENCES users(id),
  name        TEXT NOT NULL,
  description TEXT,
  is_public   INTEGER DEFAULT 0,       -- 0 = private, 1 = public
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE games (
  id          TEXT PRIMARY KEY,        -- UUID
  database_id TEXT NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
  -- PGN hlavičky jako sloupce (pro filtrování a řazení)
  event       TEXT,
  site        TEXT,
  date        TEXT,                    -- formát YYYY.MM.DD
  round       TEXT,
  board       TEXT,
  white       TEXT,
  black       TEXT,
  white_elo   INTEGER,
  black_elo   INTEGER,
  white_team  TEXT,
  black_team  TEXT,
  result      TEXT,                    -- '1-0' | '0-1' | '1/2-1/2' | '*'
  eco         TEXT,
  -- Celý movetext jako blob (včetně komentářů, variant, NAG)
  moves_pgn   TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Indexy pro výkon
CREATE INDEX idx_games_database_id ON games(database_id);
CREATE INDEX idx_games_white ON games(white COLLATE NOCASE);
CREATE INDEX idx_games_black ON games(black COLLATE NOCASE);
CREATE INDEX idx_games_date ON games(date);
CREATE INDEX idx_databases_owner ON databases(owner_id);
CREATE INDEX idx_databases_public ON databases(is_public);
```

---

## 4. API Endpointy

Všechny endpointy pod `/api/v1/`. Autentizované endpointy vyžadují platné JWT v `Authorization: Bearer` header (produkce) nebo cookie (dev).

### Auth
```
GET  /api/v1/auth/google           # Redirect na Google OAuth
GET  /api/v1/auth/callback         # Google OAuth callback → redirect s tokenem v URL hash
POST /api/v1/auth/dev-login        # Dev-only: přihlášení jako seed uživatel, vrací { user, token }
POST /api/v1/auth/logout           # Odhlášení
GET  /api/v1/auth/me               # Aktuální uživatel
```

### Databases
```
GET    /api/v1/databases           # Seznam vlastních databází
POST   /api/v1/databases           # Vytvořit databázi
PATCH  /api/v1/databases/:id       # Přejmenovat / změnit popis / viditelnost
DELETE /api/v1/databases/:id       # Smazat databázi

GET    /api/v1/public/databases              # Seznam veřejných databází (bez auth)
GET    /api/v1/public/databases/:id          # Detail veřejné databáze (bez auth)
GET    /api/v1/public/databases/:id/games    # Seznam partií veřejné DB (bez auth)
GET    /api/v1/public/databases/:id/games/:gameId  # Detail partie veřejné DB
GET    /api/v1/public/databases/:id/export   # Export veřejné DB jako PGN
GET    /api/v1/public/databases/:id/games/:gameId/export  # Export partie veřejné DB
```

### Games
```
GET    /api/v1/databases/:id/games          # Seznam partií (s filtrováním, stránkováním)
POST   /api/v1/databases/:id/games          # Přidat partie (import PGN)
GET    /api/v1/databases/:id/games/:gameId  # Detail partie
DELETE /api/v1/databases/:id/games/:gameId  # Smazat partii
GET    /api/v1/databases/:id/export         # Export celé databáze jako PGN

# Query parametry pro GET /games:
# ?q=novak          fulltext search přes white + black
# ?page=1           stránkování (výchozí: 1)
# ?limit=25         počet výsledků (výchozí: 25, max: 100)
# ?sort=date        řazení (date | white | black | result)
# ?order=desc       směr řazení (asc | desc)
```

### Export query parametry
```
GET /api/v1/databases/:id/export?mode=full     # Plné PGN
GET /api/v1/databases/:id/export?mode=stripped # Pouze tahy
GET /api/v1/databases/:id/games/:gameId/export?mode=full
```

---

## 5. Autentizační flow

```
1. Uživatel klikne "Přihlásit se přes Google"
2. Frontend naviguje na GET /api/v1/auth/google (workers.dev)
3. Worker vygeneruje state (CSRF ochrana), uloží do cookie, redirect na Google
4. Google → GET /api/v1/auth/callback?code=...&state=...
5. Worker ověří state, vymění code za access token u Google
6. Worker fetchne profil uživatele (email, jméno, avatar)
7. Worker uloží/aktualizuje uživatele v D1
8. Worker vygeneruje JWT (podepsané HMAC-SHA256, platnost 7 dní)
9. Produkce: redirect na frontend /login#token=JWT (token v URL hash)
   Dev: JWT uloží do httpOnly cookie, redirect na frontend /
10. Frontend přečte token z hash, uloží do localStorage, redirect na /
11. Všechny API requesty posílají Authorization: Bearer header
```

---

## 6. PGN parsing

**Implementováno:** Vlastní PGN parser (`frontend/src/lib/moveTree.ts`) — tokenizer + recursive descent parser. Používá **chess.js** pro validaci tahů a generování FEN. Produkuje stromovou strukturu `MoveNode[]` s FEN na každém uzlu.

Podporuje:
- Varianty (rekurzivní závorky)
- Komentáře `{ text }`
- NAG symboly `$1`–`$19` + inline anotace (`Nf3!`, `e5?!`)

Pro import (rozdělení multi-game PGN na jednotlivé partie) slouží `frontend/src/lib/pgn.ts`.

### Import flow
```
1. Uživatel nahraje soubor nebo vloží text
2. Frontend parsuje PGN → pole objektů {tags, moves_pgn}
3. Zobrazí preview: "Nalezeno N partií"
4. Uživatel potvrdí import
5. POST /api/v1/databases/:id/games s polem partií (batch)
6. Backend uloží každou partii jako samostatný řádek v D1
7. Frontend zobrazí výsledek: "Importováno N partií"
```

---

## 7. Stockfish integrace

**Implementováno:** Stockfish 18 WASM (single-threaded) z npm balíčku `stockfish`. V dev se načítá z `frontend/public/` (kopie z `node_modules`), v produkci z jsdelivr CDN (WASM soubor má 108MB, překračuje Pages limit 25MB).

Hook `useStockfish.ts` vytváří Web Worker a komunikuje přes UCI příkazy (`position fen`, `go depth N`, `stop`). Parsuje `info` řádky (depth, score cp/mate, pv).

---

## 8. Lichess Cloud Eval

**Poznámka:** Původní `explorer.lichess.ovh` Masters API vrací 401 (stav k 05/2025). Místo něj se používá Lichess Cloud Eval API.

```
GET https://lichess.org/api/cloud-eval?fen=<FEN>&multiPv=5
```

Response obsahuje:
- `pvs[]` — nejlepší pokračování s hodnocením (cp nebo mate)
- `depth` — hloubka analýzy
- `knodes` — počet prohledaných uzlů

V dev proxováno přes Vite (`/lichess-explorer` → `lichess.org/api`), v produkci voláno přímo. Cache přes TanStack Query (5 min stale).

---

## 9. Lokální vývoj na macOS

### Prerekvizity
```bash
node >= 18
npm >= 9
```

### Setup
```bash
# Klonování a instalace
git clone https://github.com/kareljukl/pgn-base
cd pgn-base

# Backend
cd backend && npm install

# Lokální D1 databáze
npm run db:reset

# Frontend
cd ../frontend && npm install
cp node_modules/stockfish/bin/stockfish-18-single.{js,wasm} public/
```

### Konfigurace
```
# backend/.dev.vars (gitignored)
GOOGLE_CLIENT_ID=...          # z Google Cloud Console
GOOGLE_CLIENT_SECRET=...      # z Google Cloud Console
JWT_SECRET=dev-secret-change-in-production
FRONTEND_URL=http://localhost:5173
```

### Spuštění
```bash
# Terminal 1 — backend
cd backend && npm run dev     # :8787 (restart: napsat `rs` + Enter)

# Terminal 2 — frontend
cd frontend && npm run dev    # :5173
```

### Google OAuth lokálně
V Google Cloud Console přidat `http://localhost:8787/api/v1/auth/callback` jako povolenou redirect URI. Bez nastavení reálných credentials lze testovat přes Dev Login tlačítko (přihlásí seed uživatele).

---

## 10. Deployment na Cloudflare

Produkční prostředí:
- **Worker:** https://pgn-base-api.kareljukl.workers.dev
- **Pages:** https://pgn-base.pages.dev
- **D1:** `pgn-base-db` (ID: `a9a08b8f-db2c-48ec-ba3c-20e4739eba14`, region EEUR)

### Secrets (již nastaveny)
```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put JWT_SECRET
wrangler secret put FRONTEND_URL    # https://pgn-base.pages.dev
```

### Deploy
```bash
# Backend (Worker)
cd backend && npx wrangler deploy

# Frontend (Pages)
cd frontend && npx vite build
rm -f dist/stockfish-18-single.*                    # příliš velký pro Pages (108MB > 25MB limit)
echo "/*  /index.html  200" > dist/_redirects       # SPA routing
npx wrangler pages deploy dist --project-name pgn-base --commit-dirty=true --commit-message="Deploy"
```

**Poznámky:**
- Stockfish WASM se v produkci načítá z jsdelivr CDN
- Pages deploy selže s non-ASCII commit messages — vždy použít `--commit-message` s ASCII textem
- CORS je dynamický — akceptuje `*.pages.dev`, `*.workers.dev` a `localhost`
- Google OAuth redirect URI v Google Console: `https://pgn-base-api.kareljukl.workers.dev/api/v1/auth/callback`

---

## 11. Limity a omezení MVP

| Limit | Hodnota |
|-------|---------|
| Max databází na uživatele | 50 |
| Max partií na databázi | neomezeno (D1 limit ~500MB) |
| Max velikost importovaného PGN | 10 MB |
| Max partií v jednom importu | 1000 |
| Stockfish hloubka analýzy | max 25 |
| Session veřejné databáze | do zavření/obnovení stránky |
