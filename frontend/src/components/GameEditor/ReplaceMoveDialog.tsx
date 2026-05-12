import { Board } from '../Board/Board';

type Choice = 'overwrite' | 'replace' | 'cancel';

type Props = {
  onChoice: (choice: Choice) => void;
};

export function ReplaceMoveInline({ onChoice }: Props) {
  return (
    <div style={inlineStyle}>
      <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>
        Zahráli jste jiný tah než je zapsán.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <ChoiceButton
          label="Přepsat"
          hint="Smaže následující tahy, vloží nový. Partie pokračuje."
          onClick={() => onChoice('overwrite')}
        />
        <ChoiceButton
          label="Nahradit"
          hint="Nahradí tento tah a zkontroluje platnost zbývajících."
          onClick={() => onChoice('replace')}
        />
        <ChoiceButton
          label="Zrušit"
          hint="Vrátí původní tah."
          onClick={() => onChoice('cancel')}
        />
      </div>
    </div>
  );
}

function ChoiceButton({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={btnStyle} title={hint}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: '0.7rem', color: '#666', marginLeft: '0.4rem' }}>{hint}</span>
    </button>
  );
}

type ConfirmProps = {
  previewFen: string;
  keptAfterCount: number;
  totalAfterCount: number;
  droppedFirstLabel: string | null;
  droppedLastLabel: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ReplaceConfirmModal({
  previewFen,
  keptAfterCount,
  totalAfterCount,
  droppedFirstLabel,
  droppedLastLabel,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  const allKept = droppedFirstLabel === null;
  const droppedRange = droppedFirstLabel && droppedLastLabel
    ? `${droppedFirstLabel} – ${droppedLastLabel}`
    : droppedFirstLabel ?? '';

  return (
    <div style={modalBackdrop} onClick={onCancel}>
      <div style={modalBox} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem' }}>Nahradit tah?</h3>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
          <div style={{ width: 200, flexShrink: 0 }}>
            <Board fen={previewFen} />
          </div>
          <div style={{ fontSize: '0.9rem', flex: 1 }}>
            {totalAfterCount === 0 ? (
              <p style={{ margin: 0 }}>
                Tah bude nahrazen. Žádné další tahy nejsou ovlivněny.
              </p>
            ) : allKept ? (
              <p style={{ margin: 0 }}>
                Všechny následující tahy jsou platné. Partie bude zachována
                v plném rozsahu ({totalAfterCount} {plural(totalAfterCount)} po nahrazení).
              </p>
            ) : (
              <>
                <p style={{ margin: '0 0 0.4rem' }}>
                  Zachová se <strong>{keptAfterCount}</strong> z {totalAfterCount} {plural(totalAfterCount)} po nahrazení.
                </p>
                <p style={{ margin: 0, color: '#666' }}>
                  Tahy {droppedRange} budou zahozeny.
                </p>
              </>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button onClick={onCancel} style={secondaryBtn}>Zrušit</button>
          <button onClick={onConfirm} style={primaryBtn}>Potvrdit</button>
        </div>
      </div>
    </div>
  );
}

function plural(n: number): string {
  if (n === 1) return 'tah';
  if (n < 5) return 'tahy';
  return 'tahů';
}

const inlineStyle: React.CSSProperties = {
  marginTop: '0.75rem',
  padding: '0.75rem',
  background: '#fffbeb',
  border: '1px solid #fcd34d',
  borderRadius: 6,
};

const btnStyle: React.CSSProperties = {
  padding: '0.4rem 0.6rem',
  fontSize: '0.85rem',
  cursor: 'pointer',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  background: '#fff',
  textAlign: 'left',
};

const modalBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
};

const modalBox: React.CSSProperties = {
  background: '#fff',
  borderRadius: 8,
  padding: '1.25rem',
  maxWidth: 520,
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
