import { useState } from 'react';

type Props = {
  title: string;
  message: string;
  updateCount: number;
  totalCount: number;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const PAGE_SIZE = 25;

export function BulkActionDialog({ title, message, updateCount, totalCount, isPending, onConfirm, onCancel }: Props) {
  const [acknowledged, setAcknowledged] = useState(false);
  const requiresAck = totalCount > PAGE_SIZE;
  const confirmDisabled = isPending || (requiresAck && !acknowledged);

  return (
    <div style={backdrop} onClick={isPending ? undefined : onCancel}>
      <div style={box} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 0.75rem' }}>{title}</h3>
        <p style={{ margin: '0 0 0.75rem', color: '#333', fontSize: '0.9rem' }}>{message}</p>

        {requiresAck && (
          <div style={warningBox}>
            <div style={{ fontSize: '0.85rem', color: '#92400e', marginBottom: '0.5rem' }}>
              ⚠️ Filtr zasahuje napříč více stránkami. Na obrazovce vidíte jen prvních {PAGE_SIZE} z {totalCount} partií.
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                disabled={isPending}
              />
              Rozumím, že se upraví {updateCount} {pluralPartie(updateCount)} napříč více stránkami.
            </label>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button onClick={onCancel} disabled={isPending} style={cancelBtn}>
            Zrušit
          </button>
          <button onClick={onConfirm} disabled={confirmDisabled} style={{ ...confirmBtn, opacity: confirmDisabled ? 0.5 : 1 }}>
            {isPending ? 'Ukládám…' : 'Potvrdit'}
          </button>
        </div>
      </div>
    </div>
  );
}

function pluralPartie(n: number): string {
  if (n === 1) return 'partie';
  if (n >= 2 && n <= 4) return 'partie';
  return 'partií';
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
  maxWidth: 480,
  width: '90%',
  boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
};

const warningBox: React.CSSProperties = {
  background: '#fef3c7',
  border: '1px solid #fde68a',
  borderRadius: 6,
  padding: '0.6rem 0.75rem',
};

const cancelBtn: React.CSSProperties = {
  padding: '0.5rem 1rem',
  fontSize: '0.875rem',
  cursor: 'pointer',
  border: '1px solid #ddd',
  borderRadius: 4,
  background: '#fff',
  color: '#333',
};

const confirmBtn: React.CSSProperties = {
  padding: '0.5rem 1rem',
  fontSize: '0.875rem',
  cursor: 'pointer',
  border: '1px solid #333',
  borderRadius: 4,
  background: '#333',
  color: '#fff',
};
