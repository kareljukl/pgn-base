import { useState, useRef, useEffect } from 'react';
import { useChessczSearch, MIN_QUERY_LEN, type PlayerHit } from '../../hooks/useChessczSearch';

type Props = {
  value: string;
  onChange: (v: string) => void;
  onPick: (p: PlayerHit) => void;
  invalid?: boolean;
  changed?: boolean;
};

export function PlayerAutocomplete({ value, onChange, onPick, invalid, changed }: Props) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { data, isFetching, error } = useChessczSearch(value);
  const players = data?.players ?? [];

  useEffect(() => {
    setHighlighted(0);
  }, [data]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(players.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter' && players[highlighted]) {
      e.preventDefault();
      onPick(players[highlighted]);
      setOpen(false);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showDropdown = open && value.trim().length >= MIN_QUERY_LEN;
  const apiStatus = (error as { status?: number } | null)?.status;

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        style={{
          ...inputStyle,
          borderColor: invalid ? '#dc2626' : changed ? '#facc15' : '#ccc',
          background: invalid ? '#fef2f2' : changed ? '#fef9c3' : '#fff',
        }}
      />
      {showDropdown && (
        <div style={dropdownStyle}>
          {isFetching && players.length === 0 && (
            <div style={emptyStyle}>Hledám…</div>
          )}
          {!isFetching && players.length === 0 && !error && (
            <div style={emptyStyle}>Žádné výsledky</div>
          )}
          {error && (
            <div style={errorStyle}>
              {apiStatus === 429 && 'Vyhledávání je dočasně omezeno, zkus za chvíli.'}
              {apiStatus === 503 && 'ŠSČR dočasně nedostupné.'}
              {apiStatus !== 429 && apiStatus !== 503 && 'Chyba vyhledávání.'}
            </div>
          )}
          {data?.stale && (
            <div style={staleNoticeStyle}>Zobrazují se starší data (ŠSČR omezeno).</div>
          )}
          {players.map((p, i) => (
            <button
              key={p.czeId}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onPick(p); setOpen(false); }}
              onMouseEnter={() => setHighlighted(i)}
              style={{
                ...rowStyle,
                background: i === highlighted ? '#f1f5f9' : '#fff',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: '#1a1a1a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {(p.fullName ?? '—').trim()}
                  {p.birthYear != null && (
                    <span style={{ color: '#888', fontWeight: 400, marginLeft: '0.4rem' }}>
                      ({p.birthYear})
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.clubName?.trim() ?? ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                {p.fideStdElo != null && <EloBadge label="FIDE" value={p.fideStdElo} />}
                {p.czeStdElo != null && <EloBadge label="Cze" value={p.czeStdElo} />}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EloBadge({ label, value }: { label: string; value: number }) {
  return (
    <span style={{
      fontSize: '0.7rem',
      padding: '0.1rem 0.35rem',
      borderRadius: 3,
      background: '#f1f5f9',
      color: '#334155',
      fontFamily: 'monospace',
      whiteSpace: 'nowrap',
    }}>
      {label} {value}
    </span>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '0.3rem 0.5rem',
  fontSize: '0.85rem',
  border: '1px solid #ccc',
  borderRadius: 4,
  width: '100%',
  boxSizing: 'border-box',
};

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  zIndex: 20,
  background: '#fff',
  border: '1px solid #ddd',
  borderRadius: 4,
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  marginTop: 2,
  maxHeight: 320,
  overflowY: 'auto',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.4rem 0.6rem',
  border: 'none',
  borderBottom: '1px solid #f1f5f9',
  width: '100%',
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: '0.85rem',
};

const emptyStyle: React.CSSProperties = {
  padding: '0.5rem 0.6rem',
  fontSize: '0.8rem',
  color: '#888',
};

const errorStyle: React.CSSProperties = {
  padding: '0.5rem 0.6rem',
  fontSize: '0.8rem',
  color: '#b91c1c',
  background: '#fef2f2',
};

const staleNoticeStyle: React.CSSProperties = {
  padding: '0.3rem 0.6rem',
  fontSize: '0.7rem',
  color: '#92400e',
  background: '#fef9c3',
};
