import { useSanFormat, setSanMode } from '../hooks/useSanFormat';
import type { SanMode } from '../lib/sanFormat';

const OPTIONS: Array<{ value: SanMode; label: React.ReactNode; title: string }> = [
  { value: 'en', label: 'PGN', title: 'PGN / anglická notace (Nf3)' },
  { value: 'cs', label: 'Cze', title: 'Česká notace (Jf3)' },
  { value: 'fig', label: <span style={{ fontSize: '1.25em', lineHeight: 1 }}>♞</span>, title: 'Figurky (♞f3)' },
];

export function SanFormatToggle() {
  const mode = useSanFormat();
  return (
    <div style={{ display: 'inline-flex', border: '1px solid #ddd', borderRadius: 4, overflow: 'hidden' }}>
      {OPTIONS.map((opt, i) => {
        const active = mode === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => setSanMode(opt.value)}
            title={opt.title}
            style={{
              padding: '0.2rem 0.5rem',
              fontSize: '0.8rem',
              cursor: 'pointer',
              border: 'none',
              borderLeft: i > 0 ? '1px solid #ddd' : 'none',
              background: active ? '#333' : '#fff',
              color: active ? '#fff' : '#333',
              minWidth: 32,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
