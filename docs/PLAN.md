# PGN Base — Implementation Plan (MVP)

Plan je rozdělen do 7 fází. Každá fáze je samostatně spustitelná a testovatelná.
Na konci každé fáze je checklist s kritérii pro ověření.

---

## Fáze 1: Scaffolding & infrastruktura

Cíl: Oba servery běží, frontend komunikuje s backendem, D1 databáze je připravena.

### Backend

- [ ] Inicializace projektu: `npm init`, TypeScript config
- [ ] Hono app s jedním health-check endpointem `GET /api/v1/health`
- [ ] `wrangler.toml` s D1 bindingem (název `DB`)
- [ ] `src/db/schema.sql` — tabulky `users`, `databases`, `games` + indexy dle spec
- [ ] Seed script `src/db/seed.sql` — testovací uživatel + ukázková databáze s několika partiemi
- [ ] npm scripts: `dev` (wrangler dev), `db:init` (create + execute schema lokálně), `db:seed`

### Frontend

- [ ] Vite + React 18 + TypeScript scaffolding
- [ ] React Router v6 — základní routes (zatím prázdné stránky):
  - `/login`, `/`, `/db/:id`, `/db/:id/game/:gameId`, `/public`, `/public/:id`
- [ ] Vite proxy: `/api` → `http://localhost:8787`
- [ ] `lib/api.ts` — fetch wrapper s base URL, automatickým JSON parsováním, error handlingem
- [ ] TanStack Query provider v root layoutu
- [ ] Základní layout: header s navigací (placeholder), `<Outlet />`

### Ověření

```
✓ `cd backend && npm run dev` → Worker běží na :8787
✓ `cd frontend && npm run dev` → Vite běží na :5173
✓ Fetch /api/v1/health z frontendu vrátí { status: "ok" }
✓ D1 tabulky existují (wrangler d1 execute --local "SELECT name FROM sqlite_master")
✓ Seed data jsou v databázi
```

---

## Fáze 2: Autentizace

Cíl: Uživatel se přihlásí přes Google (nebo dev bypass), backend ověřuje JWT,
frontend rozlišuje přihlášeného / nepřihlášeného uživatele.

### Backend

- [ ] Google OAuth flow:
  - `GET /api/v1/auth/google` — generuje state, redirect na Google
  - `GET /api/v1/auth/callback` — ověří state, vymění code za token, fetchne profil, upsert do `users`, vygeneruje JWT
- [ ] JWT utilita: sign (HMAC-SHA256), verify, decode
- [ ] JWT v httpOnly, Secure (ne v dev), SameSite=Lax cookie
- [ ] Auth middleware pro Hono: ověří JWT, přidá `c.set('user', ...)` do kontextu
- [ ] `GET /api/v1/auth/me` — vrátí aktuálního uživatele nebo 401
- [ ] `POST /api/v1/auth/logout` — smaže cookie
- [ ] **Dev-only auth bypass**: `POST /api/v1/auth/dev-login` (pouze pokud `env === 'development'`), přihlásí se jako seed uživatel, vrátí JWT. Umožní testování bez Google OAuth credentials.

### Frontend

- [ ] Auth context / hook `useAuth`:
  - Při startu volá `/auth/me`
  - Stavy: `loading`, `authenticated`, `unauthenticated`
  - Funkce: `login()` (redirect na `/auth/google`), `logout()`
- [ ] Login stránka: tlačítko "Přihlásit se přes Google" + dev-login tlačítko (v dev modu)
- [ ] Protected route wrapper — redirect na `/login` pokud nepřihlášen
- [ ] Header: zobrazení jména + avataru přihlášeného uživatele, logout tlačítko
- [ ] Guest přístup: nepřihlášený uživatel vidí `/public` routes bez redirectu

### Ověření

```
✓ Dev-login: klik na dev tlačítko → /auth/me vrátí uživatele → header ukazuje jméno
✓ Logout: po kliknutí /auth/me vrátí 401, redirect na /login
✓ Protected route: nepřihlášený na / → redirect na /login
✓ /public route je přístupná bez přihlášení
✓ (Volitelně) Plný Google OAuth flow s reálnými credentials
```

---

## Fáze 3: Správa databází

Cíl: Přihlášený uživatel vytváří, přejmenovává, maže a přepíná viditelnost svých databází.
Nepřihlášený uživatel vidí veřejné databáze.

### Backend

- [ ] CRUD endpointy pro databáze:
  - `GET /api/v1/databases` — vlastní databáze (auth required)
  - `POST /api/v1/databases` — vytvořit (validace: max 50/uživatel, název povinný)
  - `PATCH /api/v1/databases/:id` — přejmenovat / popis / is_public (jen vlastník)
  - `DELETE /api/v1/databases/:id` — smazat (jen vlastník, CASCADE smaže i partie)
- [ ] Veřejné endpointy (bez auth):
  - `GET /api/v1/public/databases` — seznam veřejných databází
  - `GET /api/v1/public/databases/:id` — detail veřejné databáze
- [ ] Validace ownership u všech mutací
- [ ] Error responses: 400 (validace), 403 (není vlastník), 404

### Frontend

- [ ] Stránka "Moje databáze" (`/`):
  - Seznam databází jako karty nebo tabulka (název, popis, počet partií, datum, veřejná/soukromá)
  - Tlačítko "Nová databáze" → dialog s názvem a popisem
  - Akce na databázi: přejmenovat, smazat (potvrzovací dialog), přepnout viditelnost
  - Klik na databázi → navigace na `/db/:id`
- [ ] Stránka "Veřejné databáze" (`/public`):
  - Seznam veřejných databází (read-only)
  - Klik → navigace na `/public/:id`
- [ ] TanStack Query: `useQuery` pro seznam, `useMutation` pro CRUD s invalidací

### Ověření

```
✓ Vytvořit databázi → objeví se v seznamu
✓ Přejmenovat → název se aktualizuje
✓ Přepnout na veřejnou → objeví se v /public
✓ Smazat → zmizí ze seznamu
✓ Limit 50 databází → backend vrátí 400
✓ Pokus o editaci cizí databáze → 403
✓ Nepřihlášený uživatel vidí /public, nevidí /
```

---

## Fáze 4: Import a seznam partií

Cíl: Uživatel importuje PGN soubor nebo text, vidí partie v tabulce s filtrováním a stránkováním.

### PGN parsing (sdílená utilita)

- [ ] `frontend/src/lib/pgn.ts`:
  - `splitPgn(text: string): RawGame[]` — rozdělí multi-game PGN na jednotlivé partie
  - `parseHeaders(pgn: string): Record<string, string>` — extrahuje PGN tagy ([White "..."] atd.)
  - `extractMoveText(pgn: string): string` — oddělí movetext od hlaviček
  - Tolerance na nevalidní formátování (prázdné řádky, BOM, encoding)

### Backend

- [ ] `POST /api/v1/databases/:id/games` — batch import:
  - Přijímá pole `{ headers, movesPgn }[]`
  - Validace: max 500 partií, max 10 MB celkem
  - INSERT v transakci
  - Response: `{ imported: number }`
- [ ] `GET /api/v1/databases/:id/games` — seznam partií:
  - Query params: `q` (fulltext white+black), `page`, `limit`, `sort`, `order`
  - Response: `{ games: Game[], total: number, page: number }`
  - SQL: `WHERE (white LIKE ? OR black LIKE ?) ORDER BY ? LIMIT ? OFFSET ?`
- [ ] `DELETE /api/v1/databases/:id/games/:gameId` — smazat partii

### Frontend

- [ ] Import dialog (modal):
  - Tab 1: nahrání souboru (drag & drop + file input, accept=".pgn")
  - Tab 2: textarea pro paste PGN textu
  - Preview: "Nalezeno N partií" s tabulkou prvních pár řádků
  - Tlačítko "Importovat" → POST, zobrazení výsledku
  - Error handling: nevalidní PGN, příliš velký soubor
- [ ] Stránka databáze (`/db/:id`):
  - Tabulka partií: Bílý (+ ELO), Černý (+ ELO), Výsledek, Datum, Event, Kolo
  - Řazení klikem na záhlaví sloupce
  - Filtrování: input s ikonou hledání, debounce 300ms
  - Stránkování: 25/stránka, navigace stránek
  - Tlačítko "Importovat partie"
  - Klik na řádek → navigace na `/db/:id/game/:gameId`
- [ ] Prázdný stav: "Žádné partie. Importujte PGN soubor."

### Ověření

```
✓ Import PGN souboru s 10 partiemi → "Importováno 10 partií" → tabulka ukazuje 10 řádků
✓ Import přes textarea funguje stejně
✓ Řazení podle jména, data, výsledku funguje
✓ Filtrování "Novák" najde partie kde Novák hrál bílými nebo černými
✓ Stránkování: při >25 partiích se zobrazí navigace stránek
✓ Smazání partie → zmizí z tabulky
✓ Import >500 partií → error
✓ Import nevalidního PGN → srozumitelná chybová hláška
```

---

## Fáze 5: Prohlížení partie

Cíl: Kompletní prohlížeč partií — šachovnice, seznam tahů s variantami, komentáře, NAG glyfy.
Toto je jádro aplikace.

### PGN parser pro varianty

- [ ] Rozšíření `lib/pgn.ts` nebo integrace knihovny (např. `@mliebelt/pgn-parser`):
  - Parsování movetext → stromová struktura: `MoveNode { san, fen, comment?, nag?, variations: MoveNode[][] }`
  - Podpora rekurzivních variant (závorky v závorkách)
  - Podpora NAG symbolů ($1–$6 minimálně)
  - Podpora komentářů `{ text }`

### Game store (Zustand)

- [ ] `store/gameStore.ts`:
  - Stav: `moves: MoveTree`, `currentPath: number[]`, `currentFen: string`
  - Akce: `goToMove(path)`, `goForward()`, `goBack()`, `goToStart()`, `goToEnd()`
  - Navigace do variant a zpět do hlavní linie
  - Odvozený stav: `currentMove`, `isAtStart`, `isAtEnd`

### Komponenty

- [ ] `Board/` — Chessground wrapper:
  - Props: `fen`, `orientation`, `lastMove`
  - Chessground konfigurace: `viewOnly: true` (v MVP žádné přetahování), animace tahů
  - Správný import Chessground CSS
- [ ] `MoveList/` — seznam tahů:
  - Zobrazení tahů v inline notaci (1. e4 e5 2. Nf3 ...)
  - Varianty odsazené, vizuálně odlišené (menší font, jiná barva pozadí)
  - Zvýrazněný aktuální tah
  - Klik na tah → `goToMove(path)`
  - Komentáře zobrazené kurzívou za tahem
  - NAG glyfy zobrazené jako symboly: `$1` → `!`, `$2` → `?`, `$3` → `!!`, `$4` → `??`, `$5` → `!?`, `$6` → `?!`
  - Auto-scroll na aktuální tah
- [ ] Navigační tlačítka: `|◀` `◀` `▶` `▶|`
- [ ] Klávesové zkratky: `←` zpět, `→` vpřed, `Home` začátek, `End` konec
- [ ] Hlavička partie nad šachovnicí: jména hráčů, ELO, výsledek, event, datum

### Stránka GameViewer

- [ ] `pages/GameViewer.tsx`:
  - Fetch partie z API (`GET /databases/:id/games/:gameId`)
  - Inicializace game store z moves_pgn
  - Layout dle spec: šachovnice vlevo, seznam tahů vpravo
  - Navigační tlačítka pod šachovnicí
  - Responsive: na menší obrazovce tahy pod šachovnicí

### Ověření

```
✓ Klik na partii v seznamu → otevře se šachovnice s počáteční pozicí
✓ Klik na ▶ → šachovnice ukazuje pozici po prvním tahu
✓ Klávesa → funguje stejně
✓ Klik na tah v seznamu → skok na danou pozici
✓ Partie s variantami: varianty viditelné, klik na variantu → šachovnice ukazuje správnou pozici
✓ Navigace zpět z varianty do hlavní linie
✓ Komentáře zobrazené u tahů
✓ NAG glyfy zobrazené jako symboly (!!, ?, atd.)
✓ Home/End funguje (skok na začátek/konec)
```

---

## Fáze 6: Analýza

Cíl: Stockfish hodnotí aktuální pozici, Lichess Opening Explorer ukazuje statistiky zahájení.

### Stockfish

- [ ] `workers/stockfish.worker.ts`:
  - Načtení Stockfish WASM (z npm balíčku `stockfish.js` nebo `lila-stockfish-web`)
  - Komunikace přes UCI protokol: `position fen ...`, `go depth N`, `stop`
  - Parsování UCI info řádků: `depth`, `score cp/mate`, `pv`
  - Postmessage API: `{ type: 'position' | 'go' | 'stop', ... }` ↔ `{ type: 'info' | 'bestmove', ... }`
- [ ] `hooks/useStockfish.ts`:
  - Spustí Worker, poskytuje: `startAnalysis(fen, depth)`, `stopAnalysis()`
  - Reaktivní stav: `evaluation`, `depth`, `bestLine`, `isAnalyzing`
  - Automatická analýza při změně pozice (debounce)
  - Cleanup při unmount
- [ ] `Analysis/` komponenta:
  - Toggle: zapnout/vypnout engine
  - Zobrazení: hloubka, skóre (v pěšcích nebo mat v N), nejlepší pokračování (PV) jako klikatelné tahy
  - Slider nebo dropdown pro nastavení max hloubky (10–25)
  - Eval bar (vertikální pruh vedle šachovnice ukazující výhodu)

### Lichess Opening Explorer

- [ ] `hooks/useOpeningExplorer.ts`:
  - Fetch `https://explorer.lichess.ovh/masters?fen=<FEN>&moves=12`
  - Debounce 300ms při změně pozice
  - Caching přes TanStack Query (FEN jako klíč)
  - Stav: `moves`, `isLoading`
- [ ] `OpeningExplorer/` komponenta:
  - Tabulka: Tah, Počet partií, Bílý %, Remíza %, Černý % (barevné pruhy)
  - Klik na tah → přehrání tahu na šachovnici (pokud je legální)
  - Zobrazení i pro pozice v partii (ne jen od začátku)
  - Skrytí pokud API nevrací data (pozice mimo knihu zahájení)

### Integrace do GameViewer

- [ ] Layout rozšířen: analýza pod navigačními tlačítky, opening explorer pod ním
- [ ] Stockfish a Opening Explorer reagují na změnu pozice v game store

### Ověření

```
✓ Zapnutí enginu → ukazuje hodnocení a nejlepší tah
✓ Posun v partii → hodnocení se aktualizuje
✓ Změna hloubky → engine přepočítá
✓ Vypnutí enginu → analýza se zastaví
✓ V počáteční pozici Opening Explorer ukazuje e4, d4, Nf3... s procenty
✓ Po několika tazích ukazuje relevantní pokračování
✓ V koncovce (mimo knihu) se Explorer skryje
✓ Klik na tah v Exploreru přehraje tah na šachovnici
```

---

## Fáze 7: Export, veřejné databáze, finalizace

Cíl: Export PGN, plně funkční veřejné databáze, ošetření edge cases, UI polish.

### Export

- [ ] Backend:
  - `GET /api/v1/databases/:id/export?mode=full|stripped` — celá databáze jako PGN soubor
  - `GET /api/v1/databases/:id/games/:gameId/export?mode=full|stripped` — jedna partie
  - Stripped mode: odstranění komentářů, variant, NAG z movetext
  - Response: `Content-Type: application/x-chess-pgn`, `Content-Disposition: attachment`
- [ ] Frontend:
  - Tlačítko "Exportovat" na stránce databáze (celá DB) a na stránce partie (jedna partie)
  - Výběr režimu: plné PGN / pouze tahy
  - Stažení souboru přes `<a download>`

### Veřejné databáze — plná funkcionalita

- [ ] Stránka `/public/:id`:
  - Seznam partií (read-only, stejná tabulka jako u vlastní DB)
  - Prohlížení partie se šachovnicí, analýzou, opening explorerem
  - Session storage: pokud guest provede lokální změnu (navigace do variant),
    stav se drží v session storage, ale po obnovení stránky zmizí
- [ ] Veřejné API endpointy pro partie:
  - `GET /api/v1/public/databases/:id/games` (seznam)
  - `GET /api/v1/public/databases/:id/games/:gameId` (detail)
  - Export veřejné databáze (read-only)

### UI polish

- [ ] Loading stavy: skeleton komponenty pro tabulky, spinner pro šachovnici
- [ ] Error boundary: fallback UI pro neočekávané chyby
- [ ] Toast notifikace pro akce (import dokončen, databáze smazána, atd.)
- [ ] Prázdné stavy: ilustrace + CTA pro prázdné databáze, žádné výsledky hledání
- [ ] 404 stránka
- [ ] Favicon a document title per stránka

### Ověření

```
✓ Export databáze s 5 partiemi → stáhne se .pgn soubor s 5 partiemi
✓ Export stripped → soubor neobsahuje komentáře ani varianty
✓ Veřejná databáze: nepřihlášený uživatel vidí partie, může prohlížet, analyzovat
✓ Po obnovení stránky jsou lokální změny ve veřejné DB pryč
✓ Loading spinner se zobrazí při načítání
✓ Neexistující URL → 404 stránka
✓ Toast po úspěšném importu
```

---

## Přehled závislostí (npm balíčky)

### Frontend

| Balíček | Účel |
|---------|------|
| `react`, `react-dom` | UI framework |
| `react-router-dom` | Routing |
| `@tanstack/react-query` | Server state |
| `zustand` | Client state |
| `chessground` | Šachovnice |
| `chess.js` | Validace tahů, FEN |
| `@mliebelt/pgn-parser` | PGN parsing s variantami |
| `stockfish.js` nebo `lila-stockfish-web` | Engine WASM |

### Backend

| Balíček | Účel |
|---------|------|
| `hono` | Web framework |
| `@cloudflare/workers-types` | Typování pro Workers |

---

## Pořadí práce

```
Fáze 1  ──►  Fáze 2  ──►  Fáze 3  ──►  Fáze 4  ──►  Fáze 5  ──►  Fáze 6  ──►  Fáze 7
Scaffold      Auth         Databáze      Import        Viewer        Analýza       Export
+ DB          + JWT        + CRUD        + Seznam      + Board       + Stockfish   + Public
+ Routing     + Login      + Public      + Filter      + Moves       + Explorer    + Polish
                           list          + Paginate    + Variants
```

Každá fáze staví na předchozí. Fáze 5 (Viewer) je nejkomplexnější —
očekávej, že zabere nejvíc času, zejména PGN parser pro varianty a navigace stromem tahů.
