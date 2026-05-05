export type RawGame = {
  headers: Record<string, string>;
  movesPgn: string;
};

/**
 * Split a multi-game PGN text into individual games.
 * Handles BOM, varied line endings, and irregular spacing.
 */
export function splitPgn(text: string): RawGame[] {
  // Remove BOM
  text = text.replace(/^\uFEFF/, '');
  // Normalize line endings
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const games: RawGame[] = [];
  const lines = text.split('\n');

  let currentHeaders: Record<string, string> = {};
  let currentMoves = '';
  let inMoves = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line === '') {
      // Empty line after moves means end of game
      if (inMoves && currentMoves.trim()) {
        games.push({ headers: currentHeaders, movesPgn: currentMoves.trim() });
        currentHeaders = {};
        currentMoves = '';
        inMoves = false;
      }
      continue;
    }

    // PGN tag line: [Key "Value"]
    const tagMatch = line.match(/^\[(\w+)\s+"(.*)"\]$/);
    if (tagMatch) {
      if (inMoves && currentMoves.trim()) {
        // New game starting — save previous
        games.push({ headers: currentHeaders, movesPgn: currentMoves.trim() });
        currentHeaders = {};
        currentMoves = '';
        inMoves = false;
      }
      currentHeaders[tagMatch[1]] = tagMatch[2];
    } else {
      // Move text line
      inMoves = true;
      currentMoves += (currentMoves ? ' ' : '') + line;
    }
  }

  // Last game
  if (currentMoves.trim() || Object.keys(currentHeaders).length > 0) {
    games.push({ headers: currentHeaders, movesPgn: currentMoves.trim() });
  }

  return games;
}

/**
 * Parse PGN header tags from a single-game PGN string.
 */
export function parseHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const regex = /\[(\w+)\s+"(.*)"\]/g;
  let match;
  while ((match = regex.exec(pgn)) !== null) {
    headers[match[1]] = match[2];
  }
  return headers;
}

/**
 * Extract the move text portion from a PGN string (everything after headers).
 */
export function extractMoveText(pgn: string): string {
  // Remove all header lines
  const lines = pgn.split(/\r?\n/);
  const moveLines: string[] = [];
  let pastHeaders = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']') && !pastHeaders) {
      continue;
    }
    if (trimmed === '' && !pastHeaders) {
      continue;
    }
    pastHeaders = true;
    if (trimmed) {
      moveLines.push(trimmed);
    }
  }

  return moveLines.join(' ');
}
