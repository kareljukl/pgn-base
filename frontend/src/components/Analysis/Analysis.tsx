import { useEffect } from 'react';
import { useStockfish, type StockfishEval } from '../../hooks/useStockfish';

type Props = {
  fen: string;
  onBestMove?: (uci: string | null) => void;
};

export function Analysis({ fen, onBestMove }: Props) {
  const {
    isEnabled,
    isReady,
    isAnalyzing,
    evaluations,
    bestMoveUci,
    currentDepth,
    multiPV,
    depth,
    arrows,
    setMultiPV,
    setDepth,
    setArrows,
    startAnalysis,
    stopAnalysis,
    toggle,
  } = useStockfish();

  // Auto-analyze when position / depth / multiPV change
  useEffect(() => {
    if (isEnabled && isReady) {
      startAnalysis(fen);
    }
    return () => {
      if (isEnabled) stopAnalysis();
    };
  }, [fen, isEnabled, isReady, startAnalysis, stopAnalysis]);

  // Push best-move arrow up
  useEffect(() => {
    if (!onBestMove) return;
    if (!isEnabled || !arrows) {
      onBestMove(null);
    } else {
      onBestMove(bestMoveUci);
    }
  }, [onBestMove, isEnabled, arrows, bestMoveUci]);

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: isEnabled ? '0.5rem' : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={toggle}
            style={{
              padding: '0.2rem 0.6rem',
              fontSize: '0.8rem',
              cursor: 'pointer',
              border: '1px solid #ddd',
              borderRadius: 4,
              background: isEnabled ? '#333' : '#fff',
              color: isEnabled ? '#fff' : '#333',
            }}
          >
            {isEnabled ? 'Engine ON' : 'Engine OFF'}
          </button>
          {isEnabled && (
            <span style={{ fontSize: '0.8rem', color: '#666' }}>
              Stockfish 18
              {isAnalyzing && ' · analyzuje...'}
              {currentDepth > 0 && ` · d${currentDepth}`}
            </span>
          )}
        </div>

        {isEnabled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <label style={smallLabelStyle}>
              Šipky:
              <button
                onClick={() => setArrows(!arrows)}
                style={{
                  marginLeft: '0.3rem',
                  padding: '0.1rem 0.45rem',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  border: '1px solid #ddd',
                  borderRadius: 3,
                  background: arrows ? '#16a34a' : '#fff',
                  color: arrows ? '#fff' : '#333',
                }}
              >
                {arrows ? 'ON' : 'OFF'}
              </button>
            </label>
            <label style={smallLabelStyle}>
              Varianty:
              <select
                value={multiPV}
                onChange={(e) => setMultiPV(parseInt(e.target.value))}
                style={selectStyle}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <label style={smallLabelStyle}>
              Hloubka:
              <select
                value={depth}
                onChange={(e) => setDepth(parseInt(e.target.value))}
                style={selectStyle}
              >
                {[10, 12, 14, 16, 18, 20, 22, 25].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      {isEnabled && !isReady && (
        <p style={{ fontSize: '0.8rem', color: '#888', margin: '0.25rem 0 0' }}>Načítání enginu...</p>
      )}

      {isEnabled && isReady && evaluations.length === 0 && (
        <p style={{ fontSize: '0.8rem', color: '#888', margin: '0.25rem 0 0' }}>Hledám...</p>
      )}

      {isEnabled && evaluations.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
          {evaluations.map((ev) => (
            <PvLine key={ev.multiPvIndex} ev={ev} />
          ))}
        </div>
      )}
    </div>
  );
}

function PvLine({ ev }: { ev: StockfishEval }) {
  const score = formatScore(ev.score);
  const positive = ev.score.value > 0 || (ev.score.type === 'mate' && ev.score.value !== 0 && ev.score.value > 0);
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>
      <span style={{
        minWidth: 48,
        textAlign: 'right',
        fontWeight: 700,
        color: positive ? '#1a1a1a' : '#888',
      }}>
        {score}
      </span>
      <span style={{ color: '#333', wordBreak: 'break-word', lineHeight: 1.5 }}>
        {ev.pvSan.length > 0 ? ev.pvSan.join(' ') : ev.pvUci}
      </span>
    </div>
  );
}

function formatScore(score: { type: 'cp' | 'mate'; value: number }): string {
  if (score.type === 'mate') {
    if (score.value === 0) return '#0';
    return score.value > 0 ? `#${score.value}` : `-#${Math.abs(score.value)}`;
  }
  const cp = score.value / 100;
  return cp > 0 ? `+${cp.toFixed(1)}` : cp.toFixed(1);
}

const containerStyle: React.CSSProperties = {
  border: '1px solid #e0e0e0',
  borderRadius: 6,
  padding: '0.75rem',
  marginTop: '0.75rem',
};

const smallLabelStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#666',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
};

const selectStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  padding: '0.1rem 0.3rem',
  border: '1px solid #ddd',
  borderRadius: 3,
};
