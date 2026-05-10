# FEAT: Strom zahájení (Lichess Opening Explorer)

## Kontext

Lichess Opening Explorer API (`explorer.lichess.ovh`) nově vyžaduje autentizaci
Bearer tokenem kvůli ochraně proti DDOS. Token nesmí být v frontend kódu —
musí zůstat bezpečně na serveru.

Řešení: jeden servisní Personal Access Token uložený jako Cloudflare Worker secret.
Frontend volá vlastní backend proxy endpoint, Worker přidá token a přepošle
request na Lichess.

---

## Architektura

```
Frontend (GameViewer)
    ↓ GET /api/v1/explorer?fen=<FEN>
Cloudflare Worker (proxy)
    ↓ GET https://explorer.lichess.ovh/masters?fen=<FEN>
      Authorization: Bearer <LICHESS_TOKEN>
Lichess Explorer API
    ↓ JSON response
Worker → Frontend
```

Token nikdy neopustí Worker. Frontend ho nikdy neuvidí.

---

## Krok 0 — Získání Lichess Personal Access Token

1. Přihlaš se na lichess.org pod svým (servisním) účtem
2. Jdi na: `https://lichess.org/account/oauth/token`
3. Klikni **+** (nový token)
4. Název: `pgn-base-explorer`
5. Scope: **není potřeba vybírat žádný scope** — Explorer API vyžaduje
   pouze přihlášení, ne specifická oprávnění
6. Ulož token — zobrazí se jen jednou

Přidat token do Cloudflare Worker secrets:
```bash
wrangler secret put LICHESS_TOKEN
# zadej token a potvrď
```

Do `wrangler.toml` přidat do sekce `[vars]` poznámku (secret samotný tam není):
```toml
# LICHESS_TOKEN je nastaven jako secret přes wrangler secret put
```

---

## Backend — nový proxy endpoint

**Soubor:** `backend/src/routes/explorer.ts` (nový soubor)

```
GET /api/v1/explorer
```

Query parametry (přebírá od frontendu a přeposílá na Lichess):
- `fen` — aktuální pozice (povinný)
- `moves` — počet tahů (výchozí: 15)
- `topGames` — počet ukázkových partií (výchozí: 0, v MVP nepotřebujeme)

Endpoint:
- Je autentizovaný (vyžaduje přihlášeného uživatele PGN Base)
- Validuje že `fen` parametr je přítomen
- Volá `https://explorer.lichess.ovh/masters` s Bearer tokenem ze secrets
- Přeposílá response 1:1 na frontend
- Při chybě od Lichess (429, 503) vrátí srozumitelnou chybu

```typescript
// backend/src/routes/explorer.ts
import { Hono } from 'hono'

const explorer = new Hono<{ Bindings: { LICHESS_TOKEN: string } }>()

explorer.get('/', async (c) => {
  const fen = c.req.query('fen')
  if (!fen) return c.json({ error: 'fen parameter required' }, 400)

  const moves = c.req.query('moves') ?? '15'

  const url = new URL('https://explorer.lichess.ovh/masters')
  url.searchParams.set('fen', fen)
  url.searchParams.set('moves', moves)
  url.searchParams.set('topGames', '0')

  const resp = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${c.env.LICHESS_TOKEN}`,
    },
  })

  if (!resp.ok) {
    return c.json({ error: `Lichess API error: ${resp.status}` }, resp.status as any)
  }

  const data = await resp.json()
  return c.json(data)
})

export default explorer
```

Zaregistrovat v `backend/src/index.ts`:
```typescript
import explorer from './routes/explorer'
app.route('/api/v1/explorer', explorer)
```

---

## Frontend — Opening Explorer komponenta

**Soubor:** `frontend/src/components/OpeningExplorer/OpeningExplorer.tsx`

Aktuální stav: komponenta volá přímo `explorer.lichess.ovh` — to přestalo fungovat.

Změna: volat `/api/v1/explorer?fen=<FEN>` (vlastní backend proxy).

Hook `useOpeningExplorer.ts` — změnit URL:

```typescript
// PŘED (nefunkční):
const url = `https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(fen)}&moves=15`

// PO:
const url = `/api/v1/explorer?fen=${encodeURIComponent(fen)}&moves=15`
```

Zbytek hook logiky zůstává stejný (debounce, loading state, error handling).

---

## Zobrazení dat

Response od Lichess Explorer API:

```typescript
interface ExplorerMove {
  uci: string          // "e2e4"
  san: string          // "e4"
  white: number        // počet výher bílého
  draws: number
  black: number        // počet výher černého
  averageRating: number
}

interface ExplorerResponse {
  moves: ExplorerMove[]
  white: number        // celkový počet výher bílého z této pozice
  draws: number
  black: number
}
```

Zobrazení (stávající layout, jen opravit zdroj dat):

```
TAH    PARTIE    BÍLÝ / REMÍZA / ČERNÝ
e4     1.3M      32%    44%    24%
d4     1.0M      32%    45%    23%
Nf3    293tis    33%    45%    22%
```

Počet partií = `white + draws + black` pro daný tah.
Procenta = `white / total * 100` atd.

---

## Rate limiting

Lichess doporučuje max 1 request za sekundu. Stávající debounce 300ms
na změnu pozice je dostačující. Worker nemusí přidávat vlastní rate limiting
pro MVP (klub má malý provoz).

Pokud Lichess vrátí `429`:
- Frontend zobrazí nenápadnou zprávu: „Data zahájení nejsou momentálně dostupná"
- Neblokuje přehrávání partie

---

## Co se nemění

- Logika přehrávání tahů
- Chessground komponenta
- Stockfish engine panel
- Autentizace uživatelů PGN Base
- Všechny ostatní API endpointy

---

## Lokální vývoj

Do `backend/.dev.vars` přidat:
```
LICHESS_TOKEN=lip_EXAMPLE
```

(soubor je gitignored — token se nikdy nedostane do repozitáře)
