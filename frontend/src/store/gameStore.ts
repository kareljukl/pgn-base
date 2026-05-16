import { create } from 'zustand';
import { parseMoveText, type MoveTree, type MoveNode } from '../lib/moveTree';
import {
  getMoveIndexFromPath,
  setMoveIndexInPath,
  getMovesAtPath,
  getFenFromPath,
  getSiblingsAtPath,
  getDigitTarget,
  exitVariationBack,
  exitVariationForward,
} from '../lib/navigation';

type GameInfo = {
  white?: string;
  black?: string;
  whiteElo?: number;
  blackElo?: number;
  result?: string;
  event?: string;
  date?: string;
  whiteFideId?: string;
  blackFideId?: string;
  whiteCzId?: string;
  blackCzId?: string;
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
  goToSiblingUp: () => void;
  goToSiblingDown: () => void;
  enterVariation: (digit: number) => void;

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

  goToSiblingUp: () => {
    const { tree, path } = get();
    const r = getSiblingsAtPath(tree, path);
    if (r) {
      if (r.currentIdx === 0) return;
      const target = r.siblings[r.currentIdx - 1];
      set({ path: target, currentFen: getFenFromPath(tree, target) });
      return;
    }
    const target = exitVariationBack(tree, path);
    if (!target) return;
    set({ path: target, currentFen: getFenFromPath(tree, target) });
  },

  goToSiblingDown: () => {
    const { tree, path } = get();
    const r = getSiblingsAtPath(tree, path);
    if (r) {
      if (r.currentIdx >= r.siblings.length - 1) return;
      const target = r.siblings[r.currentIdx + 1];
      set({ path: target, currentFen: getFenFromPath(tree, target) });
      return;
    }
    const target = exitVariationForward(tree, path);
    if (!target) return;
    set({ path: target, currentFen: getFenFromPath(tree, target) });
  },

  enterVariation: (digit) => {
    const { tree, path } = get();
    const target = getDigitTarget(tree, path, digit);
    if (!target) return;
    set({ path: target, currentFen: getFenFromPath(tree, target) });
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
