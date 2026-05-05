import { create } from 'zustand';
import { parseMoveText, type MoveTree, type MoveNode } from '../lib/moveTree';

type GameInfo = {
  white?: string;
  black?: string;
  whiteElo?: number;
  blackElo?: number;
  result?: string;
  event?: string;
  date?: string;
};

type GameState = {
  tree: MoveTree;
  info: GameInfo;
  // Path represents position in the tree
  // Simple path: [moveIndex] for main line
  // Variation path: [moveIndex, variationIndex, moveInVariation, ...]
  path: number[];
  currentFen: string;

  // Actions
  loadGame: (movesPgn: string, info: GameInfo, startFen?: string) => void;
  goToMove: (path: number[]) => void;
  goForward: () => void;
  goBack: () => void;
  goToStart: () => void;
  goToEnd: () => void;

  // Derived
  isAtStart: () => boolean;
  isAtEnd: () => boolean;
  getCurrentMoves: () => MoveNode[];
  getCurrentMoveIndex: () => number;
};

export const useGameStore = create<GameState>((set, get) => ({
  tree: { startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moves: [] },
  info: {},
  path: [],
  currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',

  loadGame: (movesPgn, info, startFen) => {
    const tree = parseMoveText(movesPgn, startFen);
    set({
      tree,
      info,
      path: [],
      currentFen: tree.startFen,
    });
  },

  goToMove: (path) => {
    const { tree } = get();
    const fen = getFenFromPath(tree, path);
    set({ path, currentFen: fen });
  },

  goForward: () => {
    const { tree, path } = get();
    const moves = getMovesAtPath(tree, path);
    const moveIdx = getMoveIndexFromPath(path);
    const nextIdx = moveIdx + 1;

    if (nextIdx < moves.length) {
      const newPath = setMoveIndexInPath(path, nextIdx);
      set({ path: newPath, currentFen: moves[nextIdx].fen });
    }
  },

  goBack: () => {
    const { tree, path } = get();
    const moveIdx = getMoveIndexFromPath(path);

    if (moveIdx > 0) {
      const moves = getMovesAtPath(tree, path);
      const newPath = setMoveIndexInPath(path, moveIdx - 1);
      set({ path: newPath, currentFen: moves[moveIdx - 1].fen });
    } else if (moveIdx === 0) {
      // Go back to start or parent variation
      if (path.length <= 1) {
        set({ path: [], currentFen: tree.startFen });
      } else {
        // Return to parent: remove last two elements (variationIndex + moveIndex)
        const parentPath = path.slice(0, -2);
        const parentMoves = getMovesAtPath(tree, parentPath);
        const parentMoveIdx = getMoveIndexFromPath(parentPath);
        const fen = parentMoveIdx >= 0 && parentMoveIdx < parentMoves.length
          ? parentMoves[parentMoveIdx].fen
          : tree.startFen;
        set({ path: parentPath, currentFen: fen });
      }
    } else {
      // At start
      set({ path: [], currentFen: tree.startFen });
    }
  },

  goToStart: () => {
    const { tree } = get();
    set({ path: [], currentFen: tree.startFen });
  },

  goToEnd: () => {
    const { tree, path } = get();
    const moves = getMovesAtPath(tree, path);
    if (moves.length > 0) {
      const newPath = setMoveIndexInPath(path, moves.length - 1);
      set({ path: newPath, currentFen: moves[moves.length - 1].fen });
    }
  },

  isAtStart: () => {
    return get().path.length === 0;
  },

  isAtEnd: () => {
    const { tree, path } = get();
    const moves = getMovesAtPath(tree, path);
    const moveIdx = getMoveIndexFromPath(path);
    return moves.length === 0 || moveIdx === moves.length - 1;
  },

  getCurrentMoves: () => {
    const { tree, path } = get();
    return getMovesAtPath(tree, path);
  },

  getCurrentMoveIndex: () => {
    return getMoveIndexFromPath(get().path);
  },
}));

// Helper: get the move index from a path
function getMoveIndexFromPath(path: number[]): number {
  if (path.length === 0) return -1;
  return path[path.length - 1];
}

// Helper: set the move index in a path (last element)
function setMoveIndexInPath(path: number[], idx: number): number[] {
  if (path.length === 0) return [idx];
  const newPath = [...path];
  newPath[newPath.length - 1] = idx;
  return newPath;
}

// Helper: get the moves array that the current path is navigating in
function getMovesAtPath(tree: MoveTree, path: number[]): MoveNode[] {
  if (path.length <= 1) return tree.moves;

  let moves = tree.moves;
  // Path structure: [moveIdx, varIdx, moveIdx, varIdx, ..., moveIdx]
  // We need to traverse to the correct variation
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

// Helper: get the FEN at a specific path
function getFenFromPath(tree: MoveTree, path: number[]): string {
  if (path.length === 0) return tree.startFen;

  const moves = getMovesAtPath(tree, path);
  const moveIdx = getMoveIndexFromPath(path);

  if (moveIdx >= 0 && moveIdx < moves.length) {
    return moves[moveIdx].fen;
  }

  return tree.startFen;
}
