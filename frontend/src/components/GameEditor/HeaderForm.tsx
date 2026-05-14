import type { EditorHeaders } from '../../lib/editorPgn';

type Props = {
  headers: EditorHeaders;
  onChange: (next: EditorHeaders) => void;
  showRequired: boolean;
};

const RESULTS = ['*', '1-0', '0-1', '1/2-1/2'];

export function HeaderForm({ headers, onChange, showRequired }: Props) {
  const set = <K extends keyof EditorHeaders>(key: K, value: EditorHeaders[K]) => {
    onChange({ ...headers, [key]: value });
  };

  const missing = (key: keyof EditorHeaders) => showRequired && !headers[key].trim();

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Hlavičky partie</div>
      <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '0.4rem 0.5rem', alignItems: 'center' }}>
        <Label text="Event *" />
        <Input value={headers.Event} onChange={(v) => set('Event', v)} invalid={missing('Event')} />

        <Label text="White *" />
        <Input value={headers.White} onChange={(v) => set('White', v)} invalid={missing('White')} />

        <Label text="Black *" />
        <Input value={headers.Black} onChange={(v) => set('Black', v)} invalid={missing('Black')} />

        <Label text="Date" />
        <Input value={headers.Date} onChange={(v) => set('Date', v)} placeholder="YYYY.MM.DD" />

        <Label text="Round" />
        <Input value={headers.Round} onChange={(v) => set('Round', v)} />

        <Label text="Result" />
        <select
          value={headers.Result}
          onChange={(e) => set('Result', e.target.value)}
          style={inputStyle}
        >
          {RESULTS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        <Label text="WhiteElo" />
        <Input value={headers.WhiteElo} onChange={(v) => set('WhiteElo', v)} inputMode="numeric" />

        <Label text="BlackElo" />
        <Input value={headers.BlackElo} onChange={(v) => set('BlackElo', v)} inputMode="numeric" />

        <Label text="WhiteTeam" />
        <Input value={headers.WhiteTeam} onChange={(v) => set('WhiteTeam', v)} />

        <Label text="BlackTeam" />
        <Input value={headers.BlackTeam} onChange={(v) => set('BlackTeam', v)} />

        <Label text="WhiteFideId" />
        <Input value={headers.WhiteFideId} onChange={(v) => set('WhiteFideId', v)} />

        <Label text="BlackFideId" />
        <Input value={headers.BlackFideId} onChange={(v) => set('BlackFideId', v)} />

        <Label text="WhiteCzId" />
        <Input value={headers.WhiteCzId} onChange={(v) => set('WhiteCzId', v)} />

        <Label text="BlackCzId" />
        <Input value={headers.BlackCzId} onChange={(v) => set('BlackCzId', v)} />
      </div>
    </div>
  );
}

function Label({ text }: { text: string }) {
  return <span style={{ fontSize: '0.8rem', color: '#666' }}>{text}</span>;
}

function Input({
  value,
  onChange,
  placeholder,
  invalid,
  inputMode,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  invalid?: boolean;
  inputMode?: 'numeric' | 'text';
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      inputMode={inputMode}
      onChange={(e) => onChange(e.target.value)}
      style={{
        ...inputStyle,
        borderColor: invalid ? '#dc2626' : '#ccc',
        background: invalid ? '#fef2f2' : '#fff',
      }}
    />
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

const containerStyle: React.CSSProperties = {
  border: '1px solid #e0e0e0',
  borderRadius: 6,
  padding: '0.75rem',
};

const headerStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#666',
  textTransform: 'uppercase',
  marginBottom: '0.5rem',
};
