# FEAT: Kontextový panel partií v prohlížeči

## Kontext

Uživatel si na stránce `DatabaseDetail` vyfiltruje partie (např. hráč „Jukl" → 10 partií).
Klikne na jednu a otevře `GameViewer`. V tu chvíli ztratí přehled o ostatních vyfiltrovaných
partiích a musí se vracet zpět na seznam, aby mohl přepnout na další partii.

**Cíl:** Zachovat kontext vyfiltrovaného seznamu přímo v prohlížeči partie — zobrazit ho
jako boční panel, ze kterého lze přímo přepínat mezi partiemi bez návratu na seznam.

---

## Layout

```
┌──────────────────────────────────────────────────────────┐
│ PGN Base   Moje databáze   Veřejné databáze     K. Jukl  │
├──────────────────────────────────────────────────────────┤
│ ← SSS KS A 2025/26  ·  Filtr: „Jukl"  ·  10 partií     │
├──────────────┬───────────────────────────────────────────┤
│ 10 PARTIÍ    │  Jukl, Karel (1844)  vs  Cervinka (1904)  │
├──────────────┤                                           │
│ ▶ Jukl       │  [šachovnice]       1. d4  Nf6            │
│   Cervinka   │                     2. c4  c5              │
│   0-1        │                     ...                    │
│   2026.03.29 │                                           │
├──────────────┤                                           │
│   Jukl       ├───────────────────────────────────────────┤
│   Pokrupa    │  ⏮  ◀  ▶  ⏭                              │
│   1-0        ├───────────────────────────────────────────┤
│   2026.03.15 │  Engine · +0.2                            │
├──────────────┤                                           │
│   Jukl       │                                           │
│   Mares      │                                           │
│   ½-½        │                                           │
└──────────────┴───────────────────────────────────────────┘
```

---

## Změny v DatabaseDetail

Při kliknutí na partii předat do router state:

```typescript
navigate(`/db/${dbId}/game/${game.id}`, {
  state: {
    games: filteredGames,      // aktuálně zobrazené partie po filtrování
    filter: currentFilter,     // aktuální hodnota filtru (string)
    dbName: database.name,     // název databáze pro breadcrumb
    dbId: dbId,                // id databáze pro zpětný odkaz
  }
});
```

`filteredGames` = pole partií které jsou aktuálně viditelné v tabulce
(po aplikování search filtru, před stránkováním nebo všechny pokud
stránkování není implementováno).

---

## Změny v GameViewer

### Načtení state

```typescript
const location = useLocation();
const ctx = location.state as {
  games: Game[];
  filter: string;
  dbName: string;
  dbId: string;
} | null;

const hasSidebar = ctx && ctx.games && ctx.games.length > 0;
```

### Layout

- Pokud `hasSidebar === true`: grid `220px 1px 1fr`
- Pokud `hasSidebar === false`: původní layout bez sidebaru (zachovat zpětnou kompatibilitu)

### Breadcrumb

Zobrazit nad celým layoutem (nad gridem):

```
← {ctx.dbName}  ·  Filtr: „{ctx.filter}"  ·  {ctx.games.length} partií
```

- Klik na šipku `←` = `navigate(-1)` (zpět na seznam)
- Pokud `!hasSidebar`: zobrazit jen `← {dbName}` bez filtru (dbName načíst z API)

### Sidebar — specifikace

**Šířka:** 220px, pevná, bez možnosti resize (MVP)

**Hlavička sidebaru:**
```
{ctx.games.length} PARTIÍ
```
(verzálky, font-size 10px, color #999)

**Řádek partie:**
- Řádek 1: jméno bílého hráče (font-weight 600)
- Řádek 2: jméno černého hráče (color #555)
- Řádek 3: datum vlevo + výsledek vpravo

**Výsledek — barvy:**
- `1-0` → zelená (`#16a34a`)
- `0-1` → červená (`#dc2626`)
- `½-½` nebo `1/2-1/2` → šedá (`#888`)
- `*` → šedá (`#888`)

**Aktivní partie:**
- Levý border 3px `#2563eb`
- Pozadí `#eff6ff`

**Hover (neaktivní řádky):**
- Pozadí `#f9fafb`

**Přepnutí partie:**
```typescript
const handleSelectGame = (game: Game) => {
  navigate(`/db/${ctx.dbId}/game/${game.id}`, {
    state: ctx,     // předej stejný state dál (zachová sidebar)
    replace: true   // neukládat každé přepnutí do history
  });
};
```

`replace: true` zajistí že tlačítko Zpět v prohlížeči vrátí na seznam,
ne na předchozí partii v sidebaru.

**Scrollování:** sidebar má vlastní `overflow-y: auto`, nezávislý na hlavním obsahu.

**Read-only:** v sidebaru nejsou žádná tlačítka pro mazání ani editaci.

---

## Chování při přímém URL přístupu

Pokud uživatel otevře URL partie přímo (bez router state), `hasSidebar === false`.
GameViewer se zobrazí bez sidebaru — původní chování. Breadcrumb zobrazí
jen `← Databáze` s odkazem zpět (dbId načíst z URL parametru).

---

## Co se nemění

- Logika přehrávání tahů
- Stockfish / Engine panel
- Export funkce
- Chessground komponenta
