import { useState } from 'react';
import { useOpeningBook } from '../../hooks/useOpeningBook';

const STORAGE_KEY = 'pgn-base-opening-book';

type Props = {
  fen: string;
};

export function OpeningBook({ fen }: Props) {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(STORAGE_KEY) === 'on');
  const { moves, hasData, isLoading, isRateLimited } = useOpeningBook(fen, enabled);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
  };

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: enabled ? '0.5rem' : 0 }}>
        <span style={headerStyle}>Strom zahájení</span>
        <button
          onClick={toggle}
          style={{
            padding: '0.2rem 0.6rem',
            fontSize: '0.8rem',
            cursor: 'pointer',
            border: '1px solid #ddd',
            borderRadius: 4,
            background: enabled ? '#333' : '#fff',
            color: enabled ? '#fff' : '#333',
          }}
        >
          {enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {enabled && isLoading && (
        <p style={{ fontSize: '0.8rem', color: '#888', margin: '0.25rem 0 0' }}>Načítání...</p>
      )}

      {enabled && !isLoading && isRateLimited && (
        <p style={{ fontSize: '0.8rem', color: '#b45309', margin: '0.25rem 0 0' }}>
          Data zahájení nejsou momentálně dostupná
        </p>
      )}

      {enabled && !isLoading && !isRateLimited && !hasData && (
        <p style={{ fontSize: '0.8rem', color: '#888', margin: '0.25rem 0 0' }}>
          Pozice není v databázi zahájení
        </p>
      )}

      {enabled && hasData && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
              <th style={thStyle}>Tah</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Partií</th>
              <th style={{ ...thStyle, width: '50%' }}>Bílý / Remíza / Černý</th>
            </tr>
          </thead>
          <tbody>
            {moves.map((move) => {
              const whiteP = move.total > 0 ? (move.white / move.total) * 100 : 0;
              const drawP = move.total > 0 ? (move.draws / move.total) * 100 : 0;
              const blackP = move.total > 0 ? (move.black / move.total) * 100 : 0;

              return (
                <tr key={move.san} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '0.3rem 0.5rem', fontWeight: 600 }}>
                    {move.san}
                  </td>
                  <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right', color: '#666' }}>
                    {formatCount(move.total)}
                  </td>
                  <td style={{ padding: '0.3rem 0.5rem' }}>
                    <div style={{ display: 'flex', height: 14, borderRadius: 2, overflow: 'hidden', fontSize: '0.7rem', lineHeight: '14px' }}>
                      {whiteP > 0 && (
                        <div style={{ width: `${whiteP}%`, background: '#f0f0f0', color: '#333', textAlign: 'center' }}>
                          {whiteP >= 10 ? `${Math.round(whiteP)}%` : ''}
                        </div>
                      )}
                      {drawP > 0 && (
                        <div style={{ width: `${drawP}%`, background: '#a0a0a0', color: '#fff', textAlign: 'center' }}>
                          {drawP >= 10 ? `${Math.round(drawP)}%` : ''}
                        </div>
                      )}
                      {blackP > 0 && (
                        <div style={{ width: `${blackP}%`, background: '#333', color: '#fff', textAlign: 'center' }}>
                          {blackP >= 10 ? `${Math.round(blackP)}%` : ''}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

const containerStyle: React.CSSProperties = {
  border: '1px solid #e0e0e0',
  borderRadius: 6,
  padding: '0.75rem',
  marginTop: '0.75rem',
};

const headerStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#666',
  textTransform: 'uppercase',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.25rem 0.5rem',
  color: '#888',
  fontWeight: 500,
};
