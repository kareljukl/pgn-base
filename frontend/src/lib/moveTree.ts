import { Chess } from 'chess.js';

export type MoveNode = {
  san: string;
  fen: string;
  comment?: string;
  nags: number[];
  variations: MoveNode[][];
};

export type MoveTree = {
  startFen: string;
  moves: MoveNode[];
};

const NAG_SYMBOLS: Record<number, string> = {
  1: '!',
  2: '?',
  3: '!!',
  4: '??',
  5: '!?',
  6: '?!',
  7: '□',
  10: '=',
  13: '∞',
  14: '⩲',
  15: '⩱',
  16: '±',
  17: '∓',
  18: '+-',
  19: '-+',
};

export function nagToSymbol(nag: number): string {
  return NAG_SYMBOLS[nag] || `$${nag}`;
}

/**
 * Parse a PGN movetext string into a MoveTree.
 * Supports: move numbers, comments {}, NAGs $N, variations (), result tokens.
 */
export function parseMoveText(moveText: string, startFen?: string): MoveTree {
  const fen = startFen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const tokens = tokenize(moveText);
  const moves = parseTokens(tokens, fen);
  return { startFen: fen, moves };
}

type Token =
  | { type: 'move'; value: string }
  | { type: 'number'; value: string }
  | { type: 'comment'; value: string }
  | { type: 'nag'; value: number }
  | { type: 'open_var' }
  | { type: 'close_var' }
  | { type: 'result'; value: string };

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    // Whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Comment
    if (ch === '{') {
      const end = text.indexOf('}', i + 1);
      const commentEnd = end === -1 ? text.length : end;
      tokens.push({ type: 'comment', value: text.slice(i + 1, commentEnd).trim() });
      i = commentEnd + 1;
      continue;
    }

    // Semicolon comment (rest of line)
    if (ch === ';') {
      const end = text.indexOf('\n', i + 1);
      const commentEnd = end === -1 ? text.length : end;
      tokens.push({ type: 'comment', value: text.slice(i + 1, commentEnd).trim() });
      i = commentEnd + 1;
      continue;
    }

    // Variation
    if (ch === '(') {
      tokens.push({ type: 'open_var' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'close_var' });
      i++;
      continue;
    }

    // NAG
    if (ch === '$') {
      let num = '';
      i++;
      while (i < text.length && /\d/.test(text[i])) {
        num += text[i];
        i++;
      }
      tokens.push({ type: 'nag', value: parseInt(num) });
      continue;
    }

    // Read a word
    let word = '';
    while (i < text.length && !/[\s{}()$;]/.test(text[i])) {
      word += text[i];
      i++;
    }

    if (!word) continue;

    // Result
    if (word === '1-0' || word === '0-1' || word === '1/2-1/2' || word === '*') {
      tokens.push({ type: 'result', value: word });
      continue;
    }

    // Move number (e.g., "1.", "1...", "12.")
    if (/^\d+\.+$/.test(word)) {
      tokens.push({ type: 'number', value: word });
      continue;
    }

    // Inline NAG-like annotations attached to moves: e.g., "Nf3!" or "e5?!"
    const nagSuffixMatch = word.match(/^([A-Za-z][A-Za-z0-9+#=\-]*?)([!?]{1,2})$/);
    if (nagSuffixMatch) {
      tokens.push({ type: 'move', value: nagSuffixMatch[1] });
      const sym = nagSuffixMatch[2];
      const nagMap: Record<string, number> = { '!': 1, '?': 2, '!!': 3, '??': 4, '!?': 5, '?!': 6 };
      if (nagMap[sym]) tokens.push({ type: 'nag', value: nagMap[sym] });
      continue;
    }

    // Regular move (SAN)
    if (/^[A-Za-z]/.test(word) || word === 'O-O' || word === 'O-O-O') {
      tokens.push({ type: 'move', value: word });
      continue;
    }

    // Castling with zeroes
    if (word === '0-0' || word === '0-0-0') {
      const san = word === '0-0' ? 'O-O' : 'O-O-O';
      tokens.push({ type: 'move', value: san });
      continue;
    }

    // Skip anything else (rare)
  }

  return tokens;
}

function parseTokens(tokens: Token[], startFen: string): MoveNode[] {
  let pos = 0;

  function parse(fen: string): MoveNode[] {
    const moves: MoveNode[] = [];
    const chess = new Chess(fen);

    while (pos < tokens.length) {
      const token = tokens[pos];

      if (token.type === 'close_var') {
        break;
      }

      if (token.type === 'number' || token.type === 'result') {
        pos++;
        continue;
      }

      if (token.type === 'move') {
        pos++;
        let moveMade: ReturnType<typeof chess.move>;
        try {
          moveMade = chess.move(token.value);
        } catch {
          // Invalid move — skip
          continue;
        }

        const node: MoveNode = {
          san: moveMade.san,
          fen: chess.fen(),
          nags: [],
          variations: [],
        };

        // FEN before this move was made (needed for variations)
        const fenBeforeMove = moves.length > 0 ? moves[moves.length - 1].fen : fen;

        // Collect trailing comments, NAGs, variations
        while (pos < tokens.length) {
          const next = tokens[pos];
          if (next.type === 'comment') {
            node.comment = node.comment ? node.comment + ' ' + next.value : next.value;
            pos++;
          } else if (next.type === 'nag') {
            node.nags.push(next.value);
            pos++;
          } else if (next.type === 'open_var') {
            pos++; // skip '('
            // Variation is an alternative to the current move,
            // so it starts from the position before this move was made
            const variationMoves = parse(fenBeforeMove);
            node.variations.push(variationMoves);
            if (pos < tokens.length && tokens[pos].type === 'close_var') {
              pos++; // skip ')'
            }
          } else {
            break;
          }
        }

        moves.push(node);
        continue;
      }

      if (token.type === 'comment') {
        // Comment before first move or between moves — attach to next move or last move
        if (moves.length > 0) {
          const last = moves[moves.length - 1];
          last.comment = last.comment ? last.comment + ' ' + token.value : token.value;
        }
        pos++;
        continue;
      }

      if (token.type === 'nag') {
        if (moves.length > 0) {
          moves[moves.length - 1].nags.push(token.value);
        }
        pos++;
        continue;
      }

      if (token.type === 'open_var') {
        // Variation without a preceding move — skip
        pos++;
        parse(fen);
        if (pos < tokens.length && tokens[pos].type === 'close_var') {
          pos++;
        }
        continue;
      }

      pos++;
    }

    return moves;
  }

  return parse(startFen);
}

/**
 * Get the FEN at a specific path in the move tree.
 * Path is an array of indices: [mainMoveIdx, variationIdx, moveInVariationIdx, ...]
 */
export function getFenAtPath(tree: MoveTree, path: number[]): string {
  if (path.length === 0) return tree.startFen;

  let moves = tree.moves;
  let fen = tree.startFen;

  for (let i = 0; i < path.length; i++) {
    const idx = path[i];

    if (i % 2 === 0) {
      // Index into moves array
      if (idx < moves.length) {
        fen = moves[idx].fen;
        // If this is the last index, return
        if (i === path.length - 1) return fen;
      } else {
        return fen;
      }
    } else {
      // Index into variations of the previous move
      const prevMoveIdx = path[i - 1];
      const prevMove = moves[prevMoveIdx];
      if (prevMove && idx < prevMove.variations.length) {
        moves = prevMove.variations[idx];
        fen = prevMoveIdx > 0 ? moves[0]?.fen || fen : fen;
        // Reset to traverse this variation's moves
      } else {
        return fen;
      }
    }
  }

  return fen;
}

/**
 * Get the MoveNode at a given path.
 */
export function getNodeAtPath(tree: MoveTree, path: number[]): MoveNode | null {
  if (path.length === 0) return null;

  let moves = tree.moves;

  for (let i = 0; i < path.length; i++) {
    const idx = path[i];

    if (i === path.length - 1) {
      // Last element — this is the move index
      return moves[idx] || null;
    }

    if (i % 2 === 0) {
      // Move index, next should be variation index
      if (idx >= moves.length) return null;
    } else {
      // Variation index
      const prevMoveIdx = path[i - 1];
      const prevMove = moves[prevMoveIdx];
      if (!prevMove || idx >= prevMove.variations.length) return null;
      moves = prevMove.variations[idx];
    }
  }

  return null;
}
