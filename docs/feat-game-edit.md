# FEAT: Editace existující partie

## Kontext

GameEditor komponenta vzniká v rámci `feat-game-editor.md` pro vytváření
nových partií. Tato featura ji rozšiřuje o možnost editace existující partie —
hlaviček i tahů.

---

## Sdílená komponenta GameEditor

Editor pro novou partii i editaci existující používají **stejnou komponentu**
`GameEditor` s props:

```typescript
interface GameEditorProps {
  mode: 'create' | 'edit'
  dbId: string
  initialGame?: Game        // pouze pro mode='edit'
  initialMoveIndex?: number // pozice kurzoru při otevření
}
```

**mode='create':** prázdná šachovnice, prázdné hlavičky, POST na uložení
**mode='edit':** předvyplněná šachovnice a hlavičky, PATCH na uložení

---

## Vstup do editoru

Tlačítko **Upravit partii** v GameViewer — vedle tlačítka Export PGN:

```
Jukl, Karel (1844) vs Cervinka, Pavel (1904)  0-1   KSA · 2026.03.29   [Upravit partii] [Export PGN]
```

Klik → přechod na `/db/:id/game/:gameId/edit`

Router state při přechodu:
```typescript
navigate(`/db/${dbId}/game/${gameId}/edit`, {
  state: {
    currentMoveIndex: currentMoveIndex  // aktuální pozice v GameViewer
  }
})
```

---

## URL a routing

```
/db/:id/game/:gameId/edit
```

Po úspěšném uložení → přesměrovat zpět na `/db/:id/game/:gameId` (viewer).
Po zahození → přesměrovat zpět na `/db/:id/game/:gameId` (viewer).

---

## Inicializace editoru

### Načtení dat

```typescript
// Načíst partii z API
GET /api/v1/databases/:id/games/:gameId
```

### Pozice kurzoru

Priorita:
1. `location.state.currentMoveIndex` — pozice z GameViewer před přechodem
2. Fallback: index 0 (začátek partie)

Editor přehraje tahy až na daný index a zobrazí odpovídající pozici na šachovnici.

### Partie bez tahů

Pokud `game.moves_pgn` je prázdný string nebo null:
- Šachovnice zobrazí startovní pozici
- Seznam tahů je prázdný
- Kurzor na indexu 0
- Editor je ihned připraven přijímat tahy

---

## Layout editoru

Identický s editorem nové partie (viz `feat-game-editor.md`):

```
┌─────────────────────────────────────────────────────────────┐
│ ← Jukl, Karel vs Cervinka, Pavel          [Zahodit] [Uložit] │
├──────────────────────────┬──────────────────────────────────┤
│                          │  TAHY                            │
│   ŠACHOVNICE             │  1. d4  Nf6  2. c4  c5           │
│   (interaktivní)         │  3. d5  b5  ...                  │
│                          │                                  │
│                          │  ECO: A60  Modern Benoni         │
├──────────────────────────┤                                  │
│  ⏮  ◀  ▶  ⏭             │                                  │
├──────────────────────────┴──────────────────────────────────┤
│  STROM ZAHÁJENÍ          │  HLAVIČKY PARTIE                 │
│  (read-only)             │  Event  [KSA SSS 25/26_________] │
│                          │  White  [Jukl, Karel___________] │
│  ...                     │  Black  [Cervinka, Pavel________] │
│                          │  ...                             │
└──────────────────────────┴──────────────────────────────────┘
```

Breadcrumb zobrazuje jména hráčů místo názvu databáze:
`← Jukl, Karel vs Cervinka, Pavel`

---

## Editace tahů

Identická logika jako v editoru nové partie:
- Navigace ⏮ ◀ ▶ ⏭ + klávesy ← →
- Zahraní jiného tahu → inline dialog Přepsat / Nahradit / Zrušit
- Nahradit s mini šachovnicí výsledné pozice
- Přidávání tahů za poslední existující tah

---

## Autosave

Stejný mechanismus jako u nové partie, jiný klíč v localStorage:

```
pgn-base-draft-edit-{gameId}
```

Ukládá se každou minutu: tahy, hlavičky, aktuální pozice (index tahu).

### Obnova draftu při otevření editoru

```
┌──────────────────────────────────────────────────┐
│  Máte neuložené změny z [datum čas].             │
│  Partie: Jukl, Karel vs Cervinka, Pavel          │
│                                                  │
│  [Obnovit změny]        [Začít znovu]            │
└──────────────────────────────────────────────────┘
```

„Začít znovu" načte původní data z API (zahodí draft).

---

## Uložení

### Backend — nový endpoint

```
PATCH /api/v1/databases/:id/games/:gameId
```

Body: stejná struktura jako POST při importu:
```typescript
{
  event, site, date, round, board,
  white, black, white_elo, black_elo,
  white_team, black_team, result, eco,
  moves_pgn  // sestavený PGN movetext
}
```

### Flow

1. Validovat povinná pole (Event, White, Black)
2. Sestavit PGN string z tahů a hlaviček
3. `PATCH /api/v1/databases/:id/games/:gameId`
4. Po úspěchu smazat localStorage draft
5. Přesměrovat na viewer: `/db/:id/game/:gameId`

### Zahodit

```
Zahodit neuložené změny?
Všechny úpravy budou ztraceny, partie zůstane beze změn.
[Zahodit změny]  [Pokračovat v editaci]
```

Po potvrzení smazat localStorage draft a přesměrovat na viewer.

---

## Backend změny

### Nový endpoint

```typescript
// backend/src/routes/games.ts — přidat:
PATCH /api/v1/databases/:id/games/:gameId
```

- Autentizovaný, pouze owner databáze
- Validace: gameId musí patřit do dané databáze
- Aktualizuje všechna pole včetně `moves_pgn` a `updated_at`

---

## Upravované soubory

**Frontend:**
- `frontend/src/components/GameEditor/GameEditor.tsx` — přidat mode='edit' logiku
- `frontend/src/pages/GameEditorPage.tsx` (nebo ekvivalent) — nová route pro edit
- `frontend/src/pages/GameViewer.tsx` — přidat tlačítko Upravit partii + předání currentMoveIndex

**Backend:**
- `backend/src/routes/games.ts` — přidat PATCH endpoint

---

## Co se nemění

- GameViewer logika přehrávání
- Import PGN
- Strom zahájení
- Engine panel
- Ostatní API endpointy
- Auth flow
- DatabaseDetail
