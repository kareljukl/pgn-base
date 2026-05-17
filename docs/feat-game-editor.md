# FEAT: Vytváření partie od nuly přes šachovnici

## Kontext

Stávající způsob přidání partie do databáze je pouze import PGN souboru nebo paste.
Tato featury přidává druhý způsob — zadání partie interaktivně tahy na šachovnici.

Hlavní use case: rychlý zápis partie po odehrání (5–15 minut).
Partie je přímočará — žádné varianty, komentáře ani speciální anotace.

---

## Vstup do editoru

V `DatabaseDetail` přibude tlačítko vedle „Importovat partie":

```
[ Export PGN ]  [ Export (bez komentářů) ]  [ + Nová partie ]  [ Importovat partie ]
```

Klik na **+ Nová partie** → přechod na novou stránku `/db/:id/game/new`

---

## Stránka editoru — URL a routing

```
/db/:id/game/new    ← nová partie
```

Po úspěšném uložení přesměrovat na `/db/:id/game/:newGameId` (viewer).
Po zahození přesměrovat zpět na `/db/:id`.

---

## Layout editoru

```
┌─────────────────────────────────────────────────────────────┐
│ ← SSS KS A 2025/26                        [Zahodit] [Uložit] │
├──────────────────────────┬──────────────────────────────────┤
│                          │  TAHY                            │
│   ŠACHOVNICE             │  1. e4  e5  2. Nf3  Nc6         │
│   (interaktivní)         │  3. Bb5  a6  4. Ba4  Nf6  ...   │
│                          │                                  │
│                          │                                  │
│                          │                                  │
│                          │  ECO: B12  Caro-Kann Defense     │
├──────────────────────────┤                                  │
│  ⏮  ◀  ▶  ⏭             │                                  │
├──────────────────────────┴──────────────────────────────────┤
│  STROM ZAHÁJENÍ          │  HLAVIČKY PARTIE                 │
│  (read-only)             │  Event  [________________]       │
│                          │  White  [________________] *     │
│  Tah    %    B/R/Č       │  Black  [________________] *     │
│  e4    45%  32/44/24     │  Date   [________________]       │
│  d4    36%  32/45/23     │  Round  [________________]       │
│  Nf3   10%  33/45/22     │  Result [* ▾]                    │
│                          │  WhiteElo  [______]              │
│                          │  BlackElo  [______]              │
│                          │  WhiteTeam [______________]      │
│                          │  BlackTeam [______________]      │
│                          │  WhiteFideId [________]          │
│                          │  BlackFideId [________]          │
│                          │  WhiteCzeId   [________]          │
│                          │  BlackCzeId   [________]          │
└──────────────────────────┴──────────────────────────────────┘
```

`*` = povinné pole

---

## Šachovnice — interaktivní zadávání tahů

### Základní chování

- Chessground nastaven do edit módu: `movable: { free: false, color: 'white' }`
- chess.js generuje legální tahy pro aktuální pozici
- Po každém tahu: chess.js validuje, Chessground zobrazí novou pozici
- SAN notace (včetně `+`, `#`, `=`) generuje chess.js automaticky
- Tahy se průběžně zobrazují v seznamu vpravo

### Navigace v zadaných tazích

- Tlačítka ⏮ ◀ ▶ ⏭ + klávesy ← →
- Klik na tah v seznamu → skok na pozici
- Při navigaci zpět je šachovnice v "prohlížecím" módu (nelze táhnout)
- Šachovnice se vrátí do edit módu automaticky když je uživatel na posledním tahu

### Promoce

- Při průchodu pěšce na poslední řadu zobrazit dialog s výběrem figury (D, V, S, J)
- chess.js/Chessground toto podporují nativně

---

## Editace existujících tahů

Scénář: partie má N tahů, uživatel se naviguje na tah K (K < N) a zahraje jiný tah.

Zobrazí se nenápadný inline dialog přímo pod šachovnicí (ne modal přes celou stránku):

```
┌─────────────────────────────────────────────┐
│  Zahráli jste jiný tah než je zapsán.       │
│                                             │
│  [Přepsat]  Smaže tahy K+1 až N, vloží     │
│             nový tah K. Partie pokračuje.   │
│                                             │
│  [Nahradit]  Nahradí tah K, zkontroluje    │
│              platnost tahů K+1 až N.        │
│                                             │
│  [Zrušit]   Vrátí původní tah K.           │
└─────────────────────────────────────────────┘
```

Dokud uživatel nevybere volbu, nelze pokračovat v zadávání tahů.

### Přepsat

- Tahy K+1 až N se smažou
- Tah K se nahradí novým
- Partie pokračuje od nové pozice

### Nahradit

1. Nahradit tah K novým tahem
2. Projet tahy K+1 až N sekvenčně a ověřit legalitu každého vůči nové pozici
3. Zastavit se u prvního neplatného tahu

Zobrazit dialog s mini šachovnicí:

```
┌─────────────────────────────────────────────────┐
│  Nahradit tah?                                  │
│                                                 │
│  ┌─────────┐   Zachová se 12 tahů ze 14         │
│  │  mini   │   Tahy 13–14 budou zahozeny        │
│  │ board   │   (první neplatný: tah 13 Nxf7)    │
│  └─────────┘                                    │
│                                                 │
│  Poslední platná pozice: po tahu 12             │
│                                                 │
│       [Potvrdit]        [Zrušit]                │
└─────────────────────────────────────────────────┘
```

Mini šachovnice zobrazuje pozici (FEN) po posledním platném tahu.
Uživatel vidí odkud bude partie pokračovat bez nutnosti procházet tahy.

**Pokud jsou všechny tahy K+1..N platné:**
```
┌─────────────────────────────────────────────────┐
│  Nahradit tah?                                  │
│                                                 │
│  ┌─────────┐   Všechny zbývající tahy jsou      │
│  │  mini   │   platné. Partie bude zachována    │
│  │ board   │   v plném rozsahu (14 tahů).        │
│  └─────────┘                                    │
│                                                 │
│       [Potvrdit]        [Zrušit]                │
└─────────────────────────────────────────────────┘
```

Mini šachovnice zobrazuje finální pozici partie.

**Po potvrzení:**
- Tah K nahrazen novým tahem
- Tahy K+1 až poslední platný zachovány
- Neplatné tahy zahozeny
- Editor pokračuje od posledního platného tahu

---

## Hlavičky partie

### Povinná pole

- `White` — jméno bílého hráče
- `Black` — jméno černého hráče
- `Event` — název turnaje/soutěže

Uložení zablokováno pokud jsou povinná pole prázdná.
Zobrazit validační hlášku u prázdných povinných polí při pokusu o uložení.

### Volitelná pole

- `Date` — předvyplnit dnešním datem ve formátu `YYYY.MM.DD`
- `Round`, `WhiteElo`, `BlackElo`, `WhiteTeam`, `BlackTeam`
- `WhiteFideId`, `BlackFideId`, `WhiteCzeId`, `BlackCzeId` — prostá textová pole
- `Result` — dropdown: `*`, `1-0`, `0-1`, `1/2-1/2` (výchozí: `*`)

### Automaticky doplňované tagy

- `PlyCount` — počítá se automaticky z tahů, uživatel nezadává
- `ECO` — viz sekce níže

### ECO

- Při každém tahu volat Opening Explorer API (`/api/v1/explorer?fen=<FEN>`)
- Response obsahuje `opening.eco` a `opening.name` pokud pozici Explorer zná
- Ukládat poslední validní ECO hodnotu kterou Explorer vrátil
- Pokud Explorer pro aktuální pozici ECO nevrátí, zůstane poslední known hodnota
- ECO se zobrazuje jako read-only informace vedle hlaviček (ne editovatelné pole)

```
ECO: B12  Caro-Kann Defense   ← automaticky, read-only
```

---

## Výsledek partie

Dropdown s hodnotami:
- `*` — partie probíhá / nezadán (výchozí)
- `1-0` — vyhrál bílý
- `0-1` — vyhrál černý
- `1/2-1/2` — remíza

Mat detekovaný chess.js → automaticky nastavit Result na `1-0` nebo `0-1`
a zobrazit nenápadné oznámení: „Mat — výsledek nastaven na 1-0".
Uživatel může výsledek změnit ručně.

Podobně pat → automaticky `1/2-1/2`.

---

## Autosave

- Každou minutu uložit stav do `localStorage`
- Klíč: `pgn-base-draft-{dbId}` (jeden draft per databáze)
- Ukládá se: tahy, všechny hlavičky, aktuální pozice (index tahu)

### Obnova draftu

Při otevření `/db/:id/game/new` zkontrolovat localStorage:
```
┌──────────────────────────────────────────────────┐
│  Máte neuložený draft z [datum čas].             │
│  White: Novak, Jan  vs  Black: Svoboda, Petr     │
│                                                  │
│  [Obnovit draft]        [Začít znovu]            │
└──────────────────────────────────────────────────┘
```

Po úspěšném uložení nebo zahození → smazat draft z localStorage.

---

## Tlačítka Uložit / Zahodit

### Uložit

1. Validovat povinná pole (Event, White, Black)
2. Sestavit PGN string z tahů a hlaviček
3. `POST /api/v1/databases/:id/games`
4. Po úspěchu smazat localStorage draft
5. Přesměrovat na viewer nové partie

### Zahodit

Zobrazit potvrzovací dialog:
```
Zahodit neuloženou partii?
Všechny zadané tahy a hlavičky budou ztraceny.
[Zahodit]  [Pokračovat v editaci]
```

Po potvrzení smazat localStorage draft a přesměrovat na `/db/:id`.

---

## Strom zahájení v editoru

- Zobrazit Opening Explorer panel ve stejné podobě jako v GameViewer
- Read-only — slouží jako reference při zadávání tahů
- Aktualizuje se při každé změně pozice (stejný debounce 300ms)
- Klik na tah v Exploreru v této fázi **nepodporujeme** (Fáze 2)

---

## Backend — žádné změny

Editor používá stávající endpoint:
```
POST /api/v1/databases/:id/games
```

Sestavený PGN string se pošle stejně jako při importu.

---

## Co není součástí této featury

- Klik na tah v Opening Exploreru pro vložení tahu (Fáze 2)
- Komentáře a varianty (mimo scope editoru — jen viewer)
- Integrace s appchess.cz API pro napovídání hráčů (Fáze 2)
- Kontumace a nestandardní výsledky (Fáze 2)
- Autosave do D1 jako draft stav (Fáze 2)

---

## Co se nemění

- GameViewer komponenta
- Import PGN funkce
- Strom zahájení v GameViewer
- Všechny ostatní API endpointy
- Auth flow
