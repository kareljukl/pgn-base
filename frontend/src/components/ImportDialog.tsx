import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import { splitPgn, type RawGame } from '../lib/pgn';

type Props = {
  databaseId: string;
  onDone: () => void;
  onCancel: () => void;
};

export function ImportDialog({ databaseId, onDone, onCancel }: Props) {
  const [tab, setTab] = useState<'file' | 'text'>('file');
  const [pgnText, setPgnText] = useState('');
  const [parsed, setParsed] = useState<RawGame[] | null>(null);
  const [parseError, setParseError] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const importMutation = useMutation({
    mutationFn: (games: RawGame[]) =>
      api.post<{ imported: number }>(`/databases/${databaseId}/games`, { games }),
    onSuccess: (data) => {
      setResult(`Importováno ${data.imported} partií.`);
    },
  });

  const handleParse = (text: string) => {
    setParseError('');
    setParsed(null);
    setResult(null);

    if (!text.trim()) {
      setParseError('Prázdný vstup.');
      return;
    }

    try {
      const games = splitPgn(text);
      if (games.length === 0) {
        setParseError('Nebyly nalezeny žádné partie. Zkontrolujte formát PGN.');
        return;
      }
      if (games.length > 500) {
        setParseError(`Nalezeno ${games.length} partií. Maximum je 500 na jeden import.`);
        return;
      }
      setParsed(games);
    } catch {
      setParseError('Chyba při parsování PGN.');
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;

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

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 6, padding: '1.25rem', marginBottom: '1.5rem', background: '#fafafa' }}>
      <h3 style={{ margin: '0 0 1rem' }}>Import partií</h3>

      {result ? (
        <div>
          <p style={{ color: '#16a34a', fontWeight: 500 }}>{result}</p>
          <button onClick={onDone} style={btnStyle}>Zavřít</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
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
              style={{ border: '2px dashed #ccc', borderRadius: 6, padding: '2rem', textAlign: 'center', marginBottom: '1rem' }}
            >
              <p style={{ margin: '0 0 0.5rem', color: '#666' }}>Přetáhněte PGN soubor sem, nebo</p>
              <input type="file" accept=".pgn" onChange={handleFile} />
            </div>
          ) : (
            <div style={{ marginBottom: '1rem' }}>
              <textarea
                placeholder="Vložte PGN text..."
                value={pgnText}
                onChange={(e) => setPgnText(e.target.value)}
                rows={10}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.8rem', padding: '0.5rem', border: '1px solid #ccc', borderRadius: 4, resize: 'vertical' }}
              />
              <button
                onClick={() => handleParse(pgnText)}
                style={{ ...btnStyle, marginTop: '0.5rem' }}
                disabled={!pgnText.trim()}
              >
                Načíst partie
              </button>
            </div>
          )}

          {parseError && <p style={{ color: '#dc2626', fontSize: '0.875rem' }}>{parseError}</p>}

          {parsed && (
            <div>
              <p style={{ fontWeight: 500, marginBottom: '0.5rem' }}>
                Nalezeno {parsed.length} {parsed.length === 1 ? 'partie' : parsed.length < 5 ? 'partie' : 'partií'}
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', marginBottom: '1rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #ddd' }}>
                    <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Bílý</th>
                    <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Černý</th>
                    <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Výsledek</th>
                    <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Event</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 5).map((game, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '0.25rem 0.5rem' }}>{game.headers.White || '?'}</td>
                      <td style={{ padding: '0.25rem 0.5rem' }}>{game.headers.Black || '?'}</td>
                      <td style={{ padding: '0.25rem 0.5rem' }}>{game.headers.Result || '*'}</td>
                      <td style={{ padding: '0.25rem 0.5rem' }}>{game.headers.Event || '—'}</td>
                    </tr>
                  ))}
                  {parsed.length > 5 && (
                    <tr><td colSpan={4} style={{ padding: '0.25rem 0.5rem', color: '#888' }}>... a dalších {parsed.length - 5}</td></tr>
                  )}
                </tbody>
              </table>

              <button
                onClick={() => importMutation.mutate(parsed)}
                style={btnStyle}
                disabled={importMutation.isPending}
              >
                {importMutation.isPending ? 'Importuji...' : `Importovat ${parsed.length} partií`}
              </button>
              <button onClick={onCancel} style={{ ...smallBtnStyle, marginLeft: '0.5rem' }}>Zrušit</button>

              {importMutation.isError && (
                <p style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                  {importMutation.error?.message || 'Chyba při importu.'}
                </p>
              )}
            </div>
          )}

          {!parsed && !parseError && (
            <button onClick={onCancel} style={smallBtnStyle}>Zrušit</button>
          )}
        </>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  fontSize: '0.875rem',
  cursor: 'pointer',
  border: '1px solid #333',
  borderRadius: 4,
  background: '#333',
  color: '#fff',
};

const smallBtnStyle: React.CSSProperties = {
  padding: '0.25rem 0.5rem',
  fontSize: '0.8rem',
  cursor: 'pointer',
  border: '1px solid #ddd',
  borderRadius: 4,
  background: '#fff',
};

const tabBtnStyle: React.CSSProperties = {
  padding: '0.25rem 0',
  fontSize: '0.875rem',
  cursor: 'pointer',
  border: 'none',
  borderBottom: '2px solid transparent',
  background: 'none',
};
