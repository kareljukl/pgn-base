import { useEffect, useRef, useState } from 'react';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Key } from 'chessground/types';
import type { DrawShape } from 'chessground/draw';

type Props = {
  fen: string;
  orientation?: 'white' | 'black';
  lastMove?: Key[];
  autoShapes?: DrawShape[];
};

export function Board({ fen, orientation = 'white', lastMove, autoShapes }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const cgRef = useRef<Api | null>(null);
  const [size, setSize] = useState(0);

  // Measure container width and keep it square
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

  // Init / destroy Chessground
  useEffect(() => {
    if (boardRef.current && size > 0 && !cgRef.current) {
      cgRef.current = Chessground(boardRef.current, {
        fen,
        orientation,
        viewOnly: true,
        coordinates: true,
        animation: { enabled: true, duration: 200 },
        lastMove,
        drawable: {
          enabled: true,
          autoShapes: autoShapes ?? [],
        },
      });
    }

    return () => {
      cgRef.current?.destroy();
      cgRef.current = null;
    };
  }, [size]);

  // Update position
  useEffect(() => {
    cgRef.current?.set({
      fen,
      orientation,
      lastMove,
      animation: { enabled: true, duration: 200 },
    });
  }, [fen, orientation, lastMove]);

  // Update arrow shapes
  useEffect(() => {
    cgRef.current?.setAutoShapes(autoShapes ?? []);
  }, [autoShapes]);

  // Redraw on resize
  useEffect(() => {
    if (size > 0) {
      cgRef.current?.redrawAll();
    }
  }, [size]);

  return (
    <div ref={containerRef} style={{ width: '100%', maxWidth: 480 }}>
      <div
        ref={boardRef}
        style={{ width: size, height: size }}
      />
    </div>
  );
}
