import { Chess } from 'chess.js';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import type { MoveTree, MoveNode } from './moveTree';
import { getBranchAtCurrentFen } from './navigation';

function sanToArrow(fen: string, san: string, brush: string, label?: string): DrawShape | null {
  try {
    const chess = new Chess(fen);
    const move = chess.move(san);
    if (!move) return null;
    const shape: DrawShape = { orig: move.from as Key, dest: move.to as Key, brush };
    if (label) {
      shape.customSvg = {
        html: `<text x="50" y="62" text-anchor="middle" font-size="36" font-family="sans-serif" fill="#5b8db8" fill-opacity="0.85">${label}</text>`,
        center: 'label',
      };
    }
    return shape;
  } catch {
    return null;
  }
}

export function buildVariantArrows(tree: MoveTree, path: number[], currentFen: string): DrawShape[] {
  const branch = getBranchAtCurrentFen(tree, path);
  if (!branch) return [];

  const shapes: DrawShape[] = [];
  const mainArrow = sanToArrow(currentFen, branch.mainNext.san, 'blue');
  if (mainArrow) shapes.push(mainArrow);

  for (let v = 0; v < branch.variations.length; v++) {
    const first: MoveNode | undefined = branch.variations[v][0];
    if (!first) continue;
    const arrow = sanToArrow(currentFen, first.san, 'paleBlue', String(v + 1));
    if (arrow) shapes.push(arrow);
  }

  return shapes;
}
