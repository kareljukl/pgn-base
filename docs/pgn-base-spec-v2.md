# PGN Base — Technical Specification v2

Aktualizovaná verze `pgn-base-spec.md` reflektující stav projektu po MVP — přibyl interaktivní editor partií (create + edit), editace hlaviček z viewru, MultiPV Stockfish s šipkami, Opening Book přes Lichess Masters, FIDE/ČŠS ID sloupce a `ply_count`, GoatCounter analytika.

## 1. Tech Stack

### Frontend
- **React 18** + **TypeScript**
- **Vite** — build tool
- **React Router v6** — routing
- **Chessground** — šachovnice (lichess open source komponenta)
- **chess.js** — validace tahů, FEN generování, PGN parsing
- **Stockfish 18 WASM** — šachový engine (Web Worker, single-thread)
- **TanStack Query** — server state management, caching
- **Zustand** — client state (current move tree, navigation path) — používá jen viewer

### Backend
- **Cloudflare Workers** — serverless API (TypeScript)
- **Cloudflare D1** — SQLite databáze na edge
- **Cloudflare Pages** — hosting frontendu
- **Hono** — lightweight web framework pro Workers

### Auth
- **Google OAuth 2.0** — implementováno přímo ve Workers
- JWT tokeny: v produkci `Authorization: Bearer` header + localStorage (cross-domain cookies nefungují mezi workers.dev a pages.dev), v dev httpOnly cookie

### Analytics
- **GoatCounter** — `<script data-goatcounter=...>` snippet v `frontend/index.html`

---

## 2. Struktura projektu

```
pgn-base/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Board/
│   │   │   │   ├── Board.tsx              # Read-only Chessground (viewers, mini-board)
│   │   │   │   └── EditableBoard.tsx      # Interaktivní + promotion dialog + autoShapes
│   │   │   ├── MoveList/                  # Seznam tahů s variantami, komentáři, NAG
│   │   │   ├── Analysis/
│   │   │   │   └── Analysis.tsx           # Stockfish: MultiPV, depth, šipky
│   │   │   ├── OpeningExplorer/           # Lichess Cloud Eval panel
│   │   │   ├── OpeningBook/
│   │   │   │   └── OpeningBook.tsx        # Lichess Masters statistiky (toggle ON/OFF)
│   │   │   ├── GameEditor/
│   │   │   │   ├── HeaderForm.tsx         # 15-polní PGN tag formulář (sdílený editor i Hlavička)
│   │   │   │   ├── EditorMoveList.tsx     # Lineární seznam SAN tahů
│   │   │   │   ├── ReplaceMoveDialog.tsx  # Inline volby + confirm s mini-boardem
│   │   │   │   └── RestoreDraftDialog.tsx # Obnovení autosave draftu
│   │   │   ├── ImportDialog.tsx           # PGN import (soubor + textarea)
│   │   │   ├── Layout.tsx                 # Header s navigací a uživatelem
│   │   │   └── ProtectedRoute.tsx         # Auth guard
│   │   ├── pages/
│   │   │   ├── Login.tsx                  # Google OAuth + dev-login + token z hash
│   │   │   ├── Databases.tsx              # Seznam vlastních DB s CRUD
│   │   │   ├── DatabaseDetail.tsx         # Tabulka partií, import, export, + Nová partie
│   │   │   ├── GameViewer.tsx             # Šachovnice + tahy + analýza + sidebar + Hlavička panel + Upravit partii
│   │   │   ├── GameEditor.tsx             # Duální create / edit režim
│   │   │   ├── PublicDatabases.tsx
│   │   │   ├── PublicDatabase.tsx
│   │   │   ├── PublicGameViewer.tsx       # Sidebar navigace (z PublicDatabase)
│   │   │   └── NotFound.tsx
│   │   ├── hooks/
│   │   │   ├── useAuth.ts                 # Auth stav, login/logout
│   │   │   ├── useStockfish.ts            # MultiPV, UCI + SAN konverze, localStorage settings
│   │   │   ├── useOpeningExplorer.ts      # Lichess Cloud Eval (přes Vite proxy v dev)
│   │   │   ├── useOpeningBook.ts          # Backend explorer endpoint (Masters)
│   │   │   └── useEditorEco.ts            # Sticky ECO z explorer API (debounce 300 ms)
│   │   ├── lib/
│   │   │   ├── pgn.ts                     # splitPgn, parseHeaders, extractMoveText
│   │   │   ├── moveTree.ts                # Vlastní PGN parser → strom tahů s FEN
│   │   │   ├── editorPgn.ts               # EditorHeaders, headersFromGameRow, headersEqual, toApiHeaders, buildEditorMovesPgn
│   │   │   ├── api.ts                     # Fetch wrapper, API_ORIGIN, get/post/patch/delete
│   │   │   └── auth.ts                    # localStorage token management
│   │   └── store/
│   │       └── gameStore.ts               # Zustand: move tree, path navigace (jen viewers)
│   ├── public/
│   │   └── stockfish-18-single.{js,wasm}  # gitignored, kopie z node_modules
│   ├── index.html                         # + GoatCounter snippet
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.ts                    # Google OAuth + JWT + dev-login
│   │   │   ├── databases.ts               # CRUD databází
│   │   │   ├── games.ts                   # Import (POST → ids), list, detail, PATCH, delete, export
│   │   │   ├── public.ts                  # Veřejné read-only endpointy
│   │   │   └── explorer.ts                # Proxy na Lichess Masters API (vyžaduje LICHESS_TOKEN)
│   │   ├── middleware/
│   │   │   └── auth.ts                    # Bearer header / cookie → user
│   │   ├── lib/
│   │   │   ├── jwt.ts                     # HMAC-SHA256 sign/verify (Web Crypto)
│   │   │   └── pgn.ts                     # buildPgn, stripMoveText, countPlies
│   │   ├── db/
│   │   │   ├── schema.sql
│   │   │   └── seed.sql
│   │   ├── types.ts                       # Bindings, User, AppEnv
│   │   └── index.ts                       # Hono app entry + CORS
│   ├── wrangler.toml
│   ├── .dev.vars                          # gitignored, lokální secrets
│   └── package.json
│
├── docs/
│   ├── pgn-base-prd.md
│   ├── pgn-base-spec.md                   # Původní MVP spec
│   ├── pgn-base-spec-v2.md                # Tento dokument
│   ├── PLAN.md
│   ├── feat-game-sidebar-navigation.md
│   ├── feat-game-editor.md                # Vytváření partií od nuly (v1)
│   ├── feat-game-editor-v2.md             # FIDE/CzId sloupce + PlyCount
│   ├── feat-game-edit.md                  # Editace existujících partií
│   └── feat-engine-improvements.md        # MultiPV, SAN, šipky
│
├── CLAUDE.md
└── .gitignore
```

---

## 3. Databázové schéma (D1 / SQLite)

```sql
CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  avatar_url  TEXT,
  role        TEXT DEFAULT 'user',         -- 'user' | 'admin'
  created_at  INTEGER NOT NULL
);

CREATE TABLE databases (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id),
  name        TEXT NOT NULL,
  description TEXT,
  is_public   INTEGER DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE games (
  id             TEXT PRIMARY KEY,
  database_id    TEXT NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
  -- PGN hlavičky jako sloupce (pro filtrování a řazení)
  event          TEXT,
  site           TEXT,
  date           TEXT,                     -- formát YYYY.MM.DD
  round          TEXT,
  board          TEXT,
  white          TEXT,
  black          TEXT,
  white_elo      INTEGER,
  black_elo      INTEGER,
  white_team     TEXT,
  black_team     TEXT,
  white_fide_id  TEXT,                     -- v2: FIDE identifikátor
  black_fide_id  TEXT,
  white_cz_id    TEXT,                     -- v2: ČŠS identifikátor
  black_cz_id    TEXT,
  result         TEXT,                     -- '1-0' | '0-1' | '1/2-1/2' | '*'
  eco            TEXT,
  ply_count      INTEGER,                  -- v2: počet půltahů (computed na backendu)
  moves_pgn      TEXT NOT NULL DEFAULT '',
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE INDEX idx_games_database_id ON games(database_id);
CREATE INDEX idx_games_white ON games(white COLLATE NOCASE);
CREATE INDEX idx_games_black ON games(black COLLATE NOCASE);
CREATE INDEX idx_games_date ON games(date);
CREATE INDEX idx_databases_owner ON databases(owner_id);
CREATE INDEX idx_databases_public ON databases(is_public);
```

**Migrace v2 sloupců do existující produkční D1** (`CREATE TABLE IF NOT EXISTS` nepřidá sloupce do existující tabulky):

```bash
cd backend
for COL in "white_fide_id TEXT" "black_fide_id TEXT" "white_cz_id TEXT" "black_cz_id TEXT" "ply_count INTEGER"; do
  npx wrangler d1 execute pgn-base-db --remote --command "ALTER TABLE games ADD COLUMN $COL"
done
```

`ply_count` se nedopočítává automaticky pro existující záznamy — zůstává `NULL` dokud partie nepřijde přes POST/PATCH s `movesPgn`.

---

## 4. API Endpointy

Všechny pod `/api/v1/`. Autentizované vyžadují `Authorization: Bearer` header (produkce) nebo cookie (dev).

### Auth
```
GET  /api/v1/auth/google           # Redirect na Google OAuth
GET  /api/v1/auth/callback         # OAuth callback → redirect s tokenem v URL hash
POST /api/v1/auth/dev-login        # Dev-only: přihlášení jako seed uživatel
POST /api/v1/auth/logout           # Odhlášení
GET  /api/v1/auth/me               # Aktuální uživatel
```

### Databases
```
GET    /api/v1/databases
POST   /api/v1/databases
PATCH  /api/v1/databases/:id       # Přejmenovat / popis / viditelnost
DELETE /api/v1/databases/:id

GET    /api/v1/public/databases
GET    /api/v1/public/databases/:id
GET    /api/v1/public/databases/:id/games
GET    /api/v1/public/databases/:id/games/:gameId
GET    /api/v1/public/databases/:id/export
GET    /api/v1/public/databases/:id/games/:gameId/export
```

### Games
```
GET    /api/v1/databases/:id/games
POST   /api/v1/databases/:id/games          # Batch import — vrací { imported: N, ids: string[] }
GET    /api/v1/databases/:id/games/:gameId
PATCH  /api/v1/databases/:id/games/:gameId  # v2: update hlaviček (+ volitelně tahů)
DELETE /api/v1/databases/:id/games/:gameId
GET    /api/v1/databases/:id/export
GET    /api/v1/databases/:id/games/:gameId/export
```

**PATCH body schema:**
```typescript
{
  headers: Record<string, string>,  // PascalCase PGN tag keys (Event, White, BlackElo, ...)
  movesPgn?: string                 // pokud uvedeno, aktualizuje moves_pgn + přepočítá ply_count
}
```

Když `movesPgn` chybí, jsou hlavičky aktualizovány a `moves_pgn` / `ply_count` netknuté — používá Hlavička panel z GameVieweru. Když je uveden, jsou aktualizovány i tahy — používá GameEditor v edit režimu.

POST i PATCH stejně mapují `headers.Key` na sloupce: prázdné/missing hodnoty → `NULL`, `WhiteElo`/`BlackElo` přes `parseInt`. `ply_count` se vždy přepočítává z `movesPgn` (single source of truth, nečte se z `headers.PlyCount`).

### Export query parametry
```
GET /api/v1/databases/:id/export?mode=full     # Plné PGN
GET /api/v1/databases/:id/export?mode=stripped # Pouze tahy (bez komentářů/variant/NAG)
```

### Lichess Masters explorer (proxy)
```
GET /api/v1/explorer?fen=<FEN>&moves=N   # Autentizováno, vyžaduje LICHESS_TOKEN v env
```

Vrací JSON z `explorer.lichess.ovh/masters` včetně `opening.eco` / `opening.name` a statistik tahů. Použito v `OpeningBook` panelu a v `useEditorEco` pro sticky ECO lookup.

---

## 5. Routing

Frontend routy (`App.tsx`):
```
/login                              # OAuth + dev-login
/                                   # Databases (protected)
/db/:id                             # DatabaseDetail (protected)
/db/:id/game/new                    # GameEditor v create režimu (protected)
/db/:id/game/:gameId/edit           # GameEditor v edit režimu (protected)
/db/:id/game/:gameId                # GameViewer (protected)
/public                             # PublicDatabases
/public/:id                         # PublicDatabase
/public/:id/game/:gameId            # PublicGameViewer (sidebar když přes router state z PublicDatabase)
```

Pořadí route definicí: `/new` musí být před `/:gameId` aby React Router matchnul správně.

---

## 6. Autentizační flow

```
1. Uživatel klikne "Přihlásit se přes Google"
2. Frontend naviguje na GET /api/v1/auth/google
3. Worker vygeneruje state (CSRF), uloží do cookie, redirect na Google
4. Google → GET /api/v1/auth/callback?code=...&state=...
5. Worker ověří state, vymění code za access token
6. Worker fetchne profil uživatele
7. Worker uloží/aktualizuje uživatele v D1
8. Worker vygeneruje JWT (HMAC-SHA256, platnost 7 dní)
9. Produkce: redirect na frontend /login#token=JWT
   Dev: JWT do httpOnly cookie, redirect na /
10. Frontend přečte token z hash, uloží do localStorage, redirect na /
11. Všechny API requesty: Authorization: Bearer
```

---

## 7. PGN parsing

**Frontend (`lib/moveTree.ts`):** Vlastní tokenizer + recursive descent parser. Používá chess.js pro validaci a FEN. Produkuje strom `MoveNode[]` s FEN na každém uzlu. Podporuje:
- Varianty (rekurzivní závorky)
- Komentáře `{ text }`
- NAG symboly `$1`–`$19` + inline anotace (`Nf3!`, `e5?!`)

**Editor používá jen hlavní linii** (`tree.moves`) — varianty nejsou v editoru editovatelné, zachovají se ale při viewing.

**Import flow** (`ImportDialog` + `lib/pgn.ts: splitPgn`):
```
1. Uživatel nahraje soubor / vloží text
2. Frontend rozdělí multi-game PGN na pole partií
3. Preview "Nalezeno N partií"
4. Potvrzení → POST /api/v1/databases/:id/games (batch)
5. Backend uloží každou partii jako řádek, dopočítá ply_count, vrátí { imported, ids }
```

**Backend (`lib/pgn.ts`):**
- `buildPgn(row, mode)` — sestavení PGN ze sloupců DB (17 hlaviček + PlyCount + movetext)
- `stripMoveText(text)` — odstraní komentáře, varianty, NAG (pro export `mode=stripped`)
- `countPlies(movesPgn)` — počet půltahů přes SAN regex (po stripMoveText) — používá POST i PATCH s movesPgn

---

## 8. GameViewer

Layout: levý sloupec (Board + nav + Analysis + OpeningExplorer + OpeningBook), pravý sloupec (MoveList + případně sidebar). Sidebar se aktivuje když navigace přichází s router state (z DatabaseDetail nebo PublicDatabase).

### Hlavička panel (PATCH bez moves)
Tlačítko **Hlavička** v top baru otevře editovatelný `HeaderForm` v pravém sloupci pod MoveList. Tracking dirty pomocí `headersEqual(headers, initialHeaders)`:
- Při dirty: zobrazí se **Uložit** / **Zahodit změny**, tlačítka **Hlavička** a **Upravit partii** jsou zablokovaná (zabraňují odchodu bez uložení)
- **Uložit** → PATCH bez `movesPgn` → invalidate `['game', id, gameId]`, `['games', id]`, `['sidebar-games', id]`
- **Zahodit změny** → reset na `initialHeaders`

### Upravit partii
Tlačítko v top baru naviguje na `/db/:id/game/:gameId/edit` s router state `{ currentMoveIndex }` (počet odehraných tahů, `getCurrentMoveIndex() + 1`).

---

## 9. GameEditor (sdílená komponenta create + edit)

Detekce režimu: `isEdit = !!gameId` z route paramů.

### Layout
```
← {dbName}                                                 (breadcrumb)
{White (Elo) vs Black (Elo) Result}    {Event · Date}     [Zahodit] [Uložit]   (edit)
Nová partie                                                 [Zahodit] [Uložit]   (create)

┌──────────────────────────┬──────────────────────────────┐
│   Šachovnice             │  TAHY                        │
│   (interaktivní)         │  1. e4  e5  2. Nf3  Nc6     │
├──────────────────────────┤  ECO: B12 Caro-Kann          │
│  ⏮  ◀  ▶  ⏭             │                              │
├──────────────────────────┤                              │
│  [Replace dialog inline] │                              │
│  Stockfish Analysis      │  HLAVIČKY PARTIE             │
│  Strom zahájení          │  Event * White * Black *     │
│                          │  Date Round Result           │
│                          │  ELO, Team, FideId, CzId     │
└──────────────────────────┴──────────────────────────────┘
```

### Interaktivní šachovnice (`EditableBoard.tsx`)
- Chessground: `free: false`, dests z chess.js, promotion dialog (D/V/S/J)
- Při navigaci zpět zůstává interaktivní — zahraný tah uprostřed otevře replace dialog
- Engine šipka přes `autoShapes` prop (chessground `setAutoShapes`)
- `drawable.enabled: true` umožňuje uživatelské šipky pravým tlačítkem (mizí při změně pozice)
- Bounds cache se invaliduje na `mousedown`/`touchstart` capture (fix drag offsetu)

### Editace existujícího tahu
Když user zahraje tah na pozici `cursor < moves.length - 1`, otevře se inline dialog:
- **Přepsat** — smaže moves[K+1..N-1], vloží nový tah K
- **Nahradit** — re-validuje moves[K+1..N-1] proti nové pozici, zastaví u prvního neplatného. Confirm modal s mini-boardem (`Board` v `ReplaceConfirmModal`) zobrazí finální pozici a `Tahy 4...Nf6 – 5. O-O budou zahozeny`.
- **Zrušit** — vrátí původní tah

Během dialogu je hlavní šachovnice zamknutá (`navLocked`), zobrazuje pending pozici (po zahraném tahu).

### Auto-Result
Po každé změně tahů se zkoumá poslední pozice (`maybeAutoResult(fen)`):
- Mat → 1-0 nebo 0-1 + notifikace pod seznamem tahů
- Pat / nedostatek materiálu / 3× opakování → 1/2-1/2 + notifikace
- Jinak → notifikace se vyčistí

Při dosažení terminálního stavu se Result přepíše **vždy** (ignoruje předchozí hodnotu).

### Sticky ECO (`useEditorEco`)
Po každé změně pozice (debounce 300 ms) volá `/api/v1/explorer?fen=...&moves=0`. Pokud Explorer vrátí `opening.eco` / `opening.name`, uloží se do headers. Pokud nevrátí, drží poslední známou hodnotu.

### Dirty detection (v2)
```typescript
movesDirty   = !movesArraysEqual(moves, initialMoves)
headersDirty = !headersEqual(headers, initialHeaders)
dirty        = movesDirty || headersDirty
```

- **Uložit** disabled když `!dirty`
- **Zahodit** vždy aktivní, confirm dialog jen když `dirty`
- Discard text větvený: "Tahy i hlavička budou ztraceny" / "Úpravy tahů budou ztraceny" / "Úpravy hlavičky budou ztraceny"
- Autosave gated na `dirty` (jinak se zbytečně neukládá)

### Autosave do localStorage
Každou minutu (pokud dirty). Klíče:
- `pgn-base-draft-${dbId}` — create režim
- `pgn-base-draft-edit-${gameId}` — edit režim

Ukládá `{savedAt, moves, fens, cursor, headers}`. Při dalším otevření editoru se zobrazí `RestoreDraftDialog` s volbou Obnovit / Začít znovu.

### Save flow
Create:
- `POST /api/v1/databases/:id/games` s `{ games: [{ headers, movesPgn }] }`
- Response `{ imported: 1, ids: [newId] }` → navigate `/db/:id/game/:newId`

Edit:
- `PATCH /api/v1/databases/:id/games/:gameId` s `{ headers, movesPgn }`
- Invalidate cache → navigate zpět na viewer

---

## 10. Stockfish integrace (v2 — engine panel improvements)

Stockfish 18 WASM (single-threaded) z npm balíčku `stockfish`:
- Dev: načítá se z `frontend/public/stockfish-18-single.{js,wasm}` (kopie z `node_modules`)
- Produkce: z **unpkg CDN** (`https://unpkg.com/stockfish@18.0.7/bin/...`). Cross-origin Workery vyžadují blob URL workaround se zachováním hash s WASM path.

### MultiPV
Hook `useStockfish.ts` parsuje `info` linie s `multipv N` a drží `Map<index, eval>`. Při startu analýzy se posílá `setoption name MultiPV value N` (1–5, default 3).

### SAN konverze
Pro každý PV v UCI formátu (`e2e4 c7c6 ...`) se aplikuje chess.js na klon FEN a sbírají se `move.san`. Výsledek: `pvSan: string[]` vedle `pvUci: string`. Pokud nějaký tah selže, vyřízne se zbytek (graceful).

### Best-move šipka
`bestMoveUci` = první UCI tah z MultiPV 1. `Analysis` komponenta volá `onBestMove(uci | null)` při změně. Konzument (GameViewer, PublicGameViewer, GameEditor) drží `bestMoveArrow: DrawShape | null` a předává jako `autoShapes` do Board / EditableBoard.

Toggle **Šipky** v engine panelu — když OFF, callback dostává `null`. Stav persistován v `localStorage` (viz níže).

### Skóre formátování
Z pohledu hráče na tahu (Stockfish konvence):
- Centipawn: `+0.5` / `-0.3`
- Mat: `#3` / `-#3`

### localStorage persistence
Klíč `pgn-base-engine-settings`:
```typescript
{ multiPV: number, depth: number, arrows: boolean }
```
Validováno při načtení (`clampInt`), default `{multiPV: 3, depth: 18, arrows: false}`.

---

## 11. Lichess integrace

### Cloud Eval (`useOpeningExplorer.ts`)
```
GET https://lichess.org/api/cloud-eval?fen=<FEN>&multiPv=5
```
V dev proxováno přes Vite (`/lichess-explorer` → `lichess.org/api`), v produkci přímo. Cache přes TanStack Query (5 min stale).

### Masters explorer (`/api/v1/explorer` přes backend proxy)
```
GET https://explorer.lichess.ovh/masters?fen=<FEN>&moves=N&topGames=0
```
Vyžaduje `LICHESS_TOKEN` (přes `wrangler secret put`). Voláno z:
- `OpeningBook` panel (přes `useOpeningBook` hook) — gate ON/OFF v localStorage `pgn-base-opening-book`
- `useEditorEco` pro sticky ECO v editoru

Response obsahuje statistiky tahů + `opening: { eco, name }` pokud Masters DB pozici zná.

---

## 12. Lokální vývoj na macOS

### Prerekvizity
```bash
node >= 18
npm >= 9
```

### Setup
```bash
git clone https://github.com/kareljukl/pgn-base
cd pgn-base

# Backend
cd backend && npm install
npm run db:reset

# Frontend
cd ../frontend && npm install
cp node_modules/stockfish/bin/stockfish-18-single.{js,wasm} public/
```

### Konfigurace (`backend/.dev.vars`, gitignored)
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
JWT_SECRET=dev-secret-change-in-production
FRONTEND_URL=http://localhost:5173
LICHESS_TOKEN=...           # pro OpeningBook a useEditorEco
```

### Spuštění
```bash
# Terminal 1
cd backend && npm run dev     # :8787 (restart: napsat `rs` + Enter)

# Terminal 2
cd frontend && npm run dev    # :5173 (5174 pokud :5173 zabraný)
```

### Schema migrace lokálně
`schema.sql` má `CREATE TABLE IF NOT EXISTS` — po přidání nového sloupce do `games` je potřeba ALTER:
```bash
cd backend
npx wrangler d1 execute pgn-base-db --local --command "ALTER TABLE games ADD COLUMN nazev_typ TEXT"
```
Nebo smazat lokální SQLite soubor a spustit `npm run db:reset`.

### Dev Login
Bez nastavení Google credentials lze testovat přes "Dev Login" tlačítko na `/login` v dev módu. Přihlásí jako `dev-user-001` (z `seed.sql`).

---

## 13. Deployment na Cloudflare

Produkce:
- **Worker:** https://pgn-base-api.kareljukl.workers.dev
- **Pages:** https://pgn-base.pages.dev
- **D1:** `pgn-base-db` (ID `a9a08b8f-db2c-48ec-ba3c-20e4739eba14`, region EEUR)

### Secrets
```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put JWT_SECRET
wrangler secret put FRONTEND_URL    # https://pgn-base.pages.dev
wrangler secret put LICHESS_TOKEN   # API token z lichess.org/account/oauth/token
```

### Deploy
```bash
# Backend
cd backend && npx wrangler deploy

# Frontend (Stockfish WASM 108MB > Pages limit 25MB → CDN)
cd frontend && npx vite build
rm -f dist/stockfish-18-single.*
echo "/*  /index.html  200" > dist/_redirects
npx wrangler pages deploy dist --project-name pgn-base --commit-dirty=true --commit-message="Deploy"
```

**Poznámky:**
- Stockfish WASM se v produkci načítá z unpkg CDN (původní spec v1 zmiňuje jsdelivr — kód používá unpkg)
- Pages deploy selže s non-ASCII commit messages — vždy `--commit-message` v ASCII
- CORS akceptuje `*.pages.dev`, `*.workers.dev` a `localhost`; produkční doména přes `FRONTEND_URL` env
- Google OAuth redirect URI: `https://pgn-base-api.kareljukl.workers.dev/api/v1/auth/callback`

---

## 14. Limity a omezení MVP

| Limit | Hodnota |
|-------|---------|
| Max databází na uživatele | 50 |
| Max partií na databázi | neomezeno (D1 limit ~500 MB) |
| Max velikost importovaného PGN | 10 MB |
| Max partií v jednom importu | 1000 |
| Stockfish hloubka analýzy | max 25 (UI select 10–25) |
| Stockfish MultiPV | 1–5 |
| Session veřejné databáze | do zavření / obnovení stránky |
| Editor autosave interval | 60 s |
| ECO lookup debounce | 300 ms |

---

## 15. Co se v v2 přidalo oproti MVP

- **Editor partií** — interaktivní zadávání tahů na šachovnici, replace dialog, autosave, sticky ECO, validace povinných hlaviček
- **Editace existující partie** — sdílená komponenta GameEditor v edit režimu, PATCH endpoint
- **Editace hlaviček z viewru** — Hlavička panel + tlačítko, PATCH bez `movesPgn`
- **MultiPV Stockfish** — 1–5 variant, SAN konverze přes chess.js, best-move šipka na šachovnici, localStorage persistence
- **Opening Book** — Lichess Masters statistiky přes backend proxy
- **FIDE / ČŠS ID + PlyCount** — nové sloupce v `games`, helper `countPlies()` na backendu
- **Sidebar navigace v public vieweru** — paritní s autentizovaným
- **GoatCounter analytika** — `<script>` v `index.html`
- **CORS pro custom doménu** — `FRONTEND_URL` env akceptuje libovolnou doménu
- **Drag cursor fix** — invalidace chessground bounds cache na pointer down

---

## 16. Co plánováno (out of scope v2)

- Klik na tah v Opening Exploreru pro vložení do editoru
- Komentáře a varianty v editoru (zatím jen viewer)
- Integrace s appchess.cz pro napovídání hráčů podle FIDE/ČŠS ID
- Kontumace a nestandardní výsledky
- Autosave editoru do D1 jako draft stav (nyní jen localStorage)
- Filtrování / řazení podle FIDE/CzId sloupců v UI
- Backfill `ply_count` pro existující záznamy
