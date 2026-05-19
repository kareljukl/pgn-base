# Feature: Board orientation flip

## Motivation

Replaying a game from Black's perspective without flipping the board makes coordinate-by-coordinate reading awkward. Chessground supports orientation switch natively; we just expose a button.

## Behaviour

Button `⇅` in the navigation row directly under the chessboard in `GameViewer`, `PublicGameViewer`, `GameEditor`. Click toggles `orientation` between `'white'` and `'black'`. Tooltip: "Otočit šachovnici".

State is `useState<'white' | 'black'>('white')` local to each page. Opening a different game resets to white — explicit decision; if the user is browsing a set of their black games, they flip once per game.

## Files

- `frontend/src/components/Board/Board.tsx` — already accepted `orientation` prop, no change.
- `frontend/src/components/Board/EditableBoard.tsx` — added `orientation?: 'white' | 'black'` prop, threaded into Chessground init and sync `useEffect`.
- `frontend/src/pages/GameViewer.tsx`, `PublicGameViewer.tsx`, `GameEditor.tsx` — local `orientation` state + nav-row flip button.

## Out of scope

- Persist orientation across navigation. Decided against because most users want a fresh white view per game.
- Auto-flip based on the user's identity / role (e.g., auto-black when user plays Black). Future possibility once we know how to identify "the user" in a game.
- Keyboard shortcut.
