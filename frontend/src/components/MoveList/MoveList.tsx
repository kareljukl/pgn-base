import { useEffect, useRef, type Ref } from 'react';
import { useGameStore } from '../../store/gameStore';
import { nagToSymbol, type MoveNode } from '../../lib/moveTree';
import { useVariantArrowsToggle } from '../../hooks/useVariantArrowsToggle';

export function MoveList() {
  const { tree, path, goToMove } = useGameStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLSpanElement>(null);
  const [variantArrowsOn, setVariantArrowsOn] = useVariantArrowsToggle();

  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      activeRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [path]);

  const currentPathStr = path.join(',');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.25rem 0.5rem',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#666', textTransform: 'uppercase' }}>
          Tahy
        </span>
        <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.75rem', color: '#555', gap: '0.3rem' }}>
          Šipky variant
          <button
            type="button"
            onClick={() => setVariantArrowsOn(!variantArrowsOn)}
            style={{
              padding: '0.1rem 0.45rem',
              fontSize: '0.75rem',
              cursor: 'pointer',
              border: '1px solid #ddd',
              borderRadius: 3,
              background: variantArrowsOn ? '#16a34a' : '#fff',
              color: variantArrowsOn ? '#fff' : '#333',
            }}
          >
            {variantArrowsOn ? 'ON' : 'OFF'}
          </button>
        </label>
      </div>
      <div
        ref={containerRef}
        style={{
          overflowY: 'auto',
          overflowX: 'hidden',
          maxHeight: 480,
          padding: '0.5rem',
          fontSize: '0.9rem',
          lineHeight: 1.7,
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
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
          isMainLine={true}
          depth={0}
        />
      </div>
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
  isMainLine,
  depth,
}: {
  moves: MoveNode[];
  basePath: number[];
  currentPathStr: string;
  goToMove: (path: number[]) => void;
  activeRef: Ref<HTMLSpanElement>;
  startMoveNumber: number;
  isBlackFirst: boolean;
  isMainLine: boolean;
  depth: number;
}) {
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const movePath = [...basePath, i];
    const pathStr = movePath.join(',');
    const isActive = pathStr === currentPathStr;

    const isWhite = isBlackFirst ? i % 2 === 1 : i % 2 === 0;
    const moveNum = startMoveNumber + Math.floor((i + (isBlackFirst ? 1 : 0)) / 2);

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

    elements.push(
      <span
        key={`move-${i}`}
        ref={isActive ? activeRef : null}
        onClick={() => goToMove(movePath)}
        style={{
          cursor: 'pointer',
          padding: '1px 3px',
          borderRadius: 3,
          fontWeight: isActive ? 700 : isMainLine ? 700 : 400,
          background: isActive ? '#e0e7ff' : 'transparent',
          marginRight: 2,
          whiteSpace: 'nowrap',
        }}
      >
        {move.san}
      </span>
    );

    if (move.nags.length > 0) {
      elements.push(
        <span key={`nag-${i}`} style={{ color: '#c2410c', fontWeight: 600, marginRight: 3 }}>
          {move.nags.map(nagToSymbol).join('')}
        </span>
      );
    }

    if (move.comment) {
      elements.push(
        <span key={`comment-${i}`} style={{ color: '#6b7280', fontStyle: 'italic', marginRight: 4 }}>
          {'{' + move.comment + '}'}
        </span>
      );
    }

    if (move.variations.length > 0) {
      for (let v = 0; v < move.variations.length; v++) {
        if (move.variations[v].length === 0) continue;
        elements.push(
          <div
            key={`var-${i}-${v}`}
            style={{
              paddingLeft: (depth + 1) * 12,
              lineHeight: 1.6,
            }}
          >
            <span style={{ color: '#94a3b8', fontWeight: 500, marginRight: 4 }}>{v + 1})</span>
            <Moves
              moves={move.variations[v]}
              basePath={[...basePath, i, v]}
              currentPathStr={currentPathStr}
              goToMove={goToMove}
              activeRef={activeRef}
              startMoveNumber={moveNum}
              isBlackFirst={!isWhite}
              isMainLine={false}
              depth={depth + 1}
            />
          </div>
        );
      }
    }
  }

  return <>{elements}</>;
}
