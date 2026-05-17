# FEAT: Editor partie — v2 (rozšíření hlaviček + DB schema)

Tento dokument navazuje na `feat-game-editor.md` (v1). V1 byla implementována
bez polí, která vyžadovala změnu DB schématu. v2 dotahuje původní spec do plného
rozsahu — přidává hlavičky `WhiteFideId`, `BlackFideId`, `WhiteCzeId`, `BlackCzeId`
a automatický tag `PlyCount`.

## Motivace

- FIDE / ČŠS ID jsou identifikátory hráče v oficiálních systémech; bez nich nelze
  partii spárovat s žebříčky a pozdější integrace na appchess.cz.
- `PlyCount` je standardní PGN tag pro počet půltahů — usnadňuje statistiky bez
  parsování movetextu.
- Tato pole mají být persistentní (nejen v exportu) — musí jít filtrovat / sortovat
  v list view a round-tripovat přes export.

## Změny DB schématu

`backend/src/db/schema.sql` — přidat sloupce do `games`:

```sql
ALTER TABLE games ADD COLUMN white_fide_id TEXT;
ALTER TABLE games ADD COLUMN black_fide_id TEXT;
ALTER TABLE games ADD COLUMN white_cze_id   TEXT;
ALTER TABLE games ADD COLUMN black_cze_id   TEXT;
ALTER TABLE games ADD COLUMN ply_count     INTEGER;
```

`ply_count` jako `INTEGER` kvůli numerickému sortu. ID sloupce jako `TEXT` —
formát ID se může lišit napříč systémy (FIDE bývá numerické, ČŠS kombinované).

### Migrace produkční D1

```bash
cd backend
npx wrangler d1 execute pgn-base --remote --command "ALTER TABLE games ADD COLUMN white_fide_id TEXT;"
npx wrangler d1 execute pgn-base --remote --command "ALTER TABLE games ADD COLUMN black_fide_id TEXT;"
npx wrangler d1 execute pgn-base --remote --command "ALTER TABLE games ADD COLUMN white_cze_id   TEXT;"
npx wrangler d1 execute pgn-base --remote --command "ALTER TABLE games ADD COLUMN black_cze_id   TEXT;"
npx wrangler d1 execute pgn-base --remote --command "ALTER TABLE games ADD COLUMN ply_count     INTEGER;"
```

Lokálně stačí `npm run db:reset` (přepíše SQLite soubor podle schema.sql).

## Backend — soubory k úpravě

### `backend/src/lib/pgn.ts`

- Rozšířit `GameRow` typ o nová pole.
- V `buildPgn()` přidat emit tagů pro neprázdné hodnoty:
  - `WhiteFideId`, `BlackFideId`, `WhiteCzeId`, `BlackCzeId`, `PlyCount`.
- Pořadí tagů: po `BlackElo`, před `ECO` (volitelné — záleží na konvenci).

### `backend/src/routes/games.ts`

- POST `/api/v1/databases/:dbId/games`:
  - Z `headers` objektu číst `WhiteFideId`, `BlackFideId`, `WhiteCzeId`, `BlackCzeId`.
  - `PlyCount` — buď číst z headers (pokud frontend pošle), nebo dopočítat z movetextu.
  - Rozšířit SQL INSERT o nové sloupce.
- GET single / list — vrátit nové sloupce v SELECT.

### `backend/src/routes/public.ts`

- Stejné rozšíření SELECT pro veřejné endpointy (list i detail).

### Validace

- ID jako volný text, žádná validace formátu na backendu (frontend může mít hint).
- `PlyCount`: pokud frontend pošle, akceptovat; jinak dopočítat — bezpečnější varianta
  je vždy dopočítat na backendu z movetextu (jeden zdroj pravdy).

## Frontend — soubory k úpravě

### `pages/GameEditor.tsx` / `components/GameEditor/HeaderForm.tsx`

- Odkrýt v UI 4 textová pole pro `WhiteFideId`, `BlackFideId`, `WhiteCzeId`, `BlackCzeId`.
- Layout zachovat dle původní specifikace (`feat-game-editor.md`).

### `lib/editorPgn.ts`

- Zahrnout nové tagy do sestavovaného PGN stringu (pokud editor staví PGN sám).
- `PlyCount` dopočítat z `moves.length`.

### `pages/DatabaseDetail.tsx` / `pages/PublicDatabase.tsx`

- Volitelně přidat sloupce ID do tabulky partií (pravděpodobně přepínat přes
  nastavení viditelných sloupců — overkill pro v2, nechat zatím skryté).

### `pages/GameViewer.tsx`

- Zobrazit FIDE/ČŠS ID v hlavičce partie pokud jsou vyplněné (drobný řádek pod jmény).

## Import

Import dialog (`ImportDialog.tsx`) předává `headers: Record<string, string>` 1:1.
Po backend update se nové tagy z importovaných PGN souborů automaticky uloží
do nových sloupců — žádná úprava frontendu importu není potřeba.

## Migrace existujících záznamů

Žádné backfill operace nejsou potřeba — nové sloupce budou `NULL` pro stávající
partie, což je validní stav. `PlyCount` pro staré partie zůstane `NULL` dokud
nepřijde update/re-import (případně doplnit jednorázovým skriptem který projde
všechny `moves_pgn` a spočítá).

## Co se v v2 nemění

- Editor UX (interakce s šachovnicí, návigace, autosave, replace dialog).
- ECO logika.
- Auth flow.
- Endpoint URLs.

## Otázky k dořešení před implementací v2

- Validovat formát FIDE ID (numerický)? Nebo nechat volné?
- Zobrazovat sloupce ID v list view? Defaultně skryté, přepínač v UI?
- `PlyCount` při importu — důvěřovat hodnotě z PGN, nebo vždy přepočítat?
