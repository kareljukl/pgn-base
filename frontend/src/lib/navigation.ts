import type { MoveTree, MoveNode } from './moveTree';

export function getMoveIndexFromPath(path: number[]): number {
  if (path.length === 0) return -1;
  return path[path.length - 1];
}

export function setMoveIndexInPath(path: number[], idx: number): number[] {
  if (path.length === 0) return [idx];
  const newPath = [...path];
  newPath[newPath.length - 1] = idx;
  return newPath;
}

export function getMovesAtPath(tree: MoveTree, path: number[]): MoveNode[] {
  if (path.length <= 1) return tree.moves;

  let moves = tree.moves;
  for (let i = 0; i < path.length - 1; i += 2) {
    const moveIdx = path[i];
    const varIdx = path[i + 1];
    if (varIdx === undefined) break;
    if (moveIdx < moves.length && varIdx < moves[moveIdx].variations.length) {
      moves = moves[moveIdx].variations[varIdx];
    } else {
      break;
    }
  }

  return moves;
}

export function getFenFromPath(tree: MoveTree, path: number[]): string {
  if (path.length === 0) return tree.startFen;

  const moves = getMovesAtPath(tree, path);
  const moveIdx = getMoveIndexFromPath(path);

  if (moveIdx >= 0 && moveIdx < moves.length) {
    return moves[moveIdx].fen;
  }

  return tree.startFen;
}

export function getFenBeforePath(tree: MoveTree, path: number[]): string {
  if (path.length === 0) return tree.startFen;
  const idx = getMoveIndexFromPath(path);
  if (idx > 0) {
    const moves = getMovesAtPath(tree, path);
    return moves[idx - 1].fen;
  }
  if (path.length === 1) return tree.startFen;
  // path ends with ..., M, V, 0 — the FEN before this variation's first move
  // is the FEN before moves[M] in the parent context.
  return getFenBeforePath(tree, path.slice(0, -2));
}

export type SiblingSet = {
  siblings: number[][];
  currentIdx: number;
};

export function getSiblingsAtPath(tree: MoveTree, path: number[]): SiblingSet | null {
  if (path.length === 0) return null;
  const lastIdx = path[path.length - 1];

  // First move of a variation: path ends with ..., varIdx, 0
  if (lastIdx === 0 && path.length >= 3) {
    const parentPath = path.slice(0, -2);
    const parentMoves = getMovesAtPath(tree, parentPath);
    const parentMoveIdx = getMoveIndexFromPath(parentPath);
    if (parentMoveIdx < 0 || parentMoveIdx >= parentMoves.length) return null;
    const parentNode = parentMoves[parentMoveIdx];
    if (parentNode.variations.length === 0) return null;

    const siblings: number[][] = [parentPath];
    for (let v = 0; v < parentNode.variations.length; v++) {
      if (parentNode.variations[v].length > 0) {
        siblings.push([...parentPath, v, 0]);
      }
    }
    const currentPathStr = path.join(',');
    const currentIdx = siblings.findIndex((s) => s.join(',') === currentPathStr);
    if (currentIdx === -1) return null;
    return { siblings, currentIdx };
  }

  // On a branch move (the move itself has variations)
  const moves = getMovesAtPath(tree, path);
  if (lastIdx < 0 || lastIdx >= moves.length) return null;
  const node = moves[lastIdx];
  if (node.variations.length === 0) return null;

  const siblings: number[][] = [[...path]];
  for (let v = 0; v < node.variations.length; v++) {
    if (node.variations[v].length > 0) {
      siblings.push([...path, v, 0]);
    }
  }
  return { siblings, currentIdx: 0 };
}

export function getDigitTarget(tree: MoveTree, path: number[], digit: number): number[] | null {
  if (digit < 1 || digit > 9) return null;
  const varIdx = digit - 1;

  // Case A: on a branch move — switch from main onto variation varIdx
  if (path.length > 0) {
    const moves = getMovesAtPath(tree, path);
    const lastIdx = path[path.length - 1];
    if (lastIdx >= 0 && lastIdx < moves.length) {
      const node = moves[lastIdx];
      if (varIdx < node.variations.length && node.variations[varIdx].length > 0) {
        return [...path, varIdx, 0];
      }
    }
  }

  // Case B: one half-move before a branch — enter variation of moves[next]
  if (path.length > 0) {
    const moves = getMovesAtPath(tree, path);
    const lastIdx = path[path.length - 1];
    const nextIdx = lastIdx + 1;
    if (nextIdx >= 0 && nextIdx < moves.length) {
      const nextNode = moves[nextIdx];
      if (varIdx < nextNode.variations.length && nextNode.variations[varIdx].length > 0) {
        const baseParent = path.slice(0, -1);
        return [...baseParent, nextIdx, varIdx, 0];
      }
    }
  }

  // Case C: start of game, tree.moves[0] has variations
  if (path.length === 0 && tree.moves.length > 0) {
    const firstNode = tree.moves[0];
    if (varIdx < firstNode.variations.length && firstNode.variations[varIdx].length > 0) {
      return [0, varIdx, 0];
    }
  }

  return null;
}

export type BranchInfo = {
  mainNext: MoveNode;
  variations: MoveNode[][];
};

export function exitVariationBack(_tree: MoveTree, path: number[]): number[] | null {
  if (path.length < 3) return null;
  let p = path.slice(0, -2);
  while (p.length > 0) {
    const idx = p[p.length - 1];
    if (idx > 0) {
      return [...p.slice(0, -1), idx - 1];
    }
    if (p.length < 3) return [];
    p = p.slice(0, -2);
  }
  return null;
}

export function exitVariationForward(tree: MoveTree, path: number[]): number[] | null {
  if (path.length < 3) return null;
  let p = path.slice(0, -2);
  while (p.length > 0) {
    const idx = p[p.length - 1];
    const moves = getMovesAtPath(tree, p);
    if (idx + 1 < moves.length) {
      return [...p.slice(0, -1), idx + 1];
    }
    if (p.length < 3) return null;
    p = p.slice(0, -2);
  }
  return null;
}

export function hasAnyVariation(tree: MoveTree): boolean {
  return tree.moves.some((m) => m.variations.some((v) => v.length > 0));
}

export function linearizeMoves(tree: MoveTree, path: number[]): MoveNode[] {
  const result: MoveNode[] = [];
  let moves = tree.moves;
  for (let i = 0; i + 1 < path.length; i += 2) {
    const mainIdx = path[i];
    const varIdx = path[i + 1];
    for (let j = 0; j < mainIdx && j < moves.length; j++) result.push(moves[j]);
    if (mainIdx >= moves.length || varIdx >= moves[mainIdx].variations.length) return result;
    moves = moves[mainIdx].variations[varIdx];
  }
  for (const m of moves) result.push(m);
  return result;
}

export function linearPosition(tree: MoveTree, path: number[]): number {
  if (path.length === 0) return -1;
  let pos = 0;
  let moves = tree.moves;
  for (let i = 0; i + 1 < path.length; i += 2) {
    const mainIdx = path[i];
    const varIdx = path[i + 1];
    pos += mainIdx;
    if (mainIdx >= moves.length || varIdx >= moves[mainIdx].variations.length) return -1;
    moves = moves[mainIdx].variations[varIdx];
  }
  pos += path[path.length - 1];
  return pos;
}

export function getBranchAtCurrentFen(tree: MoveTree, path: number[]): BranchInfo | null {
  let nextNode: MoveNode | null = null;

  if (path.length === 0) {
    if (tree.moves.length === 0) return null;
    nextNode = tree.moves[0];
  } else {
    const moves = getMovesAtPath(tree, path);
    const lastIdx = path[path.length - 1];
    const nextIdx = lastIdx + 1;
    if (nextIdx < 0 || nextIdx >= moves.length) return null;
    nextNode = moves[nextIdx];
  }

  if (!nextNode || nextNode.variations.length === 0) return null;
  return { mainNext: nextNode, variations: nextNode.variations };
}
