import { useState, useRef, useEffect, useMemo } from 'react';
import type { ChessczRosterEntry } from '../../lib/chesscz';
import { removeDiacritics } from '../../lib/pgnUtils';

type Props = {
  value: string;
  onChange: (v: string) => void;
  onPick: (entry: ChessczRosterEntry) => void;
  roster: ChessczRosterEntry[];
  isLoading: boolean;
  errorStatus: number | null;
  invalid?: boolean;
  changed?: boolean;
};

function normalize(s: string): string {
  return removeDiacritics(s).toLowerCase();
}

export function RosterAutocomplete({
  value,
  onChange,
  onPick,
  roster,
  isLoading,
  errorStatus,
  invalid,
  changed,
}: Props) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = normalize(value.trim());
    if (!q) return roster;
    return roster.filter((r) => normalize(r.playerName).includes(q));
  }, [roster, value]);

  useEffect(() => {
    setHighlighted(0);
  }, [filtered]);

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
      setHighlighted((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter' && filtered[highlighted]) {
      e.preventDefault();
      onPick(filtered[highlighted]);
      setOpen(false);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

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
      {open && (
        <div style={dropdownStyle}>
          {isLoading && roster.length === 0 && (
            <div style={emptyStyle}>Soupiska se načítá…</div>
          )}
          {!isLoading && errorStatus !== null && (
            <div style={errorStyle}>
              {errorStatus === 429 && 'Soupiska dočasně nedostupná (rate-limit).'}
              {errorStatus === 503 && 'ŠSČR dočasně nedostupné.'}
              {errorStatus !== 429 && errorStatus !== 503 && 'Soupiska nedostupná.'}
            </div>
          )}
          {!isLoading && errorStatus === null && roster.length === 0 && (
            <div style={emptyStyle}>Soupiska nedostupná.</div>
          )}
          {!isLoading && errorStatus === null && roster.length > 0 && filtered.length === 0 && (
            <div style={emptyStyle}>Žádný hráč v soupisce neodpovídá.</div>
          )}
          {filtered.map((r, i) => (
            <button
              key={r.playerId}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onPick(r); setOpen(false); }}
              onMouseEnter={() => setHighlighted(i)}
              style={{
                ...rowStyle,
                background: i === highlighted ? '#f1f5f9' : '#fff',
              }}
            >
              <span style={positionStyle}>#{r.rosterPosition}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: '#1a1a1a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.playerName.trim()}
                  {r.playerClass && (
                    <span style={{ color: '#888', fontWeight: 400, marginLeft: '0.4rem' }}>
                      {r.playerClass}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                {r.playerFideElo > 0 && <EloBadge label="FIDE" value={r.playerFideElo} />}
                {r.playerCzeElo > 0 && <EloBadge label="Cze" value={r.playerCzeElo} />}
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

const positionStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  color: '#94a3b8',
  fontFamily: 'monospace',
  minWidth: 24,
  textAlign: 'right',
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
