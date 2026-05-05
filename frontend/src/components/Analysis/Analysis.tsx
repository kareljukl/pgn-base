import { useEffect } from 'react';
import { useStockfish } from '../../hooks/useStockfish';

type Props = {
  fen: string;
};

export function Analysis({ fen }: Props) {
  const {
    isEnabled,
    isReady,
    isAnalyzing,
    evaluation,
    maxDepth,
    setMaxDepth,
    startAnalysis,
    stopAnalysis,
    toggle,
  } = useStockfish();

  // Auto-analyze when position changes
  useEffect(() => {
    if (isEnabled && isReady) {
      startAnalysis(fen);
    }
    return () => {
      if (isEnabled) stopAnalysis();
    };
  }, [fen, isEnabled, isReady, startAnalysis, stopAnalysis]);

  const formatScore = () => {
    if (!evaluation) return '—';
    if (evaluation.score.type === 'mate') {
      const v = evaluation.score.value;
      return v > 0 ? `M${v}` : `M${v}`;
    }
    const cp = evaluation.score.value / 100;
    return cp > 0 ? `+${cp.toFixed(1)}` : cp.toFixed(1);
  };

  return (
    <div style={{ border: '1px solid #e0e0e0', borderRadius: 6, padding: '0.75rem', marginTop: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isEnabled ? '0.5rem' : 0 }}>
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
              {evaluation && ` · d${evaluation.depth}`}
            </span>
          )}
        </div>

        {isEnabled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.75rem', color: '#888' }}>Hloubka:</label>
            <select
              value={maxDepth}
              onChange={(e) => setMaxDepth(parseInt(e.target.value))}
              style={{ fontSize: '0.8rem', padding: '0.15rem 0.3rem', border: '1px solid #ddd', borderRadius: 3 }}
            >
              {[10, 12, 14, 16, 18, 20, 22, 25].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {isEnabled && evaluation && (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <span style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              fontFamily: 'monospace',
              minWidth: 55,
              color: evaluation.score.value >= 0 ? '#1a1a1a' : '#666',
            }}>
              {formatScore()}
            </span>
          </div>
          <div style={{
            fontSize: '0.8rem',
            color: '#444',
            fontFamily: 'monospace',
            wordBreak: 'break-word',
            lineHeight: 1.5,
          }}>
            {evaluation.pv}
          </div>
        </div>
      )}

      {isEnabled && !isReady && (
        <p style={{ fontSize: '0.8rem', color: '#888', margin: '0.25rem 0 0' }}>Načítání enginu...</p>
      )}
    </div>
  );
}
