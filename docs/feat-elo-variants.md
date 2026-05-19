# Feature: WhiteFideElo / WhiteCzeElo (+ Black) PGN tags

## Motivation

Standard `WhiteElo` / `BlackElo` PGN tags don't specify the rating system. For Czech club players we want unambiguous values per source: FIDE rating and ŠSČR rating, stored separately so future lookups (api.chess.cz refresh, filtering by federation rating) work without guessing what `WhiteElo` meant in any given game.

## Behaviour

Four new PGN tags written by `buildPgn`:
- `WhiteFideElo`, `BlackFideElo`
- `WhiteCzeElo`, `BlackCzeElo`

Standard `WhiteElo` / `BlackElo` stays — kept for backwards compatibility with imports from external sources. When the ŠSČR autocomplete fills a player, `WhiteElo` gets `fideStdElo` with `czeStdElo` as fallback (FIDE-first heuristic — most Czech players see FIDE as the canonical "Elo").

## Schema

```sql
ALTER TABLE games ADD COLUMN white_fide_elo INTEGER;
ALTER TABLE games ADD COLUMN black_fide_elo INTEGER;
ALTER TABLE games ADD COLUMN white_cze_elo  INTEGER;
ALTER TABLE games ADD COLUMN black_cze_elo  INTEGER;
```

Run on both local (`--local`) and remote (`--remote`) D1 via `wrangler d1 execute pgn-base-db --command "..."`.

## Files

- `backend/src/db/schema.sql` — column declarations.
- `backend/src/lib/pgn.ts` — `GameRow` type + `buildPgn()` writes the four tags.
- `backend/src/routes/games.ts` — `SELECT` columns, INSERT batch, PATCH, bulk-update statements.
- `backend/src/routes/public.ts` — SELECT for public list mirror.
- `frontend/src/lib/editorPgn.ts` — `EditorHeaders` (21 fields), `emptyHeaders`, `GameRowLike`, `headersFromGameRow`, `HEADER_KEYS`, `toApiHeaders`.
- `frontend/src/components/GameEditor/HeaderForm.tsx` — six Elo inputs in order WhiteElo / WhiteFideElo / WhiteCzeElo / BlackElo / BlackFideElo / BlackCzeElo.
- Page-local `Game` / `GameData` types (`DatabaseDetail.tsx`, `GameViewer.tsx`, `PublicGameViewer.tsx`) updated with the new columns.

PGN parser stays unchanged — `splitPgn` reads any `[Key "Value"]` into a generic `Record<string, string>`, so new tags from imported PGN are stored automatically.

## Out of scope

- Auto-recompute `WhiteElo` from the explicit variants. Once user fills the form manually, we don't second-guess.
- Filtering / sorting by Fide vs Cze Elo in DatabaseDetail. Future feature.
