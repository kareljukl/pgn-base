import { useEffect, useRef, useState } from 'react';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Key, Dests } from 'chessground/types';
import type { DrawShape } from 'chessground/draw';
import { Chess } from 'chess.js';

type Props = {
  fen: string;
  editable: boolean;
  lastMove?: [string, string];
  onMove: (san: string, fen: string) => void;
  autoShapes?: DrawShape[];
};

type PromoState = {
  orig: Key;
  dest: Key;
  color: 'w' | 'b';
};

const PROMO_PIECES: Array<{ key: 'q' | 'r' | 'b' | 'n'; label: string }> = [
  { key: 'q', label: '♛' },
  { key: 'r', label: '♜' },
  { key: 'b', label: '♝' },
  { key: 'n', label: '♞' },
];

export function EditableBoard({ fen, editable, lastMove, onMove, autoShapes }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const cgRef = useRef<Api | null>(null);
  const [size, setSize] = useState(0);
  const [ready, setReady] = useState(false);
  const [promo, setPromo] = useState<PromoState | null>(null);

  const fenRef = useRef(fen);
  const onMoveRef = useRef(onMove);
  fenRef.current = fen;
  onMoveRef.current = onMove;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setSize(Math.floor(width));
    });
    observer.observe(container);
    setSize(Math.floor(container.clientWidth));
    return () => observer.disconnect();
  }, []);

  const handleAfter = (orig: Key, dest: Key) => {
    const chess = new Chess(fenRef.current);
    const candidates = chess.moves({ verbose: true }).filter(
      (m) => m.from === orig && m.to === dest
    );
    if (candidates.length === 0) {
      cgRef.current?.set({ fen: fenRef.current });
      return;
    }
    if (candidates.some((m) => m.promotion)) {
      setPromo({ orig, dest, color: chess.turn() });
      return;
    }
    commitMove(orig, dest, undefined);
  };

  const commitMove = (orig: Key, dest: Key, promotion: 'q' | 'r' | 'b' | 'n' | undefined) => {
    const chess = new Chess(fenRef.current);
    try {
      const move = chess.move({ from: orig, to: dest, promotion });
      onMoveRef.current(move.san, chess.fen());
    } catch {
      cgRef.current?.set({ fen: fenRef.current });
    }
  };

  // Refresh chessground's cached bounds before drag/click — fixes piece offset
  // when surrounding layout shifts after init (ECO label, error messages, etc.)
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const invalidate = () => {
      const cg = cgRef.current as unknown as { state?: { dom?: { bounds?: { clear?: () => void } } } } | null;
      cg?.state?.dom?.bounds?.clear?.();
    };
    el.addEventListener('mousedown', invalidate, true);
    el.addEventListener('touchstart', invalidate, true);
    return () => {
      el.removeEventListener('mousedown', invalidate, true);
      el.removeEventListener('touchstart', invalidate, true);
    };
  }, []);

  // Init chessground when container has size
  useEffect(() => {
    if (!boardRef.current || size === 0 || cgRef.current) return;

    const chess = new Chess(fenRef.current);
    const turn = chess.turn() === 'w' ? 'white' : 'black';

    cgRef.current = Chessground(boardRef.current, {
      fen: fenRef.current,
      turnColor: turn,
      coordinates: true,
      animation: { enabled: true, duration: 200 },
      movable: {
        free: false,
        color: editable ? turn : undefined,
        dests: editable ? computeDests(chess) : new Map(),
        showDests: true,
        events: {
          after: (orig, dest) => handleAfter(orig, dest),
        },
      },
      draggable: { showGhost: true, enabled: true },
      selectable: { enabled: true },
      premovable: { enabled: false },
      drawable: { enabled: true, autoShapes: autoShapes ?? [] },
      viewOnly: !editable,
    });
    setReady(true);

    return () => {
      cgRef.current?.destroy();
      cgRef.current = null;
      setReady(false);
    };
  }, [size]);

  // Sync fen / editable / lastMove changes after init
  useEffect(() => {
    if (!ready || !cgRef.current) return;
    const chess = new Chess(fen);
    const turn = chess.turn() === 'w' ? 'white' : 'black';
    const dests = editable ? computeDests(chess) : new Map();
    cgRef.current.set({
      fen,
      turnColor: turn,
      lastMove: lastMove as [Key, Key] | undefined,
      movable: {
        free: false,
        color: editable ? turn : undefined,
        dests,
      },
      viewOnly: !editable,
    });
  }, [ready, fen, editable, lastMove]);

  useEffect(() => {
    if (size > 0) cgRef.current?.redrawAll();
  }, [size]);

  // Update engine arrow shapes
  useEffect(() => {
    if (!ready) return;
    cgRef.current?.setAutoShapes(autoShapes ?? []);
  }, [ready, autoShapes]);

  const onPromoPick = (piece: 'q' | 'r' | 'b' | 'n') => {
    if (!promo) return;
    const { orig, dest } = promo;
    setPromo(null);
    commitMove(orig, dest, piece);
  };

  const onPromoCancel = () => {
    setPromo(null);
    cgRef.current?.set({ fen: fenRef.current });
  };

  return (
    <div ref={containerRef} style={{ width: '100%', maxWidth: 480, position: 'relative' }}>
      <div ref={boardRef} style={{ width: size, height: size }} />
      {promo && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}
          onClick={onPromoCancel}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 8,
              padding: '0.75rem',
              display: 'flex',
              gap: '0.5rem',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            }}
          >
            {PROMO_PIECES.map((p) => (
              <button
                key={p.key}
                onClick={() => onPromoPick(p.key)}
                style={{
                  fontSize: '2.5rem',
                  width: 64,
                  height: 64,
                  cursor: 'pointer',
                  border: '1px solid #ddd',
                  borderRadius: 4,
                  background: '#fff',
                  color: promo.color === 'w' ? '#333' : '#111',
                }}
                title={p.key.toUpperCase()}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function computeDests(chess: Chess): Dests {
  const dests: Dests = new Map();
  for (const m of chess.moves({ verbose: true })) {
    const arr = dests.get(m.from as Key) ?? [];
    arr.push(m.to as Key);
    dests.set(m.from as Key, arr);
  }
  return dests;
}
