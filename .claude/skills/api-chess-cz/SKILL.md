---
name: api-chess-cz
description: Volá veřejné REST API Šachového svazu ČR (api.chess.cz) — vyhledávání hráčů podle jména/LOK/FIDE ID, ELO ratingy, oddíly, soutěže družstev, tabulky, soupisky. Použij vždy, když projekt PGN Base potřebuje data o českých šachistech (např. autocomplete v HeaderForm, validace FIDE/LOK ID, doplnění Ela).
---

# api.chess.cz — REST API ŠSČR

Volání veřejného API Šachového svazu ČR. **Bez autentizace.**

Plná OpenAPI 3.0 specifikace: [`apichesscz.openapi.yaml`](../../../apichesscz.openapi.yaml) v kořeni repa.

## ⚠️ Rate-limit — kritické

Server agresivně blokuje IP po pár desítkách requestů v krátké době. Symptomem
je `connect timeout` na port 443 (ne 429!). Blok trvá v řádu hodin.

**Pravidla:**
- Max ~3 requesty/min z jedné IP.
- Pauza mezi requesty min. 20 s při explorování.
- **Cachuj odpovědi lokálně** — pro produkční integraci do PGN Base
  uložit do D1 nebo KV, nikdy nevolat na každý frontend request.
- Když test zachytí `Failed to connect to port 443 after 75000 ms`,
  **přestaň okamžitě** a počkej. Další pokusy block jen prodlouží.

## Base URL

```
https://api.chess.cz/api
```

## Identifikátory — pozor na nekonzistenci

| „Lidský" název | V URL jako | V odpovědích jako | Typ | Příklad |
|---|---|---|---|---|
| Č. oddílu | `:clubId` | `clubCode` (v `/clubs/all`!) **nebo** `clubId` (jinde) | **string** | `"12003"` |
| Č. LOK (ČŠS) | `:lokId` | `czeId` | integer | `708` |
| Č. FIDE | `:fideId` | `fideId` | integer | `327298` |

**Hlavní pasti:**
1. `/clubs/all` vrací každý oddíl jako `{clubId: 40103, clubCode: "17003", clubName: "..."}` —
   ale dál do URL musíš dát **`clubCode`**, ne `clubId`! `clubId` v této odpovědi
   je jen interní DB ID, jinde se nepoužívá.
2. Tatáž hodnota se v `/clubs/:clubId/details` odpovědi i v `/members/:lokId/cze`
   odpovědi vrací zase pod názvem `clubId` (a navíc jako **string**, ne integer).

## Tvar odpovědi: single object vs array

Většina list-like endpointů (`/clubs/:id/members`, `/members/:id/competitions`,
`/competitions/:id/table` …) vrací **buď jednotlivý objekt, nebo pole** podle
počtu výsledků. Vždy normalizuj:

```ts
const data = await fetch(url).then(r => r.json());
const items = Array.isArray(data) ? data : [data];
```

Detaily (`/competitions/:id/details`, `/members/:id/cze`) vracejí vždy
jednotlivý objekt. Výjimka: `/clubs/:id/details` vrací **array s 1 prvkem**.

## Klíčové endpointy pro PGN Base

### Autocomplete hráče v HeaderForm
```
GET /members/name?search=Novák Karel
```
Vrací max. 10 hráčů s `czeId`, `fideId`, `fullName`, `clubName`, `czeStdElo`, `fideStdElo`, …

### Doplnění Ela / kontrola existence po zadání ID
```
GET /members/{czeId}/cze
GET /members/{fideId}/fide
```
Vrátí stejný `Member` objekt (oba endpointy mají identické schéma).

### Seznam oddílů pro našeptávač
```
GET /clubs/all
```
Vrátí ~493 oddílů. Vhodné pro lokální cache (mění se zřídka).
**Pamatuj:** dál do URL používej `clubCode`, ne `clubId`.

### Partie hráče v ligových soutěžích
```
GET /members/{czeId}/games        # všechny
GET /members/{czeId}/games/20     # posledních N
```
Vrací metadata partií (bez tahů!) — barva, soupeř, ELO, soutěž, datum, kontumace.

## Příklady volání

```bash
# Vyhledat hráče podle jména (cca 6 KB)
curl 'https://api.chess.cz/api/members/name?search=Antoš%20Bořivoj'

# Detail hráče podle LOK ID (Karel Jukl)
curl 'https://api.chess.cz/api/members/708/cze'

# Seznam všech oddílů
curl 'https://api.chess.cz/api/clubs/all'

# Detail oddílu TJ Jawa Brodce (POZOR: 12003 = clubCode, ne clubId!)
curl 'https://api.chess.cz/api/clubs/12003/details'

# Členové oddílu
curl 'https://api.chess.cz/api/clubs/12003/members'

# Tabulka konkrétní soutěže (compId získáš z /competitions)
curl 'https://api.chess.cz/api/competitions/3242/table'
```

## Integrace do PGN Base

Backend (Cloudflare Worker) by měl mít:
- proxy endpoint `/api/v1/chesscz/members?search=` — volá `members/name`, cachuje výsledek na 1 den v KV
- proxy endpoint `/api/v1/chesscz/member/:type/:id` — volá `members/:id/cze` nebo `/fide`, cachuje na týden
- background job (cron) na sync seznamu oddílů (`/clubs/all`) jednou týdně do D1 tabulky `clubs`

Frontend volá vždy svůj Worker proxy, ne `api.chess.cz` přímo — vyhneme se
CORS + IP blockům.

## Mimo rozsah
`/events` a `/events/upcoming` v PGN Base nepoužíváme.
