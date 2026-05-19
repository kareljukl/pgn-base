# Feature: Single "Analýza" box (cloud-eval + Stockfish merged)

## Motivation

Two separate boxes (Stockfish + Lichess Cloud Eval) sat in the side panel of every viewer. The cloud box only showed the first UCI half-move and a depth label, while Stockfish carried the rich MultiPV UI. Users had to ignore one or the other depending on the position. Lichess itself merges the two into one panel where local engine fills cache misses, so we matched that pattern.

## Behaviour

One box labelled "Analýza" rendered in `GameViewer`, `PublicGameViewer`, and `GameEditor`.

**Priority rules:**
1. Cloud has data for current FEN → display cloud PVs, header says `Lichess cloud · d{N}`.
2. Cache miss + Engine ON + local has results → display local PVs, header says `Stockfish 18 · d{N}`.
3. Otherwise → status placeholder (`Načítání cloud eval…`, `Cloud eval není k dispozici. Zapněte engine…`, `Načítání enginu…`, `Stockfish hledá…`).

**CPU efficiency.** When cloud has data, `Analysis.tsx` calls `useStockfish.stopAnalysis()` to keep the engine idle (worker stays alive, just doesn't search). On cache miss, it calls `startAnalysis(fen)`. The engine pauses again when the next FEN hits cache.

**Best-move arrow.** Drawn from whichever source is currently displayed (cloud first UCI or local PV[0]). `Šipky` toggle in the header gates rendering.

**MultiPV setting** bounds rows from both sources (cloud returns up to 5). **Depth slider** only affects the local engine; cloud depth is whatever Lichess returned.

## Files

- `frontend/src/components/Analysis/Analysis.tsx` — source-aware data flow, header, PvLine.
- `frontend/src/hooks/useCloudEval.ts` — React Query over `/cloud-eval?multiPv=5`, converts full UCI PV to SAN via `lib/uciToSan.ts`.
- `frontend/src/lib/uciToSan.ts` — `uciSequenceToSan(fen, uciMoves)`, extracted from `useStockfish` and reused.
- Removed: `frontend/src/components/OpeningExplorer/` directory and `hooks/useOpeningExplorer.ts`. `GameViewer.tsx` / `PublicGameViewer.tsx` lost their `<OpeningExplorer />` callsites.

## Out of scope

- Source mixing (e.g., cloud 3 PVs + local fills to 5).
- Manual source toggle ("force Stockfish").
- Tabs / multi-panel layout.
