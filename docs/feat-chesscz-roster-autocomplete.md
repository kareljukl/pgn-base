# Feat: Roster-only autocomplete v zápasovém režimu

Když databáze pochází z importu jednoho ligového zápasu (`import_source = 'chesscz'`),
`HeaderForm` v editaci hlavičky **nepoužívá** globální vyhledávání hráčů přes
`/chesscz/search`. Místo toho našeptává jen z reálné soupisky obou týmů v dané
soutěži (`/competitions/{compId}/team/{teamId}/roster`) a Elo bere ze soupisky
(`playerCzeElo` / `playerFideElo`).

## Trigger

`HeaderForm` se přepne do roster režimu, pokud parent DB splňuje **všechny**:
- `import_source === 'chesscz'`
- vyplněné `chesscz_comp_id`
- vyplněné `chesscz_home_team_id`
- vyplněné `chesscz_away_team_id`

Roster mód není svázaný s lokálním přepínačem zobrazení v `DatabaseDetail` —
semantika DB je tvrdé pravidlo, ne uživatelská preference. Trigger se nyní
vyhodnocuje v `GameViewer` (pro panel „Upravit hlavičku") i v `GameEditor`
(pro create i edit mode); v obou se načte `/databases/:id` přes sdílený
queryKey `['database', id]`.

`PublicGameViewer` editaci nemá, takže se ho to netýká.

## Datový tok

Backend `routes/chesscz.ts`:

```
GET /api/v1/chesscz/competitions/:compId/team/:teamId/roster
```

Cachované v `chesscz_cache` (TTL 24 h) přes existující `cachedFetchSscr` helper —
sdílí atomic rate-limit gate, timeout-block a stale-on-error chování s ostatními
competition endpointy. Odpověď: `{ data: RosterEntry | RosterEntry[], fetchedAt, stale }`.

Frontend:
- `lib/chesscz.ts` — typ `ChessczRosterEntry` (odpovídá OpenAPI `RosterEntry`).
- `hooks/useChessczCompetition.ts::useChessczRoster(compId, teamId)` —
  TanStack Query, staleTime 30 min, zakázán když některý ID je null/0.
- `HeaderForm` paralelně načte soupisku pro White i Black tým, mapování
  dle parity `headers.Board`:
  - **lichý board** → White = `homeTeamId`, Black = `awayTeamId`
  - **sudý board** → opačně
  - chybí-li board, použije se 1 (odpovídá konvenci `boardGameToHeaders`).

## Komponenta `RosterAutocomplete`

`components/GameEditor/RosterAutocomplete.tsx`. Vůči `PlayerAutocomplete`:
- **Žádný debounce, žádné API call na keystroke** — substring match nad
  `playerName` přes `removeDiacritics`, case-insensitive.
- Po fokusu zobrazí **celou soupisku** (může mít až ~20 hráčů,
  dropdown má `maxHeight: 320 px` + scroll).
- Řádek: `#rosterPosition`, jméno, `playerClass` (jen je-li), badge FIDE Elo,
  badge Cze Elo (badges se skryjí, je-li hodnota 0).
- Klávesy: ↑/↓ pro pohyb, Enter pro výběr, Esc zavře.
- Při loading/chybě/prázdné soupisce: input zůstává čistě textový;
  zobrazí se nenápadná hláška (`Soupiska se načítá…` / `Soupiska nedostupná` /
  `Žádný hráč v soupisce neodpovídá`).
- **Nikdy** se nepropadne na globální `/chesscz/search`.

## `applyRosterEntry` — co se vyplní

Při výběru hráče ze soupisky pro stranu `side` (`White` nebo `Black`):

| Pole              | Hodnota                                                   |
|-------------------|-----------------------------------------------------------|
| `{side}`          | `playerName` (jména necháváme syrová — viz Diakritika níž)|
| `{side}CzeId`     | `playerId`                                                |
| `{side}CzeElo`    | `playerCzeElo`, jen je-li > 0                             |
| `{side}FideElo`   | `playerFideElo`, jen je-li > 0                            |
| `{side}Elo`       | fallback FIDE → Cze                                       |
| `{side}FideId`    | **neměníme** (roster ho nevrací — doplnit přes ⟳)          |
| `{side}Team`      | **neměníme** (předvyplněné z importu, je správné)         |

⟳ tlačítka u `WhiteCzeId` / `BlackCzeId` zůstávají v roli „doplnit chybějící
FIDE ID + obnovit Ela" — explicitní 1× API call na `/chesscz/player/cze/:id`,
mimo autocomplete tok. **V roster módu ⟳ nepřepisuje `{side}Team`** —
v lize je team = družstvo ze soupisky soutěže (např. „JAWA Brodce B"), což
není totéž jako `clubName` z hráčova `/members/:id` profilu (např. „TJ JAWA
Brodce"). Mimo roster mód se chování `applyPlayer` nemění.

## Diakritika

Roster vrací jména s diakritikou. `applyRosterEntry` je vyplňuje syrově.
Pro chess.cz konvenci „bez diakritiky" má GameViewer tlačítko
**„Odstranění diakritiky"**, které normalizuje `Event/Site/White/Black/WhiteTeam/BlackTeam`
jediným kliknutím. Stejné platí pro hromadnou akci v `DatabaseDetail`.

## Edge cases

- **DB s `import_source === 'chesscz'`, ale chybí `chesscz_*` ID** —
  `chessczContext` zůstává `null`, použije se původní `PlayerAutocomplete`.
- **Hráč v soupisce nemá Elo** (`playerCzeElo === 0` nebo `playerFideElo === 0`) —
  badge se nezobrazí, do hlavičky se nevyplní.
- **Změna `headers.Board` během editace** — `boardForRoster` se přepočítá,
  TanStack Query si oba `teamId` udrží v cache, takže přepnutí mezi roster
  pohledy je instant.
- **`Board` prázdný / nečíselný** — defaultně board = 1 (home je White).

## Rate-limit chování

Stejné jako u ostatních ŠSČR proxy: 10 s minimální gap, wait-and-retry až
12 s před 429. Při timeoutu se IP blokuje na 1 h a stale cache se servíruje.
Roster mode má jednu zásadní výhodu: jakmile se obě soupisky jednou stáhnou
(typicky 2 requesty na celou session), žádné další volání ŠSČR nepotřebuje —
filtrování v dropdownu běží lokálně.
