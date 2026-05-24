import { useState } from 'react';
import { splitPgn } from '../../lib/pgn';

type Props = {
  onCancel: () => void;
  onConfirm: (movesPgn: string) => void;
};

const MOVE_REGEX = /(?:O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?/g;

function countPlies(movesPgn: string): number {
  return movesPgn.match(MOVE_REGEX)?.length ?? 0;
}

function previewMoves(movesPgn: string, maxPlies = 10): string {
  const matches = movesPgn.match(MOVE_REGEX) ?? [];
  const head = matches.slice(0, maxPlies);
  const formatted: string[] = [];
  for (let i = 0; i < head.length; i++) {
    if (i % 2 === 0) formatted.push(`${Math.floor(i / 2) + 1}.${head[i]}`);
    else formatted.push(head[i]);
  }
  const tail = matches.length > maxPlies ? ' …' : '';
  return formatted.join(' ') + tail;
}

export function LoadMovesDialog({ onCancel, onConfirm }: Props) {
  const [tab, setTab] = useState<'file' | 'text'>('file');
  const [pgnText, setPgnText] = useState('');
  const [parsedMoves, setParsedMoves] = useState<string | null>(null);
  const [parseError, setParseError] = useState('');

  const handleParse = (text: string) => {
    setParseError('');
    setParsedMoves(null);

    const trimmed = text.trim();
    if (!trimmed) {
      setParseError('Prázdný vstup.');
      return;
    }

    let games;
    try {
      games = splitPgn(trimmed);
    } catch {
      setParseError('Chyba při parsování PGN.');
      return;
    }

    if (games.length === 0) {
      setParseError('Nebyly nalezeny žádné tahy.');
      return;
    }
    if (games.length > 1) {
      setParseError(`PGN obsahuje ${games.length} partií. Vložte jen jednu.`);
      return;
    }

    const movesPgn = games[0].movesPgn.trim();
    if (!movesPgn || countPlies(movesPgn) === 0) {
      setParseError('Partie neobsahuje žádné tahy.');
      return;
    }

    setParsedMoves(movesPgn);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    readFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    readFile(file);
  };

  const readFile = (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      setParseError('Soubor je příliš velký (max 10 MB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setPgnText(text);
      handleParse(text);
    };
    reader.readAsText(file);
  };

  const plies = parsedMoves ? countPlies(parsedMoves) : 0;
  const fullMoves = Math.ceil(plies / 2);

  return (
    <div style={containerStyle}>
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Nahrát tahy z PGN</h3>
      <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: '#666' }}>
        Tahy nahradí stávající. Hlavičky partie zůstanou beze změny.
      </p>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
        <button
          onClick={() => setTab('file')}
          style={{ ...tabBtnStyle, borderBottomColor: tab === 'file' ? '#333' : 'transparent' }}
        >
          Soubor
        </button>
        <button
          onClick={() => setTab('text')}
          style={{ ...tabBtnStyle, borderBottomColor: tab === 'text' ? '#333' : 'transparent' }}
        >
          Text
        </button>
      </div>

      {tab === 'file' ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          style={dropZoneStyle}
        >
          <p style={{ margin: '0 0 0.5rem', color: '#666', fontSize: '0.85rem' }}>Přetáhněte PGN sem, nebo</p>
          <input type="file" accept=".pgn,text/plain" onChange={handleFile} />
        </div>
      ) : (
        <div style={{ marginBottom: '0.75rem' }}>
          <textarea
            placeholder="Vložte PGN nebo jen tahy (např. 1.e4 e5 2.Nf3 Nc6 …)"
            value={pgnText}
            onChange={(e) => setPgnText(e.target.value)}
            rows={8}
            style={{
              width: '100%', fontFamily: 'monospace', fontSize: '0.8rem',
              padding: '0.5rem', border: '1px solid #ccc', borderRadius: 4, resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
          <button
            onClick={() => handleParse(pgnText)}
            style={{ ...primaryBtnStyle, marginTop: '0.5rem' }}
            disabled={!pgnText.trim()}
          >
            Načíst tahy
          </button>
        </div>
      )}

      {parseError && (
        <p style={{ color: '#dc2626', fontSize: '0.85rem', margin: '0.5rem 0' }}>{parseError}</p>
      )}

      {parsedMoves && (
        <div style={previewBoxStyle}>
          <div style={{ fontSize: '0.8rem', color: '#555', marginBottom: '0.4rem' }}>
            <strong>{fullMoves}</strong> tahů ({plies} polotahů)
          </div>
          <div style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: '#333', wordBreak: 'break-word' }}>
            {previewMoves(parsedMoves)}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
        <button onClick={onCancel} style={secondaryBtnStyle}>Zrušit</button>
        <button
          onClick={() => parsedMoves && onConfirm(parsedMoves)}
          style={primaryBtnStyle}
          disabled={!parsedMoves}
        >
          Nahrát tahy
        </button>
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: 6,
  padding: '1rem',
  marginBottom: '1rem',
  background: '#fafafa',
};

const dropZoneStyle: React.CSSProperties = {
  border: '2px dashed #ccc',
  borderRadius: 6,
  padding: '1.5rem',
  textAlign: 'center',
  marginBottom: '0.75rem',
};

const previewBoxStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 4,
  padding: '0.5rem 0.75rem',
  marginTop: '0.5rem',
  background: '#fff',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '0.4rem 0.9rem',
  fontSize: '0.85rem',
  cursor: 'pointer',
  border: '1px solid #333',
  borderRadius: 4,
  background: '#333',
  color: '#fff',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '0.4rem 0.9rem',
  fontSize: '0.85rem',
  cursor: 'pointer',
  border: '1px solid #ddd',
  borderRadius: 4,
  background: '#fff',
  color: '#333',
};

const tabBtnStyle: React.CSSProperties = {
  padding: '0.25rem 0',
  fontSize: '0.85rem',
  cursor: 'pointer',
  border: 'none',
  borderBottom: '2px solid transparent',
  background: 'none',
};
