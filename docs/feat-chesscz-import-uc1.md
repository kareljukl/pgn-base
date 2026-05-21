# FEAT: Import zápasu ze ŠSČR API (UC1 — jednorázový zápas)

## Kontext

Uživatel chce zpracovat partie jednoho konkrétního zápasu z libovolné soutěže
ŠSČR. Bez trvalé vazby na soutěž, bez správy sezóny. Výsledkem je standardní
databáze v pgn-base s 8 (nebo jiným počtem) partiemi s hlavičkami z API.
Tahy se doplní ručně přes editor.

---

## Uživatelský flow

```
Nová databáze
  → [Zadat ručně název]  (stávající flow)
  → [Importovat ze ŠSČR API]  ← nová možnost

Import ze ŠSČR:
  1. Zadat compId soutěže
  2. Načíst detail soutěže → název se předvyplní
  3. Vybrat tým z dropdownu (tabulka soutěže)
  4. Vybrat zápas z dropdownu (schedule týmu nebo kola)
  5. Vytvořit databázi + prázdné partie s hlavičkami
  6. (Volitelně) Načíst výsledky partií → aktualizovat výsledky
```

---

## Obrazovka: Import ze ŠSČR API

### Krok 1 — Zadání soutěže

```
┌────────────────────────────────────────────────────┐
│  Import ze ŠSČR                                    │
│                                                    │
│  ID soutěže:  [_______]  [Načíst]                  │
│                                                    │
│  (Příklad: 3318 pro Krajskou soutěž A SŠS)         │
└────────────────────────────────────────────────────┘
```

Po kliknutí Načíst → volat:
```
GET /api/v1/chesscz/competitions/:compId/details
GET /api/v1/chesscz/competitions/:compId/table
```

Zobrazit:
```
  Soutěž: Krajská soutěž 'A'
  Region: Středočeský šachový svaz (SŠS)
  Vedoucí: Havelka Petr · petr.ino@tiscali.cz
```

Název databáze se předvyplní jako `compName` (upravitelný).

### Krok 2 — Výběr týmu

Dropdown ze `/competitions/:compId/table`:

```
  Vyberte tým:
  [ Klokani z Kralup          ▾ ]
    JAWA Brodce B
    Dubno A
    ...
```

Seřazeno dle `teamRank`. Zobrazit `teamName` + případně skóre/pořadí.

### Krok 3 — Výběr zápasu

Po výběru týmu načíst:
```
GET /api/v1/chesscz/competitions/:compId/team/:teamId/schedule
```

Zobrazit dropdown zápasů:

```
  Vyberte zápas:
  [ Kolo 5 · 14.12.2025 · JAWA Brodce B – Caissa Roztoky A  ▾ ]
    Kolo 2 · 02.11.2025 · JAWA Brodce B – ŠK Řevnice A (D)
    Kolo 7 · 25.01.2026 · JAWA Brodce B – TJ Hostivice A
    ...
```

Formát řádku:
```
Kolo {roundNr} · {roundDate} · {homeTeamName} – {awayTeamName}
```

Pokud `homeTeamScore + awayTeamScore > 0` → výsledky jsou k dispozici → označit `(D)`.

**Alternativní výběr přes kolo** — toggle "Vybrat podle kola":

```
  Vyberte kolo:  [ 5 ▾ ]
  Vyberte zápas: [ JAWA Brodce B – Caissa Roztoky A  ▾ ]
```

Načte `/competitions/:compId/round/:round/schedule` → filtruje zápasy kola.

### Krok 4 — Shrnutí a vytvoření

```
  Soutěž:  Krajská soutěž 'A'
  Tým:     JAWA Brodce B
  Zápas:   Kolo 5 · 14.12.2025
           JAWA Brodce B – Caissa Roztoky A
  Partie:  8 (bude vytvořeno 8 prázdných partií)

  Název databáze: [Krajská soutěž 'A' 2025/26_____________]

  [Zrušit]                              [Vytvořit databázi]
```

---

## Vytvoření partií — mapování na PGN hlavičky

Data pro hlavičky se berou ze dvou zdrojů:

**Zdroj A — schedule (okamžitě dostupný):**
- Datum kola (`roundDate`)
- Názvy týmů (`homeTeamName`, `awayTeamName`)
- Číslo kola (`roundNr`)

**Zdroj B — matches (dostupný po skončení zápasu):**
- Jména hráčů, ELO, výsledky partií

### Vytvoření prázdných partií (bez výsledků)

Pokud výsledky ještě nejsou k dispozici, vytvoří se N prázdných partií
(N = počet šachovnic dle ligy, výchozí 8):

```typescript
for (let board = 1; board <= boardCount; board++) {
  const homeIsWhite = board % 2 === 1  // liché = domácí hraje bílými

  games.push({
    event:      removeDiacritics(compName),
    site:       'chess.cz',
    date:       formatDate(roundDate),  // DD.MM.YYYY → YYYY.MM.DD
    round:      `${roundNr}.${board}`,
    board:      String(board),
    white:      homeIsWhite ? removeDiacritics(homeTeamName) : removeDiacritics(awayTeamName),
    black:      homeIsWhite ? removeDiacritics(awayTeamName) : removeDiacritics(homeTeamName),
    white_elo:  '',
    black_elo:  '',
    white_team: homeIsWhite ? removeDiacritics(homeTeamName) : removeDiacritics(awayTeamName),
    black_team: homeIsWhite ? removeDiacritics(awayTeamName) : removeDiacritics(homeTeamName),
    result:     '*',
    moves_pgn:  ''
  })
}
```

Poznámka: `White`/`Black` jsou při vytváření bez výsledků prázdná pole —
jméno týmu slouží jen jako placeholder dokud se nenačtou výsledky.

### Načtení výsledků — aktualizace partií

Buď automaticky po vytvoření (pokud výsledky existují), nebo manuálně
tlačítkem **Načíst výsledky ze ŠSČR** v DatabaseDetail.

Endpoint:
```
GET /api/v1/chesscz/competitions/:compId/round/:round/matches
```

Response je pole všech zápasů kola — filtrovat dle `homeTeamId` nebo `awayTeamId`.

Mapování `matchGames[i]` → partie (i = index = board - 1):

```typescript
matchGames.forEach((game, idx) => {
  const board        = idx + 1
  const homeIsWhite  = board % 2 === 1

  const whiteName    = homeIsWhite ? game.homePlayerName : game.awayPlayerName
  const blackName    = homeIsWhite ? game.awayPlayerName : game.homePlayerName
  const whiteElo     = homeIsWhite ? game.homePlayerRating : game.awayPlayerRating
  const blackElo     = homeIsWhite ? game.awayPlayerRating : game.homePlayerRating
  const whiteTeam    = homeIsWhite ? match.homeTeamName : match.awayTeamName
  const blackTeam    = homeIsWhite ? match.awayTeamName : match.homeTeamName

  // Výsledek z pohledu bílého
  const homeResult   = game.homePlayerResult  // 0 | 0.5 | 1
  const awayResult   = game.awayPlayerResult

  let result: string
  if (game.gameForfeited === 1) {
    // Kontumace — zachovat výsledek pokud je standardní
    if      (homeResult === 1 && awayResult === 0)   result = homeIsWhite ? '1-0' : '0-1'
    else if (homeResult === 0 && awayResult === 1)   result = homeIsWhite ? '0-1' : '1-0'
    else                                              result = '*'  // nestandardní kontumace
  } else {
    if      (homeResult === 1   && awayResult === 0)   result = homeIsWhite ? '1-0' : '0-1'
    else if (homeResult === 0   && awayResult === 1)   result = homeIsWhite ? '0-1' : '1-0'
    else if (homeResult === 0.5 && awayResult === 0.5) result = '1/2-1/2'
    else                                               result = '*'
  }

  // Aktualizovat existující partii v DB (PATCH)
  updateGame(board, {
    white:      removeDiacritics(whiteName),
    black:      removeDiacritics(blackName),
    white_elo:  String(whiteElo),
    black_elo:  String(blackElo),
    white_team: removeDiacritics(whiteTeam),
    black_team: removeDiacritics(blackTeam),
    result
  })
})
```

**Poznámka k počtu partií:** Pokud `matchGames.length !== boardCount`, použít
délku `matchGames` — API vrátí přesný počet odehraných partií.

---

## Datum — konverze formátu

ŠSČR API vrací datum ve formátu `DD.MM.YYYY` (např. `"14.12.2025"`).
PGN standard vyžaduje `YYYY.MM.DD`.

```typescript
function formatDate(czDate: string): string {
  const [d, m, y] = czDate.split('.')
  return `${y}.${m}.${d}`
}
```

---

## Tlačítko "Načíst výsledky" v DatabaseDetail

Pokud databáze vznikla přes ŠSČR import, zobrazit v hlavičce DatabaseDetail:

```
[ Export PGN ] [ Export (bez komentářů) ] [ Načíst výsledky ] [ + Nová partie ] [ Importovat partie ]
```

Tlačítko aktivní dokud nejsou všechny partie s `result != '*'`.
Po načtení výsledků deaktivovat (nebo skrýt).

Databáze si musí pamatovat `compId`, `roundNr`, `homeTeamId`, `awayTeamId`
pro opakované volání. Uložit do `databases` tabulky jako metadata.

---

## Backend — nové proxy endpointy

Všechny volání ŠSČR API jdou přes Worker proxy (cache + rate limit ochrana).

```
GET /api/v1/chesscz/competitions/:compId/details
GET /api/v1/chesscz/competitions/:compId/table
GET /api/v1/chesscz/competitions/:compId/team/:teamId/schedule
GET /api/v1/chesscz/competitions/:compId/round/:round/schedule
GET /api/v1/chesscz/competitions/:compId/round/:round/matches
```

Cache strategie (Cloudflare KV):
- `details` → 1 den
- `table` → 1 hodina
- `schedule` → 1 den
- `matches` → 30 minut (výsledky se mohou měnit)

Rate limit: max 1 request/3s na api.chess.cz dle skill dokumentace.

---

## DB schéma — rozšíření tabulky `databases`

```sql
ALTER TABLE databases ADD COLUMN import_source TEXT DEFAULT 'manual';
  -- 'manual' | 'chesscz'

ALTER TABLE databases ADD COLUMN chesscz_comp_id INTEGER;
ALTER TABLE databases ADD COLUMN chesscz_round_nr INTEGER;
ALTER TABLE databases ADD COLUMN chesscz_home_team_id INTEGER;
ALTER TABLE databases ADD COLUMN chesscz_away_team_id INTEGER;
```

Tyto sloupce umožňují tlačítku "Načíst výsledky" vědět kam volat.

---

## Ošetření okrajových případů

| Situace | Řešení |
|---------|--------|
| compId neexistuje | Chybová hláška pod polem |
| Výsledky ještě nejsou v API | Partie vytvořeny s `Result: *`, tlačítko "Načíst výsledky" zůstane aktivní |
| `matchGames.length` se liší od počtu partie | Použít délku `matchGames`, aktualizovat jen existující partie |
| `gameForfeited: 1` se nestandardním výsledkem | `Result: *` |
| Jméno hráče s diakritikou | `removeDiacritics()` vždy |
| Tým hraje v kole volný los (bye) | Schedule to nevrátí — žádný problém |

---

## Co se nemění

- Stávající flow vytvoření databáze (ruční název) zůstává
- GameEditor, GameViewer, engine panel
- Existující API endpointy
- Auth flow
- Stávající import PGN

---

## Co není součástí UC1

- Trvalá vazba databáze na soutěž / sledování celé sezóny (UC2)
- Role kapitán vs. hráč
- Sdílený přístup více uživatelů
- Výběr soutěže přes UI (kraj → sezóna → soutěž) bez znalosti compId
