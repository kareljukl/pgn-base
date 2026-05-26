# FEAT: Sezóny (chesscz season mode)

## Kontext

Jeden zápas = jedna chesscz databáze (UC1) funguje pro ad-hoc import konkrétního
kola. Pro klubového hráče je ale typický scénář jiný: na začátku sezóny (typicky
říjen) si chce **dopředu nachystat všechna kola, kde je jeho družstvo doma** —
podle rozlosování ŠSČR. V "Moje databáze" pak místo deseti samostatných řádků
chce vidět **jednu položku "Sezóna"**; po kliknutí se zobrazí aktuální kolo
(podle data) a v záhlaví je přepínač na ostatní připravená kola.

## Uživatelský flow

```
"Nová sezóna ze ŠSČR" (button v Moje databáze)
  → 1. Soutěž (kraj → liga, nebo ručně compId)
  → 2. Můj tým (single-select z tabulky soutěže)
  → 3. Kola (multi-select checkboxů, domácí předzaškrtnutá)
  → 4. Shrnutí + název sezóny → "Vytvořit sezónu (N kol)"
  → POST /seasons → redirect na /season/:id
```

## Datový model

Nová top-level tabulka **`seasons`** + FK `season_id NULL` na **`databases`**.

```sql
CREATE TABLE seasons (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES users(id),
  name            TEXT NOT NULL,
  description     TEXT,
  chesscz_comp_id INTEGER NOT NULL,
  chesscz_team_id INTEGER NOT NULL,    -- "můj" tým, ne soupeř
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
ALTER TABLE databases ADD COLUMN season_id TEXT REFERENCES seasons(id);
```

Každé kolo zůstává **samostatná chesscz databáze** se všemi 4 chesscz ID — match-mode
trigger v `DatabaseDetail` se nemění, child DB funguje stejně jako dnes ad-hoc
zápasová databáze, jen má navíc `season_id` ukazatel.

Existující chesscz DB mají `season_id = NULL` → zachovají dnešní chování (zobrazí
se ve flat tabulce na "Moje databáze").

## API

- `GET /api/v1/seasons` — list sezón uživatele (+ `round_count`).
- `GET /api/v1/seasons/:id` — `{ season, databases }`, databases seřazené dle `chesscz_round_nr`.
- `POST /api/v1/seasons` — vytvoří sezónu **plus N child databází plus per-DB placeholder partie** v jediném `DB.batch()` volání. Payload:
  ```ts
  {
    name, description?, chesscz_comp_id, chesscz_team_id, comp_name,
    rounds: [{ roundNr, roundDate, homeTeamId, homeTeamName, awayTeamId, awayTeamName, boardCount? }]
  }
  ```
- `PATCH /api/v1/seasons/:id` — rename / popis.
- `DELETE /api/v1/seasons/:id` — manuální kaskáda: nejdřív `DELETE FROM databases WHERE season_id = ?` (games padají přes `games.database_id ON DELETE CASCADE`), pak `DELETE FROM seasons WHERE id = ?`.

`POST /api/v1/databases` nově přijímá volitelně `season_id` (s ownership checkem proti `seasons`).
**`MAX_DATABASES_PER_USER` zvýšeno z 50 na 200**, protože sezóna může mít 11 kol → snadné překročení.

## UI

### `/` Moje databáze
- Nahoře nová sekce **"Sezóny"** (tabulka: Název · Popis · Kol · akce). Klik → `/season/:id`.
- Flat tabulka pod ní vypisuje **jen DB s `season_id == null`**, aby se kola sezóny nezdvojovala.
- Tlačítka v hlavičce: `Nová sezóna ze ŠSČR` (nový), `Importovat ze ŠSČR` (UC1, beze změny), `+ Nová databáze`.

### `/season/:id` SeasonDetail
- Načte `GET /seasons/:id` + `GET /chesscz/competitions/:compId/schedule` (24h cache) → joinout child DB s rozpisem podle `chesscz_round_nr` (získání `roundDate`, jména soupeře).
- Default-tab logika (FE, runs once on data ready):
  1. Nejmenší `dateIso >= today − 1 day`.
  2. Fallback: největší `dateIso < today` (poslední odehrané).
  3. Fallback fallback: první DB v poli.
- **Pásek tabů** (`Kolo n / datum / vs. Soupeř | u Soupeř`), aktivní tab v dark stylu.
- Pod tabem `Otevřít kolo v plném detailu →` link na `/db/:dbId` (pro edit ad-hoc, mimo sezónní pohled).
- Render `<MatchView database={selectedDb} />` (sdílená komponenta).
- Tlačítko `Smazat sezónu` v záhlaví (kaskáda, potvrzovací dialog).

### `ChessczImportDialog` (rozšířený)
- Nový prop `mode: 'match' | 'season'`, default `'match'` (zachovává UC1 chování beze změny).
- V `season` módu:
  - Krok 2 = jen výběr týmu (žádný radio team/round).
  - Krok 3 = checkbox seznam kol týmu, **homeTeamId === selectedTeamId předzaškrtnuté**. Uživatel může (od)škrtnout cokoli; pokud jednou ručně zasáhne, auto-pre-check už neovládá výběr (`seasonRoundsTouched`).
  - Krok 4 = jméno sezóny (default `${compName} ${seasonYear}/${seasonYear+1}`, heuristika z aktuálního měsíce) + `Vytvořit sezónu (N kol)`.

### Zpětný proklik `DatabaseDetail` → `SeasonDetail`
Když má DB `season_id != null`, nad titulkem se zobrazí breadcrumb `← {season.name}` linkující na `/season/:id`. Pro DB bez sezóny zobrazí `← Moje databáze`. Načítá se přes `useQuery(['season', seasonId])` (sdílí cache s `SeasonDetail`).

### Reusable `MatchView`
Match-view tabulka extrahovaná z `DatabaseDetail.tsx` do `components/DatabaseDetail/MatchView.tsx`:
- Sám si stahuje games přes `useQuery(['games', dbId, { mode: 'match' }])` (limit 1000).
- Zachovává score header, sloupce, board-parity logiku (lichý board → home je White).
- `showHeader` prop pro SeasonDetail, kde tabový pásek nahrazuje shrnutí.
- `onDeleteGame` prop pro DatabaseDetail; ve SeasonDetail se nesahá na partie.
- "Načíst výsledky" tlačítko zůstává v komponentě, takže funguje v obou kontextech.

## TanStack Query klíče (rozšíření CLAUDE.md invariantu)
- `['seasons']` — list sezón.
- `['season', id]` — detail sezóny + child DBs.

Po `POST /seasons` se invaliduje **`['seasons']` i `['databases']`** (kvůli novým child DB v listu).
Po `DELETE /seasons/:id` totéž.

## Edge cases / pozor na

- **`moves_pgn` invariant**: placeholder games server vytváří s `moves_pgn = ''`. Match-mode trigger zachován — child DB má všechny 4 chesscz ID.
- **Schema migrace produkce**: `CREATE TABLE seasons` je idempotent přes IF NOT EXISTS, ale `ALTER TABLE databases ADD COLUMN season_id` musí být spuštěno samostatně (CLAUDE.md gotcha).
- **ŠSČR rate-limit**: SeasonDetail volá `/competitions/:compId/schedule` 1× (24h cache) na entry. POST /seasons volá `/team/:teamId/schedule` 1× na výběr týmu (cached). Nevytvořeno žádné nové rate-limit horké místo.
- **Limit kol**: backend povoluje max 30 kol na sezónu (`MAX_ROUNDS_PER_SEASON`) — víc než reálná délka chess.cz sezóny.
- **Limit sezón**: max 50 sezón na uživatele (`MAX_SEASONS_PER_USER`).
- **Default-round edge**: dokud se nenačte `compSchedule`, datumy v tabech jsou `—` a default-tab může vybrat první (nejnižší roundNr); to se opraví po načtení dat (`autoSelectDone` guard).
- **Cizí FK ON DELETE**: `databases.season_id REFERENCES seasons(id)` ne má CASCADE definované (SQLite by potřebovalo PRAGMA foreign_keys = ON na úrovni connection). Manuální cleanup v `DELETE /seasons/:id` je proto explicitní.
