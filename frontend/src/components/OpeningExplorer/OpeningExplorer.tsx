import { useState } from 'react';
import { useOpeningExplorer } from '../../hooks/useOpeningExplorer';

type Props = {
  fen: string;
};

export function OpeningExplorer({ fen }: Props) {
  const { moves, depth, hasData, isLoading } = useOpeningExplorer(fen);
  const [expanded, setExpanded] = useState(false);

  const displayMoves = expanded ? moves : moves.slice(0, 1);

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: hasData ? '0.5rem' : 0 }}>
        <span style={headerStyle}>Lichess Cloud Eval</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {hasData && <span style={{ fontSize: '0.7rem', color: '#aaa' }}>hloubka {depth}</span>}
          {moves.length > 1 && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                padding: '0 4px',
                fontSize: '0.7rem',
                cursor: 'pointer',
                border: '1px solid #ddd',
                borderRadius: 3,
                background: '#fff',
                color: '#666',
                lineHeight: '16px',
              }}
            >
              {expanded ? '▲' : '▼'}
            </button>
          )}
        </div>
      </div>

      {isLoading && (
        <p style={{ fontSize: '0.8rem', color: '#888', margin: '0.25rem 0 0' }}>Načítání...</p>
      )}

      {!isLoading && !hasData && (
        <p style={{ fontSize: '0.8rem', color: '#888', margin: '0.25rem 0 0' }}>
          Cloud eval není k dispozici pro tuto pozici
        </p>
      )}

      {hasData && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
              <th style={thStyle}>Pokračování</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Hodnocení</th>
            </tr>
          </thead>
          <tbody>
            {displayMoves.map((move, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '0.3rem 0.5rem', fontFamily: 'monospace' }}>
                  {move.uci}
                </td>
                <td style={{
                  padding: '0.3rem 0.5rem',
                  textAlign: 'right',
                  fontWeight: 600,
                  fontFamily: 'monospace',
                  color: move.score.startsWith('+') || move.score.startsWith('M') ? '#1a1a1a' : '#888',
                }}>
                  {move.score}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
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
