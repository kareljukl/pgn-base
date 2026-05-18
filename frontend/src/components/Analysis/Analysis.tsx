import { useEffect } from 'react';
import { useStockfish, type StockfishEval } from '../../hooks/useStockfish';
import { useCloudEval } from '../../hooks/useCloudEval';
import { useSanFormat } from '../../hooks/useSanFormat';
import { formatSan, type SanMode } from '../../lib/sanFormat';

type Props = {
  fen: string;
  onBestMove?: (uci: string | null) => void;
};

type DisplayPv = {
  multiPvIndex: number;
  score: { type: 'cp' | 'mate'; value: number };
  pvUci: string;
  pvSan: string[];
};

export function Analysis({ fen, onBestMove }: Props) {
  const cloud = useCloudEval(fen);
  const sanMode = useSanFormat();
  const {
    isEnabled,
    isReady,
    isAnalyzing,
    evaluations,
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

  const cloudPriority = cloud.hasData;

  // Engine orchestrace: cloud má prioritu, lokál běží jen při cache miss
  useEffect(() => {
    if (!isEnabled || !isReady) return;
    if (cloudPriority) {
      stopAnalysis();
    } else {
      startAnalysis(fen);
    }
    return () => {
      if (isEnabled) stopAnalysis();
    };
  }, [fen, isEnabled, isReady, cloudPriority, startAnalysis, stopAnalysis]);

  // Zdroj dat pro zobrazení
  const source: 'cloud' | 'sf' | 'none' =
    cloudPriority ? 'cloud'
      : isEnabled && evaluations.length > 0 ? 'sf'
        : 'none';

  const displayedPvs: DisplayPv[] =
    source === 'cloud'
      ? cloud.pvs.slice(0, multiPV).map((pv, i) => ({
          multiPvIndex: i + 1,
          score: pv.score,
          pvUci: pv.pvUci,
          pvSan: pv.pvSan,
        }))
      : source === 'sf'
        ? evaluations.map((ev: StockfishEval) => ({
            multiPvIndex: ev.multiPvIndex,
            score: ev.score,
            pvUci: ev.pvUci,
            pvSan: ev.pvSan,
          }))
        : [];

  const sourceLabel =
    source === 'cloud' ? `Lichess cloud · d${cloud.depth}`
      : source === 'sf' ? `Stockfish 18 · d${currentDepth}`
        : null;

  // Best-move šipka z aktuálně zobrazeného zdroje
  useEffect(() => {
    if (!onBestMove) return;
    if (!arrows) {
      onBestMove(null);
      return;
    }
    const firstUci = displayedPvs[0]?.pvUci.split(/\s+/)[0] ?? null;
    onBestMove(firstUci);
    // displayedPvs identitu měníme jen při změně dat; deps na primitivech stačí
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onBestMove, arrows, displayedPvs[0]?.pvUci]);

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: displayedPvs.length > 0 || source === 'none' ? '0.5rem' : 0 }}>
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
          {sourceLabel && (
            <span style={{ fontSize: '0.8rem', color: '#666' }}>
              {sourceLabel}
              {source === 'sf' && isAnalyzing && ' · analyzuje…'}
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

      {source === 'none' && (
        <p style={{ fontSize: '0.8rem', color: '#888', margin: '0.25rem 0 0' }}>
          {placeholderMessage(isEnabled, isReady, cloud.isLoading)}
        </p>
      )}

      {displayedPvs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
          {displayedPvs.map((pv) => (
            <PvLine key={pv.multiPvIndex} pv={pv} sanMode={sanMode} />
          ))}
        </div>
      )}
    </div>
  );
}

function placeholderMessage(isEnabled: boolean, isReady: boolean, cloudLoading: boolean): string {
  if (cloudLoading) return 'Načítání cloud eval…';
  if (!isEnabled) return 'Cloud eval není k dispozici. Zapněte engine pro lokální analýzu.';
  if (!isReady) return 'Načítání enginu…';
  return 'Stockfish hledá…';
}

function PvLine({ pv, sanMode }: { pv: DisplayPv; sanMode: SanMode }) {
  const score = formatScore(pv.score);
  const positive = pv.score.value > 0;
  const sanNode = pv.pvSan.length > 0
    ? pv.pvSan.map((s, i) => (
        <span key={i}>
          {i > 0 ? ' ' : ''}
          {formatSan(s, sanMode)}
        </span>
      ))
    : pv.pvUci;
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
        {sanNode}
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
