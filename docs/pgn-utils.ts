/**
 * pgn-utils.ts
 *
 * Sdílené utility pro práci s PGN textem.
 * Extrahováno z pgn-merger, upraveno pro TypeScript.
 */

/* ── Diakritika ─────────────────────────────────────────────────────────── */

/**
 * Odstraní diakritiku z řetězce pomocí NFD normalizace.
 * "Dvořák" → "Dvorak", "Šach" → "Sach"
 *
 * Použití: jména hráčů, názvy týmů a turnajů pro export PGN
 * kompatibilní s Stockfish a dalšími nástroji na macOS.
 */
export function removeDiacritics(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/* ── PGN movetext stripping ─────────────────────────────────────────────── */

/**
 * Odstraní komentáře v složených závorkách { ... }.
 * Komentáře se nevnořují — standard PGN to nedovoluje.
 *
 * Odstraní i engine evaluace ve formátu:
 *   { [%eval 0.5] }
 *   { +0.5/d20 }
 *   { Bílý stojí lépe. }
 */
function stripComments(text: string): string {
  return text.replace(/\{[^}]*\}/g, ' ')
}

/**
 * Odstraní varianty v kulatých závorkách ( ... ).
 * Podporuje vnořené varianty libovolné hloubky.
 */
function stripVariations(text: string): string {
  let out = ''
  let depth = 0
  for (const ch of text) {
    if      (ch === '(') { depth++ }
    else if (ch === ')') { if (depth > 0) depth-- }
    else if (depth === 0) { out += ch }
  }
  return out
}

/**
 * Odstraní textové glyfy přilepené přímo na SAN tah bez mezery.
 *
 * Podporované glyfy: ! ? !! ?? !? ?!
 *
 * Příklady:
 *   "Nxf7??"  → "Nxf7"
 *   "e4!"     → "e4"
 *   "Rxe5!?"  → "Rxe5"
 *
 * Volat na jednotlivý token, ne na celý movetext.
 */
export function stripMoveGlyphs(token: string): string {
  return token.replace(/[?!]+$/, '')
}

/**
 * Odstraní NAG anotace (Numeric Annotation Glyphs).
 *
 * Formát: $N kde N je číslo (např. $1 = dobrý tah, $4 = hrubá chyba)
 *
 * Příklad: "1. e4 $1 e5 $2" → "1. e4  e5 "
 */
function stripNAG(text: string): string {
  return text.replace(/\$\d+/g, ' ')
}

/**
 * Odstraní escape řádky začínající %.
 * Používají se pro non-standard rozšíření PGN (clock times atd.).
 *
 * Příklad: "% clk 1:30:00" → ""
 */
function stripEscapeLines(text: string): string {
  return text.replace(/^%[^\n]*/gm, ' ')
}

/**
 * Stripped PGN movetext — odstraní vše kromě čistých tahů a výsledku.
 *
 * Odstraní:
 *   - Komentáře { ... } včetně engine evaluací
 *   - Varianty ( ... ) libovolně vnořené
 *   - NAG anotace $N
 *   - Textové glyfy !? !! ?? atd. přilepené na tahy
 *   - Escape řádky začínající %
 *
 * Zachová:
 *   - Čísla tahů (1. 2. atd.)
 *   - SAN tahy včetně +, #, =
 *   - Výsledek (1-0, 0-1, 1/2-1/2, *)
 *
 * Příklad vstupu:
 *   "1. e4 { dobrý tah } e5?! 2. Nf3 $1 (2. f4 { gambit }) Nc6 1-0"
 *
 * Příklad výstupu:
 *   "1. e4 e5 2. Nf3 Nc6 1-0"
 */
export function stripMovetext(movetext: string): string {
  let t = stripEscapeLines(movetext)
  t = stripComments(t)
  t = stripVariations(t)
  t = stripNAG(t)

  // Zpracovat token po tokenu — odstranit glyfy z tahů
  const tokens = t.split(/\s+/).filter(Boolean)
  const clean: string[] = []

  for (const tok of tokens) {
    // Výsledek ponechat beze změny
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) {
      clean.push(tok)
      continue
    }

    // Číslo tahu (1. nebo 1...) ponechat beze změny
    if (/^\d+\.+$/.test(tok)) {
      clean.push(tok)
      continue
    }

    // SAN tah — odstranit přilepené glyfy
    const san = stripMoveGlyphs(tok)
    if (san) clean.push(san)
  }

  return clean.join(' ')
}

/**
 * Sestaví stripped PGN string z hlaviček a movetextu.
 *
 * Hlavičky zůstanou beze změny (diakritiku řeší volající pokud potřeba).
 * Movetext bude zbaven komentářů, variant a glyfů.
 *
 * @param headers  - PGN hlavičky jako string (včetně [ ] závorek a \n)
 * @param movetext - Původní PGN movetext
 * @returns        - Kompletní stripped PGN záznam
 */
export function buildStrippedPGN(headers: string, movetext: string): string {
  const stripped = stripMovetext(movetext)
  return `${headers.trimEnd()}\n\n${stripped}\n`
}
