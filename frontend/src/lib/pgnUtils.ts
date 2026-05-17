export function removeDiacritics(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function stripComments(text: string): string {
  return text.replace(/\{[^}]*\}/g, ' ');
}

function stripVariations(text: string): string {
  let out = '';
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth++;
    else if (ch === ')') { if (depth > 0) depth--; }
    else if (depth === 0) out += ch;
  }
  return out;
}

function stripNAG(text: string): string {
  return text.replace(/\$\d+/g, ' ');
}

function stripEscapeLines(text: string): string {
  return text.replace(/^%[^\n]*/gm, ' ');
}

export function stripMoveGlyphs(token: string): string {
  return token.replace(/[?!]+$/, '');
}

export function stripMovetext(movetext: string): string {
  let t = stripEscapeLines(movetext);
  t = stripComments(t);
  t = stripVariations(t);
  t = stripNAG(t);

  const tokens = t.split(/\s+/).filter(Boolean);
  const clean: string[] = [];

  for (const tok of tokens) {
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) {
      clean.push(tok);
      continue;
    }
    if (/^\d+\.+$/.test(tok)) {
      clean.push(tok);
      continue;
    }
    const san = stripMoveGlyphs(tok);
    if (san) clean.push(san);
  }

  return clean.join(' ');
}

export function hasAnyTopLevelVariation(movetext: string): boolean {
  const stripped = movetext.replace(/\{[^}]*\}/g, ' ');
  let depth = 0;
  for (const ch of stripped) {
    if (ch === '(') {
      if (depth === 0) return true;
      depth++;
    } else if (ch === ')') {
      if (depth > 0) depth--;
    }
  }
  return false;
}

export type ArtifactCounts = {
  comments: number;
  variations: number;
  nags: number;
  glyphs: number;
  escapes: number;
};

function countTopLevelVariations(text: string): number {
  let depth = 0;
  let count = 0;
  for (const ch of text) {
    if (ch === '(') {
      if (depth === 0) count++;
      depth++;
    } else if (ch === ')') {
      if (depth > 0) depth--;
    }
  }
  return count;
}

function countGlyphTokens(text: string): number {
  let t = stripEscapeLines(text);
  t = stripComments(t);
  t = stripVariations(t);
  t = stripNAG(t);
  const tokens = t.split(/\s+/).filter(Boolean);
  let count = 0;
  for (const tok of tokens) {
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) continue;
    if (/^\d+\.+$/.test(tok)) continue;
    if (stripMoveGlyphs(tok) !== tok) count++;
  }
  return count;
}

export function countArtifacts(movetext: string): ArtifactCounts {
  return {
    comments: (movetext.match(/\{[^}]*\}/g) ?? []).length,
    variations: countTopLevelVariations(movetext),
    nags: (movetext.match(/\$\d+/g) ?? []).length,
    glyphs: countGlyphTokens(movetext),
    escapes: (movetext.match(/^%[^\n]*/gm) ?? []).length,
  };
}
