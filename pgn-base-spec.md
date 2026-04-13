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
- JWT tokeny uložené v httpOnly cookie

---

## 2. Struktura projektu

```
pgn-base/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Board/          # Chessground wrapper
│   │   │   ├── MoveList/       # Seznam tahů s variantami
│   │   │   ├── Analysis/       # Stockfish panel
│   │   │   ├── OpeningExplorer/# Lichess API panel
│   │   │   ├── GameList/       # Tabulka partií
│   │   │   ├── DatabaseList/   # Seznam databází
│   │   │   └── Import/         # PGN import dialog
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Databases.tsx
│   │   │   ├── DatabaseDetail.tsx
│   │   │   ├── GameViewer.tsx
│   │   │   └── PublicDatabase.tsx
│   │   ├── workers/
│   │   │   └── stockfish.worker.ts
│   │   ├── hooks/
│   │   │   ├── useStockfish.ts
│   │   │   ├── useChessGame.ts
│   │   │   └── useOpeningExplorer.ts
│   │   ├── lib/
│   │   │   ├── pgn.ts          # PGN parse/serialize utilities
│   │   │   ├── api.ts          # API client
│   │   │   └── chess.ts        # chess.js helpers
│   │   └── store/
│   │       └── gameStore.ts    # Zustand store
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── databases.ts
│   │   │   └── games.ts
│   │   ├── middleware/
│   │   │   └── auth.ts
│   │   ├── db/
│   │   │   ├── schema.sql
│   │   │   └── queries.ts
│   │   └── index.ts            # Hono app entry
│   ├── wrangler.toml
│   └── package.json
│
└── README.md
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

Všechny endpointy pod `/api/v1/`. Autentizované endpointy vyžadují platné JWT v cookie.

### Auth
```
GET  /api/v1/auth/google           # Redirect na Google OAuth
GET  /api/v1/auth/callback         # Google OAuth callback
POST /api/v1/auth/logout           # Odhlášení
GET  /api/v1/auth/me               # Aktuální uživatel
```

### Databases
```
GET    /api/v1/databases           # Seznam vlastních databází
POST   /api/v1/databases           # Vytvořit databázi
PATCH  /api/v1/databases/:id       # Přejmenovat / změnit popis / viditelnost
DELETE /api/v1/databases/:id       # Smazat databázi

GET    /api/v1/public/databases    # Seznam veřejných databází (bez auth)
GET    /api/v1/public/databases/:id # Detail veřejné databáze (bez auth)
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
2. Frontend → GET /api/v1/auth/google
3. Worker vygeneruje state (CSRF ochrana), uloží do KV, redirect na Google
4. Google → GET /api/v1/auth/callback?code=...&state=...
5. Worker ověří state, vymění code za access token u Google
6. Worker fetchne profil uživatele (email, jméno, avatar)
7. Worker uloží/aktualizuje uživatele v D1
8. Worker vygeneruje JWT (podepsané HMAC-SHA256, platnost 7 dní)
9. JWT uloží do httpOnly, Secure, SameSite=Lax cookie
10. Redirect na frontend /
```

---

## 6. PGN parsing

Použít **chess.js** pro:
- Parsování PGN textu → seznam partií
- Generování FEN po každém tahu
- Validaci tahů při importu

Pro kompletní PGN s variantami a komentáři chess.js nestačí — varianty jsou uloženy jako raw string v `moves_pgn`, pro zobrazení je potřeba vlastní parser nebo knihovna **pgn-parser** (npm).

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

```typescript
// frontend/src/workers/stockfish.worker.ts
// Stockfish běží v samostatném Web Workeru

// Komunikace přes postMessage:
// → { type: 'position', fen: string }
// → { type: 'go', depth: number }
// → { type: 'stop' }
// ← { type: 'info', depth, score, pv: string[] }
// ← { type: 'bestmove', move: string }
```

Doporučený zdroj: `stockfish.wasm` z npm balíčku `stockfish` nebo CDN.

---

## 8. Lichess Opening Explorer

Veřejné API, bez API klíče, rate limit ~5 req/s.

```
GET https://explorer.lichess.ovh/masters?fen=<FEN>&moves=20
```

Response obsahuje:
- `moves[]` — seznam tahů s počtem partií a % výher
- `topGames[]` — příklady master partií z dané pozice

Volat při každé změně pozice na šachovnici, s debounce 300ms.

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

# Frontend
cd frontend && npm install

# Backend
cd ../backend && npm install
npm install -g wrangler

# Lokální D1 databáze
wrangler d1 create pgn-base-local --local
wrangler d1 execute pgn-base-local --local --file=src/db/schema.sql
```

### Spuštění
```bash
# Terminal 1 — backend (Cloudflare Worker lokálně)
cd backend && wrangler dev

# Terminal 2 — frontend
cd frontend && npm run dev
```

Backend poběží na `http://localhost:8787`, frontend na `http://localhost:5173`.

### Google OAuth lokálně
Pro lokální OAuth je potřeba v Google Cloud Console přidat `http://localhost:8787/api/v1/auth/callback` jako povolenou redirect URI. Credentials (Client ID, Client Secret) se nastaví přes `.dev.vars` soubor (gitignored).

```
# backend/.dev.vars
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
JWT_SECRET=...
```

---

## 10. Deployment na Cloudflare

```bash
# Vytvoření D1 databáze
wrangler d1 create pgn-base-prod
wrangler d1 execute pgn-base-prod --file=src/db/schema.sql

# Nastavení secrets
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put JWT_SECRET

# Deploy backend (Worker)
cd backend && wrangler deploy

# Deploy frontend (Pages)
cd frontend && npm run build
wrangler pages deploy dist
```

---

## 11. Limity a omezení MVP

| Limit | Hodnota |
|-------|---------|
| Max databází na uživatele | 50 |
| Max partií na databázi | neomezeno (D1 limit ~500MB) |
| Max velikost importovaného PGN | 10 MB |
| Max partií v jednom importu | 500 |
| Stockfish hloubka analýzy | max 25 |
| Session veřejné databáze | do zavření/obnovení stránky |
