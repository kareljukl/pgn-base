import { Chess } from 'chess.js';
import type { Key } from 'chessground/types';
import type { MoveTree } from './moveTree';
import { getMovesAtPath, getMoveIndexFromPath, getFenBeforePath } from './navigation';

export function getLastMoveSquares(tree: MoveTree, path: number[]): Key[] | undefined {
  if (path.length === 0) return undefined;
  const moves = getMovesAtPath(tree, path);
  const idx = getMoveIndexFromPath(path);
  if (idx < 0 || idx >= moves.length) return undefined;

  const prevFen = getFenBeforePath(tree, path);
  try {
    const chess = new Chess(prevFen);
    const m = chess.move(moves[idx].san);
    if (m) return [m.from as Key, m.to as Key];
  } catch {
    // swallow — malformed SAN or FEN
  }
  return undefined;
}
