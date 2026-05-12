# Možnosti použití komponent — PGN Base

_Analýza provedena 2026-05-10_

---

## 1. Chessground 9.2.1 — co umí a jak se používá

### Co Chessground je (a není)

Čistě UI knihovna — vykresluje šachovnici, figury a animace. **Neobsahuje šachovou logiku** — neví co je legální tah, nezná pravidla šachu. Veškerá logika (legální tahy, validace, FEN) musí přijít zvenku (chess.js).

```
Chessground(element, config) → Api
    ↕ set(config)          — aktualizace pozice/nastavení
    ↕ setAutoShapes(...)   — programatické šipky/kroužky
    ↕ events.move(...)     — callback když uživatel táhne
```

### Kompletní přehled schopností

#### Zobrazení pozice
```ts
{ fen, orientation, turnColor, check, lastMove }
```
- `check` — zvýrazní krále v šachu (červeně)
- `lastMove` — zvýrazní poslední tah (2 políčka)
- `orientation` — otočení desky

#### Interaktivní táhnutí (`movable`)
```ts
movable: {
  color: 'white',
  dests: Map<Key, Key[]>,    // legální cílová políčka z chess.js
  showDests: true,
  events: {
    after: (orig, dest, meta) => void
  }
}
```

#### Kreslení šipek a kroužků (`drawable`)
```ts
drawable: {
  enabled: true,             // pravý klik + tah = šipka, klik = kroužek
  brushes: { green, red, blue, yellow },
  onChange: (shapes) => void
}

// Programatické šipky (engine, opening explorer)
cg.setAutoShapes([
  { orig: 'e2', dest: 'e4', brush: 'green' },
  { orig: 'e4', brush: 'blue' },              // samotný kroužek
])
```

#### Vlastní zvýraznění políček
```ts
highlight: {
  custom: new Map([['e4', 'css-class'], ['d4', 'another-class']])
}
```

#### Další funkce
- **Premoves** (`premovable`) — pro online hru v reálném čase
- **Piece drop** (`dropmode`, `predroppable`) — Crazyhouse varianta
- **Exploze** (`cg.explode([...])`) — Atomic chess animace
- **API metody:** `getFen()`, `toggleOrientation()`, `move()`, `setPieces()`, `selectSquare()`

### Co aktuálně používáte vs. co ne

| Funkce | Použito | Poznámka |
|---|---|---|
| FEN render | ✅ | |
| `lastMove` highlight | ✅ | |
| `animation` 200ms | ✅ | |
| `coordinates` | ✅ | |
| `viewOnly: true` | ✅ | interakce zablokována |
| `check` highlight | ❌ | chess.js umí detekovat, stačí předat |
| `drawable` (uživatelské šipky) | ❌ | |
| `setAutoShapes` (engine šipky) | ❌ | Stockfish výstup jde jen do textu |
| `movable` (interaktivní tahy) | ❌ | |
| `highlight.custom` | ❌ | |

### Poznámka k React integraci

Chessground je imperativní (mutuje DOM přímo), React je deklarativní. Proto `Board.tsx` používá `useRef` + `useEffect` místo JSX props — to je správný přístup. Riziko dvojité inicializace v React Strict Mode (dev) řeší `cgRef.current` guard.

---

## 2. Ekosystém dostupných komponent

### Šachovnicové UI knihovny

#### `react-chessboard` v5.10.0
React wrapper šachovnice od komunity (ne Lichess), drag & drop přes `@dnd-kit`.
- **Problém:** vlastní renderer (ne Chessground) → jiné CSS, nelze mixovat s existující deskou
- Hodí se jen při kompletní výměně šachovnice

#### `cm-chessboard` v8.12.7
SVG šachovnice, zero dependencies, framework-agnostická.
- Modernější rendering než Chessground (SVG vs. DOM)
- Horší fit pro tento projekt — Chessground je zavedenější

**Závěr:** Chessground je správná volba, žádný důvod měnit.

### Celé PGN viewery (all-in-one)

#### `@lichess-org/pgn-viewer` v2.6.0
Lichess vlastní PGN viewer (to co vidíte ve studiích a analýze na Lichess).
- Plnohodnotný viewer: deska + seznam tahů + navigace + anotace
- **Ale:** používá Snabbdom (vlastní virtual DOM Lichess), **není React**
- Závislosti: `@lichess-org/chessground` + `chessops` + `snabbdom`
- Integrace do React projektu = ruční obálka, nepohodlná komunikace se zbytkem aplikace
- **Prakticky nepoužitelné** v React projektu bez velké obálky

#### `@mliebelt/pgn-viewer` v1.6.11
Komunitní PGN viewer, framework-agnostický.
- Editor + viewer mode, i18n, klávesové zkratky (mousetrap)
- Těžký: chessground + FontAwesome + modaly + smoothscroll
- Stejný problém — framework-agnostický = ruční integrace do Reactu
- Vhodné spíše pro vanilla JS weby

### Parsery (standalone)

#### `@mliebelt/pgn-parser` v1.4.19
PEG parser PGN formátu, vrátí AST stromu.
- Robustnější parsing edge cases (RAV, escape sequences, unicode)
- Stávající `parseMoveText()` v `moveTree.ts` je ale uzpůsobený pro `MoveNode` formát a funguje — výměna by byla migrace bez viditelného přínosu

### `chessops` v0.15.0 — nejzajímavější alternativa

Lichess vlastní šachová logika — čím nahradili chess.js ve svém stacku.

```ts
// chess.js (nyní)
const chess = new Chess(fen);
chess.move('e4');

// chessops (alternativa)
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';

const pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
const move = parseSan(pos, 'e4');
pos.play(move!);
```

Co navíc oproti chess.js:
- **Position hashing** (Zobrist) — klíčové pro vyhledávání pozic
- Podpora variant: Chess960, Atomic, Crazyhouse, Antichess, KingOfTheHill
- Lepší TypeScript typy (Result monad místo exceptions)
- `chessops/pgn` — zabudovaný PGN parser i serializer
- Aktivně vyvíjen Lichess týmem

**Kdy má smysl přejít:** pokud se přidá vyhledávání pozic nebo Chess960. Jinak chess.js stačí.

### Seznam tahů — stav ekosystému

Neexistuje žádná standalone React komponenta pro stromový seznam tahů (hlavní linie + větve + komentáře + NAG symboly) která by byla dostatečně flexibilní a dobře udržovaná. Všechny kompletní viewery (`@lichess-org/pgn-viewer`, `@mliebelt/pgn-viewer`) to řeší interně a move list nevystavují jako izolovanou komponentu.

**Závěr:** Vlastní seznam tahů nad stávající `MoveNode[]` strukturou je správné řešení. Vylepšení jsou čistě věcí UX designu — žádná knihovna nepomůže lépe než vlastní kód.

---

## 3. Snabbdom a vývoj nad Lichess stackem

### Co je Snabbdom

Minimalistická virtual DOM knihovna — alternativa Reactu, kterou si Lichess vybral jako svůj UI framework. Funguje podobně jako React (diff + patch DOM), ale s odlišnou syntaxí a bez ekosystému frameworku.

```ts
import { init, h } from 'snabbdom';

const patch = init([/* moduly: attrs, events, style... */]);

const vnode = h('div.container', [
  h('h1', 'Analýza partie'),
  h('button', { on: { click: handleClick } }, 'Další tah'),
]);

patch(document.getElementById('app'), vnode);
```

Žádné JSX, žádné hooky, žádné komponenty v Reactím smyslu — jen funkce `h()` vracející virtual node a `patch()` aplikující ho na DOM. Snabbdom core je ~3 KB.

### Co z Lichess ekosystému se otevře

```
Lichess open-source stack
├── chessground             ← npm, framework-agnostický        ✅ použitelné v Reactu i Snabbdom
├── chessops                ← npm, čistá logika bez UI         ✅ použitelné kdekoliv
├── @lichess-org/pgn-viewer ← npm, Snabbdom uvnitř            ✅ nativně v Snabbdom
└── lila (hlavní app)       ← monorepo, Snabbdom, nepublikovaný ❌ nelze importovat
```

Klíčový rozdíl: `@lichess-org/pgn-viewer` (plnohodnotný viewer: deska + seznam tahů + navigace + anotace) je v Reactu použitelný jen jako imperativně mountovaný widget s ruční komunikací. Ve Snabbdom projektu ho použijete přirozeně jako každou jinou komponentu.

### Co byste oproti Reactu ztratili

- Žádné hooky — state management sami (vlastní observables, RxJS, nebo nano-stores)
- Žádný React Router — routing přes page.js, navigo, nebo custom
- Žádný TanStack Query — fetching a caching od základu
- Žádný Zustand — globální stav sami
- Výrazně menší komunita, méně hotových komponent, méně dokumentace

Lichess tyto věci řeší interně vlastními utility wrappers kolem Snabbdom — ale ty nejsou vydány jako npm balíčky. Přebírali byste render engine, ne jejich celý stack.

### Kdy Snabbdom dává smysl

**Dává:** záměr přispívat přímo do Lichess `lila` repozitáře — pak Snabbdom znát musíte.

**Nedává:** vlastní nový projekt analýzy partií. Jediná konkrétní výhra je nativní `@lichess-org/pgn-viewer` — to nestojí za ztrátu celého React ekosystému.

### Realističtější alternativy pokud ne React

**Svelte** — compiled, velmi malý bundle, intuitivní component model, snadná integrace Chessground + chessops, rostoucí ekosystém. Nejlepší poměr DX vs. výsledná velikost pro chess projekty.

**Vanilla TypeScript + Snabbdom** — to co dělá Lichess interně. Smysl pouze pokud chcete absolutně minimální stack bez jakýchkoliv frameworkových závislostí a jste připraveni vše ostatní stavět sami.

---

## 4. Mapa možných rozšíření

### Vysoký přínos, nízká složitost

| Rozšíření | Soubory | Popis |
|---|---|---|
| Stockfish šipky | `useStockfish.ts`, `Board.tsx` | best move → `setAutoShapes()` |
| Check highlight | `Board.tsx` | `chess.inCheck()` → `check: turnColor` |
| Uživatelské šipky | `Board.tsx` | `drawable: { enabled: true }` |
| Klávesové zkratky navigace | nový `useKeyNav.ts` | `←` `→` pro pohyb v tahech |

### Vysoký přínos, střední složitost

| Rozšíření | Popis |
|---|---|
| Vylepšený seznam tahů | Stromové větve, inline komentáře, NAG ikony — custom React komponenta |
| Eval bar | Stockfish `cp`/`mate` hodnota → vizuální pruh — custom |
| Anotační editor | Klik na tah → editace komentáře → uložení do DB |

### Nízký přínos, vysoká složitost

| Rozšíření | Důvod |
|---|---|
| Migrace na chessops | Nutná jen pro varianty nebo position hashing |
| Integrace @lichess-org/pgn-viewer | Snabbdom vs. React friction |
| Vyhledávání pozic | Velká změna DB schématu + backend indexování FENů |
