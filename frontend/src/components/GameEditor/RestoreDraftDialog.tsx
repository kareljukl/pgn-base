type Props = {
  savedAt: number;
  white: string;
  black: string;
  moveCount: number;
  onRestore: () => void;
  onDiscard: () => void;
};

export function RestoreDraftDialog({ savedAt, white, black, moveCount, onRestore, onDiscard }: Props) {
  const date = new Date(savedAt);
  const formatted = date.toLocaleString('cs-CZ');

  return (
    <div style={backdrop}>
      <div style={box}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem' }}>Neuložený draft</h3>
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>
          Máte rozpracovanou partii z <strong>{formatted}</strong>.
        </p>
        <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: '#666' }}>
          {white || '?'} vs {black || '?'} · {moveCount} {moveCount === 1 ? 'tah' : moveCount < 5 ? 'tahy' : 'tahů'}
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onDiscard} style={secondaryBtn}>Začít znovu</button>
          <button onClick={onRestore} style={primaryBtn}>Obnovit draft</button>
        </div>
      </div>
    </div>
  );
}

const backdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
};

const box: React.CSSProperties = {
  background: '#fff',
  borderRadius: 8,
  padding: '1.25rem',
  maxWidth: 420,
  width: '90%',
  boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
};

const primaryBtn: React.CSSProperties = {
  padding: '0.5rem 1rem',
  fontSize: '0.875rem',
  cursor: 'pointer',
  border: '1px solid #333',
  borderRadius: 4,
  background: '#333',
  color: '#fff',
};

const secondaryBtn: React.CSSProperties = {
  padding: '0.5rem 1rem',
  fontSize: '0.875rem',
  cursor: 'pointer',
  border: '1px solid #ddd',
  borderRadius: 4,
  background: '#fff',
};
