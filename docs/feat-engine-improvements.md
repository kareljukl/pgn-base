# FEAT: Vylepšení chess engine panelu

## Kontext

Aktuální engine panel zobrazuje hodnocení a hlavní variantu v UCI formátu
(`e2e4`, `c7c6`) který je pro šachisty nečitelný. Chybí podpora více variant
(MultiPV) a vizualizace nejlepšího tahu na šachovnici.

---

## Změny

### 1. UCI → SAN konverze

Tahy v engine panelu převést z UCI (`e2e4`) na SAN (`e4`).

chess.js umí konverzi — pro každý UCI tah z Stockfish PV:
```typescript
const chess = new Chess(currentFen)
const move = chess.move({ from: uci.slice(0,2), to: uci.slice(2,4), promotion: uci[4] })
const san = move.san  // "e4", "Nxf7+", "O-O" atd.
```

Konverzi provést v `useStockfish.ts` hooku při zpracování `info` zpráv od Stockfish.

---

### 2. MultiPV — více variant

Stockfish nastavit na počítání více variant současně.

**Výchozí hodnota:** 3 varianty

**Nastavení:** spinner/input v engine panelu (rozsah 1–5)

UCI příkaz pro Stockfish:
```
setoption name MultiPV value 3
```

Po změně MultiPV restartovat analýzu aktuální pozice.

**Zobrazení:**

```
  +0.5   e4  c6  d4  d5  exd5  cxd5  c4  Nf6  Nc3
  +0.3   d4  d5  c4  e6  Nc3  Nf6  Nf3
  +0.2   Nf3  d5  d4  Nf6  c4  e6
```

Každý řádek: hodnocení (pevná šířka, zarovnáno) + tahy SAN oddělené mezerami.

Pokud Stockfish najde mat: zobrazit `#3` místo číselného hodnocení.

Hodnocení z pohledu hráče na tahu:
- Kladné = výhoda hráče na tahu
- Záporné = nevýhoda hráče na tahu

---

### 3. Šipky na šachovnici

Nejlepší tah (první varianta MultiPV) zobrazit jako šipku přímo na šachovnici.

**Výchozí stav:** vypnuto

**Ovládání:** toggle tlačítko v engine panelu

```
[ Engine ON ]  Stockfish 18 · d18    Šipky: [OFF]    MultiPV: 3 ↕    Hloubka: 18 ↕
```

Chessground podporuje šipky přes `drawable.shapes`:
```typescript
chessground.set({
  drawable: {
    shapes: [{
      orig: 'e2',   // from (první 2 znaky UCI)
      dest: 'e4',   // to (znaky 3-4 UCI)
      brush: 'green'
    }]
  }
})
```

Po vypnutí šipek vymazat shapes (`shapes: []`).
Šipky aktualizovat při každé nové analýze.
Šipky nezobrazovat pokud je engine vypnutý.

---

## Stav nastavení

Nastavení (MultiPV, hloubka, šipky zapnuto/vypnuto) persistovat do `localStorage`:
```
pgn-base-engine-settings = { multiPV: 3, depth: 18, arrows: false }
```

Načíst při inicializaci engine panelu.

---

## Upravované soubory

- `frontend/src/hooks/useStockfish.ts` — UCI→SAN konverze, MultiPV podpora
- `frontend/src/components/Analysis/Analysis.tsx` — nové UI panelu
- `frontend/src/components/Board/Board.tsx` (nebo wrapper) — předání shapes pro šipky

---

## Co se nemění

- Logika zapínání/vypínání enginu
- Komunikace se Stockfish Web Workerem mimo MultiPV nastavení
- GameViewer layout
- Strom zahájení
- MoveList komponenta
- Vše ostatní
