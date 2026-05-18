import { useEffect, useRef } from 'react';
import { useSanFormat } from '../../hooks/useSanFormat';
import { formatSan } from '../../lib/sanFormat';

type Props = {
  moves: string[];
  cursor: number; // -1 = start position, otherwise index of last played move shown
  onJump: (cursor: number) => void;
  ecoLabel?: string | null;
  disabled?: boolean;
};

export function EditorMoveList({ moves, cursor, onJump, ecoLabel, disabled }: Props) {
  const activeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [cursor]);

  const pairs: Array<{ no: number; white: string; whiteIdx: number; black?: string; blackIdx?: number }> = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({
      no: i / 2 + 1,
      white: moves[i],
      whiteIdx: i,
      black: moves[i + 1],
      blackIdx: i + 1 < moves.length ? i + 1 : undefined,
    });
  }

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <span style={headerStyle}>Tahy</span>
        {ecoLabel && <span style={{ fontSize: '0.75rem', color: '#666' }}>{ecoLabel}</span>}
      </div>

      {moves.length === 0 ? (
        <p style={{ fontSize: '0.85rem', color: '#888', margin: '0.25rem 0 0' }}>
          Zatím žádné tahy. Zahrajte tah na šachovnici.
        </p>
      ) : (
        <div style={{ fontSize: '0.9rem', lineHeight: 1.7, maxHeight: 280, overflowY: 'auto', opacity: disabled ? 0.5 : 1 }}>
          {pairs.map((p) => (
            <span key={p.no} style={{ marginRight: '0.6rem', whiteSpace: 'nowrap' }}>
              <span style={{ color: '#888' }}>{p.no}.</span>{' '}
              <MoveSpan
                san={p.white}
                active={cursor === p.whiteIdx}
                onClick={() => onJump(p.whiteIdx)}
                activeRef={cursor === p.whiteIdx ? activeRef : undefined}
                disabled={disabled}
              />
              {p.black && (
                <>
                  {' '}
                  <MoveSpan
                    san={p.black}
                    active={cursor === p.blackIdx}
                    onClick={() => onJump(p.blackIdx!)}
                    activeRef={cursor === p.blackIdx ? activeRef : undefined}
                    disabled={disabled}
                  />
                </>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function MoveSpan({
  san,
  active,
  onClick,
  activeRef,
  disabled,
}: {
  san: string;
  active: boolean;
  onClick: () => void;
  activeRef?: React.RefObject<HTMLSpanElement>;
  disabled?: boolean;
}) {
  const mode = useSanFormat();
  return (
    <span
      ref={activeRef}
      onClick={disabled ? undefined : onClick}
      style={{
        cursor: disabled ? 'default' : 'pointer',
        padding: '1px 4px',
        borderRadius: 3,
        background: active ? '#2563eb' : 'transparent',
        color: active ? '#fff' : '#1a1a1a',
        fontWeight: active ? 600 : 400,
      }}
    >
      {formatSan(san, mode)}
    </span>
  );
}

const containerStyle: React.CSSProperties = {
  border: '1px solid #e0e0e0',
  borderRadius: 6,
  padding: '0.75rem',
};

const headerStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#666',
  textTransform: 'uppercase',
};
