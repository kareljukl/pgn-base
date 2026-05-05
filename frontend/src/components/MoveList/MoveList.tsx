import { useEffect, useRef, type Ref } from 'react';
import { useGameStore } from '../../store/gameStore';
import { nagToSymbol, type MoveNode } from '../../lib/moveTree';

export function MoveList() {
  const { tree, path, goToMove } = useGameStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLSpanElement>(null);

  // Auto-scroll to active move
  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      activeRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [path]);

  const currentPathStr = path.join(',');

  return (
    <div
      ref={containerRef}
      style={{
        overflowY: 'auto',
        maxHeight: 480,
        padding: '0.5rem',
        fontSize: '0.9rem',
        lineHeight: 1.7,
      }}
    >
      <Moves
        moves={tree.moves}
        basePath={[]}
        currentPathStr={currentPathStr}
        goToMove={goToMove}
        activeRef={activeRef}
        startMoveNumber={1}
        isBlackFirst={tree.startFen.includes(' b ')}
      />
    </div>
  );
}

function Moves({
  moves,
  basePath,
  currentPathStr,
  goToMove,
  activeRef,
  startMoveNumber,
  isBlackFirst,
}: {
  moves: MoveNode[];
  basePath: number[];
  currentPathStr: string;
  goToMove: (path: number[]) => void;
  activeRef: Ref<HTMLSpanElement>;
  startMoveNumber: number;
  isBlackFirst: boolean;
}) {
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const movePath = [...basePath, i];
    const pathStr = movePath.join(',');
    const isActive = pathStr === currentPathStr;

    // Determine if we need a move number
    const isWhite = isBlackFirst ? i % 2 === 1 : i % 2 === 0;
    const moveNum = startMoveNumber + Math.floor((i + (isBlackFirst ? 1 : 0)) / 2);

    // Move number
    if (isWhite) {
      elements.push(
        <span key={`num-${i}`} style={{ color: '#888', marginRight: 2 }}>
          {moveNum}.
        </span>
      );
    } else if (i === 0 && isBlackFirst) {
      elements.push(
        <span key={`num-${i}`} style={{ color: '#888', marginRight: 2 }}>
          {moveNum}...
        </span>
      );
    }

    // Move
    elements.push(
      <span
        key={`move-${i}`}
        ref={isActive ? activeRef : null}
        onClick={() => goToMove(movePath)}
        style={{
          cursor: 'pointer',
          padding: '1px 3px',
          borderRadius: 3,
          fontWeight: isActive ? 700 : 400,
          background: isActive ? '#e0e7ff' : 'transparent',
          marginRight: 2,
        }}
      >
        {move.san}
      </span>
    );

    // NAGs
    if (move.nags.length > 0) {
      elements.push(
        <span key={`nag-${i}`} style={{ color: '#c2410c', fontWeight: 600, marginRight: 3 }}>
          {move.nags.map(nagToSymbol).join('')}
        </span>
      );
    }

    // Comment
    if (move.comment) {
      elements.push(
        <span key={`comment-${i}`} style={{ color: '#6b7280', fontStyle: 'italic', marginRight: 4 }}>
          {'{' + move.comment + '}'}
        </span>
      );
    }

    // Variations
    if (move.variations.length > 0) {
      for (let v = 0; v < move.variations.length; v++) {
        elements.push(
          <span key={`var-${i}-${v}`} style={{ display: 'inline' }}>
            <span style={{ color: '#888' }}>(</span>
            <Moves
              moves={move.variations[v]}
              basePath={[...basePath, i, v]}
              currentPathStr={currentPathStr}
              goToMove={goToMove}
              activeRef={activeRef}
              startMoveNumber={moveNum}
              isBlackFirst={isWhite}
            />
            <span style={{ color: '#888' }}>)</span>
          </span>
        );
      }
    }
  }

  return <span>{elements}</span>;
}
