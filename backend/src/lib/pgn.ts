type GameRow = {
  event: string | null;
  site: string | null;
  date: string | null;
  round: string | null;
  board: string | null;
  white: string | null;
  black: string | null;
  white_elo: number | null;
  black_elo: number | null;
  white_team: string | null;
  black_team: string | null;
  white_fide_id: string | null;
  black_fide_id: string | null;
  white_cz_id: string | null;
  black_cz_id: string | null;
  result: string | null;
  eco: string | null;
  ply_count: number | null;
  moves_pgn: string;
};

export function buildPgn(game: GameRow, mode: 'full' | 'stripped'): string {
  const tags: string[] = [];

  const addTag = (name: string, value: string | number | null) => {
    if (value !== null && value !== undefined) {
      tags.push(`[${name} "${value}"]`);
    }
  };

  // Standard Seven Tag Roster (STR) in order
  addTag('Event', game.event ?? '?');
  addTag('Site', game.site ?? '?');
  addTag('Date', game.date ?? '????.??.??');
  addTag('Round', game.round ?? '?');
  addTag('White', game.white ?? '?');
  addTag('Black', game.black ?? '?');
  addTag('Result', game.result ?? '*');

  // Optional tags
  if (game.white_elo) addTag('WhiteElo', game.white_elo);
  if (game.black_elo) addTag('BlackElo', game.black_elo);
  if (game.white_fide_id) addTag('WhiteFideId', game.white_fide_id);
  if (game.black_fide_id) addTag('BlackFideId', game.black_fide_id);
  if (game.white_cz_id) addTag('WhiteCzId', game.white_cz_id);
  if (game.black_cz_id) addTag('BlackCzId', game.black_cz_id);
  if (game.eco) addTag('ECO', game.eco);
  if (game.ply_count != null) addTag('PlyCount', game.ply_count);
  if (game.board) addTag('Board', game.board);
  if (game.white_team) addTag('WhiteTeam', game.white_team);
  if (game.black_team) addTag('BlackTeam', game.black_team);

  const moveText = mode === 'stripped'
    ? stripMoveText(game.moves_pgn)
    : game.moves_pgn;

  return tags.join('\n') + '\n\n' + moveText + '\n';
}

/**
 * Count plies (half-moves) in a PGN movetext.
 * Strips comments, variations, and NAGs first, then counts SAN-shaped tokens.
 */
export function countPlies(movesPgn: string): number {
  const stripped = stripMoveText(movesPgn);
  if (!stripped) return 0;
  const moveRegex = /(?:O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?/g;
  const matches = stripped.match(moveRegex);
  return matches ? matches.length : 0;
}

/**
 * Strip comments, variations, and NAG annotations from PGN movetext.
 * Keeps only move numbers, moves, and the result.
 */
export function stripMoveText(text: string): string {
  let result = '';
  let i = 0;
  let depth = 0; // variation nesting depth

  while (i < text.length) {
    const ch = text[i];

    // Skip comments
    if (ch === '{') {
      const end = text.indexOf('}', i + 1);
      i = end === -1 ? text.length : end + 1;
      continue;
    }

    // Skip semicolon comments
    if (ch === ';') {
      const end = text.indexOf('\n', i + 1);
      i = end === -1 ? text.length : end + 1;
      continue;
    }

    // Track variation depth
    if (ch === '(') {
      depth++;
      i++;
      continue;
    }
    if (ch === ')') {
      depth = Math.max(0, depth - 1);
      i++;
      continue;
    }

    // Skip NAG symbols
    if (ch === '$') {
      i++;
      while (i < text.length && /\d/.test(text[i])) i++;
      continue;
    }

    // Only include content at depth 0 (main line)
    if (depth === 0) {
      result += ch;
    }

    i++;
  }

  // Clean up extra whitespace
  return result.replace(/\s+/g, ' ').trim();
}
