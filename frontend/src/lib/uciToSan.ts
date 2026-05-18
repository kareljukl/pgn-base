import { Chess } from 'chess.js';

export function uciSequenceToSan(fen: string, uciMoves: string[]): string[] {
  if (!fen) return [];
  try {
    const chess = new Chess(fen);
    const result: string[] = [];
    for (const uci of uciMoves) {
      if (!uci || uci.length < 4) break;
      try {
        const move = chess.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          promotion: uci.length > 4 ? uci[4] : undefined,
        });
        result.push(move.san);
      } catch {
        break;
      }
    }
    return result;
  } catch {
    return [];
  }
}
