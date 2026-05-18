import type { EditorHeaders } from '../../lib/editorPgn';

type Props = {
  headers: EditorHeaders;
  onChange: (next: EditorHeaders) => void;
  showRequired: boolean;
  initialHeaders?: EditorHeaders;
};

const RESULTS = ['*', '1-0', '0-1', '1/2-1/2'];

export function HeaderForm({ headers, onChange, showRequired, initialHeaders }: Props) {
  const set = <K extends keyof EditorHeaders>(key: K, value: EditorHeaders[K]) => {
    onChange({ ...headers, [key]: value });
  };

  const missing = (key: keyof EditorHeaders) => showRequired && !headers[key].trim();
  const changed = (key: keyof EditorHeaders) => !!initialHeaders && headers[key] !== initialHeaders[key];

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Hlavičky partie</div>
      <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '0.4rem 0.5rem', alignItems: 'center' }}>
        <Label text="Event *" />
        <Input value={headers.Event} onChange={(v) => set('Event', v)} invalid={missing('Event')} changed={changed('Event')} />

        <Label text="Site" />
        <Input value={headers.Site} onChange={(v) => set('Site', v)} changed={changed('Site')} />

        <Label text="White *" />
        <Input value={headers.White} onChange={(v) => set('White', v)} invalid={missing('White')} changed={changed('White')} />

        <Label text="Black *" />
        <Input value={headers.Black} onChange={(v) => set('Black', v)} invalid={missing('Black')} changed={changed('Black')} />

        <Label text="Date" />
        <Input value={headers.Date} onChange={(v) => set('Date', v)} placeholder="YYYY.MM.DD" changed={changed('Date')} />

        <Label text="Round" />
        <Input value={headers.Round} onChange={(v) => set('Round', v)} changed={changed('Round')} />

        <Label text="Board" />
        <Input value={headers.Board} onChange={(v) => set('Board', v)} changed={changed('Board')} />

        <Label text="Result" />
        <select
          value={headers.Result}
          onChange={(e) => set('Result', e.target.value)}
          style={{ ...inputStyle, background: changed('Result') ? '#fef9c3' : '#fff' }}
        >
          {RESULTS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        <Label text="WhiteElo" />
        <Input value={headers.WhiteElo} onChange={(v) => set('WhiteElo', v)} inputMode="numeric" changed={changed('WhiteElo')} />

        <Label text="WhiteFideElo" />
        <Input value={headers.WhiteFideElo} onChange={(v) => set('WhiteFideElo', v)} inputMode="numeric" changed={changed('WhiteFideElo')} />

        <Label text="WhiteCzeElo" />
        <Input value={headers.WhiteCzeElo} onChange={(v) => set('WhiteCzeElo', v)} inputMode="numeric" changed={changed('WhiteCzeElo')} />

        <Label text="BlackElo" />
        <Input value={headers.BlackElo} onChange={(v) => set('BlackElo', v)} inputMode="numeric" changed={changed('BlackElo')} />

        <Label text="BlackFideElo" />
        <Input value={headers.BlackFideElo} onChange={(v) => set('BlackFideElo', v)} inputMode="numeric" changed={changed('BlackFideElo')} />

        <Label text="BlackCzeElo" />
        <Input value={headers.BlackCzeElo} onChange={(v) => set('BlackCzeElo', v)} inputMode="numeric" changed={changed('BlackCzeElo')} />

        <Label text="WhiteTeam" />
        <Input value={headers.WhiteTeam} onChange={(v) => set('WhiteTeam', v)} changed={changed('WhiteTeam')} />

        <Label text="BlackTeam" />
        <Input value={headers.BlackTeam} onChange={(v) => set('BlackTeam', v)} changed={changed('BlackTeam')} />

        <Label text="WhiteFideId" />
        <Input value={headers.WhiteFideId} onChange={(v) => set('WhiteFideId', v)} changed={changed('WhiteFideId')} />

        <Label text="BlackFideId" />
        <Input value={headers.BlackFideId} onChange={(v) => set('BlackFideId', v)} changed={changed('BlackFideId')} />

        <Label text="WhiteCzeId" />
        <Input value={headers.WhiteCzeId} onChange={(v) => set('WhiteCzeId', v)} changed={changed('WhiteCzeId')} />

        <Label text="BlackCzeId" />
        <Input value={headers.BlackCzeId} onChange={(v) => set('BlackCzeId', v)} changed={changed('BlackCzeId')} />
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
  changed,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  invalid?: boolean;
  inputMode?: 'numeric' | 'text';
  changed?: boolean;
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
        borderColor: invalid ? '#dc2626' : changed ? '#facc15' : '#ccc',
        background: invalid ? '#fef2f2' : changed ? '#fef9c3' : '#fff',
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
