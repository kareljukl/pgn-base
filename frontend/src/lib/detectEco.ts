import { api, ApiError } from './api';
import { parseMoveText } from './moveTree';

type ExplorerResponse = {
  opening?: { eco: string; name: string } | null;
};

// Sample at decreasing plies — deepest hit wins. Most ECO-classified
// openings are exhausted by ply ~16, so 4 calls in the worst case.
const SAMPLE_PLIES = [16, 12, 8, 4];

export type DetectedEco = { eco: string; name: string };

export async function detectEcoFromMovesPgn(movesPgn: string): Promise<DetectedEco | null> {
  let tree;
  try {
    tree = parseMoveText(movesPgn);
  } catch {
    return null;
  }
  if (tree.moves.length === 0) return null;

  const desired = SAMPLE_PLIES.map((p) => Math.min(p, tree.moves.length));
  const uniqDescending = [...new Set(desired)].filter((p) => p > 0).sort((a, b) => b - a);

  for (const ply of uniqDescending) {
    const fen = tree.moves[ply - 1].fen;
    try {
      const resp = await api.get<ExplorerResponse>(
        `/explorer?fen=${encodeURIComponent(fen)}&moves=0`
      );
      if (resp.opening) {
        return { eco: resp.opening.eco, name: resp.opening.name };
      }
    } catch (err) {
      if (err instanceof ApiError) continue;
      throw err;
    }
  }
  return null;
}
