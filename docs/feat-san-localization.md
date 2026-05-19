# Feature: SAN display localization (PGN / Cze / figurine)

## Motivation

SAN was always rendered straight from chess.js: `Nf3`, `Bxe5`, `e8=Q`. Czech club players use local notation (J/D/V/S/K) and competing platforms (Lichess, chess.com) render with figurine glyphs. Add a 3-way display toggle that respects the user's preference without touching what we store.

## Behaviour

Global selector `PGN | Cze | ♞` lives in the app header (`Layout.tsx`), persisted in `localStorage['pgn-base-san-format']`. Default `PGN`.

- **PGN** — chess.js SAN unchanged.
- **Cze** — first piece letter `K/Q/R/B/N` mapped to `K/D/V/S/J`; promotion suffix `=X` mapped too.
- **Figurine** — first piece letter (and any promotion piece) wrapped in styled `<span>` with filled black Unicode glyphs `♚♛♜♝♞` at `font-size: 1.4em` and a small `vertical-align` tweak (`-0.01em`) so the glyph bottom roughly sits on the text baseline.

Edge cases handled: pawn moves (`e4`, `exd5`), castling (`O-O`, `O-O-O`), disambiguation (`Nbd7`, `R1e1`), check/mate (`+`, `#`), promotion (`e8=Q+`).

## Where it renders

Display-only transformation at four sites. Storage stays English everywhere (D1 `moves_pgn`, PGN export, chess.js parsing).

- `components/MoveList/MoveList.tsx` (recursive `Moves`, `sanMode` propagated as prop)
- `components/Analysis/Analysis.tsx` (PvLine; cloud + local PV both)
- `components/OpeningBook/OpeningBook.tsx` (Lichess Masters row)
- `components/GameEditor/EditorMoveList.tsx` (per-move `MoveSpan`)

`lib/variantArrows.ts` passes SAN to chess.js for `from`/`to` square computation but does not render text, so it stays untouched.

## Files

- `frontend/src/lib/sanFormat.tsx` — `formatSan(san, mode): ReactNode`.
- `frontend/src/hooks/useSanFormat.ts` — `useSyncExternalStore` over module-level state + localStorage. Pattern copied from `useVariantArrowsToggle.ts`.
- `frontend/src/components/SanFormatToggle.tsx` — 3-state button group.
- `frontend/src/components/Layout.tsx` — toggle inserted between `<nav>` and the user/login block.

## Out of scope

- PGN export in chosen notation. PGN is an international standard, always English.
- Diacritics-insensitive search or custom mapping. Standard Czech convention `J/D/V/S/K` only.
- Keyboard shortcut to cycle modes.
- Custom chess font (Maestro etc.) for figurine. Plain Unicode glyphs are good enough; if rendering on a specific device looks off, address then.
