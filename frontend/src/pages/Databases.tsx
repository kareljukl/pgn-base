import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { ChessczImportDialog } from '../components/Databases/ChessczImportDialog';

type Database = {
  id: string;
  name: string;
  description: string | null;
  is_public: number;
  game_count: number;
  season_id: string | null;
  created_at: number;
  updated_at: number;
};

type Season = {
  id: string;
  name: string;
  description: string | null;
  chesscz_comp_id: number;
  chesscz_team_id: number;
  round_count: number;
  created_at: number;
  updated_at: number;
};

export function Databases() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showChessczImport, setShowChessczImport] = useState(false);
  const [showSeasonImport, setShowSeasonImport] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['databases'],
    queryFn: () => api.get<{ databases: Database[] }>('/databases'),
  });

  const { data: seasonsData } = useQuery({
    queryKey: ['seasons'],
    queryFn: () => api.get<{ seasons: Season[] }>('/seasons'),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description: string }) =>
      api.post('/databases', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['databases'] });
      setShowCreate(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; description?: string; is_public?: boolean }) =>
      api.patch(`/databases/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['databases'] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/databases/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['databases'] });
    },
  });

  if (isLoading) return <p>Načítání...</p>;

  const allDatabases = data?.databases ?? [];
  const seasons = seasonsData?.seasons ?? [];
  const databases = allDatabases.filter((db) => db.season_id == null);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Moje databáze</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setShowSeasonImport(true)} style={secondaryBtnStyle}>
            Nová sezóna ze ŠSČR
          </button>
          <button onClick={() => setShowChessczImport(true)} style={secondaryBtnStyle}>
            Importovat ze ŠSČR
          </button>
          <button onClick={() => setShowCreate(true)} style={btnStyle}>
            + Nová databáze
          </button>
        </div>
      </div>

      {showCreate && (
        <CreateDialog
          onSubmit={(name, description) => createMutation.mutate({ name, description })}
          onCancel={() => setShowCreate(false)}
          error={createMutation.error?.message}
        />
      )}

      {showChessczImport && (
        <ChessczImportDialog mode="match" onClose={() => setShowChessczImport(false)} />
      )}

      {showSeasonImport && (
        <ChessczImportDialog mode="season" onClose={() => setShowSeasonImport(false)} />
      )}

      {seasons.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', margin: '0 0 0.5rem' }}>Sezóny</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e0e0e0', textAlign: 'left' }}>
                <th style={thStyle}>Název</th>
                <th style={thStyle}>Popis</th>
                <th style={thStyle}>Kol</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {seasons.map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={tdStyle}>
                    <Link to={`/season/${s.id}`} style={{ fontWeight: 500 }}>{s.name}</Link>
                  </td>
                  <td style={{ ...tdStyle, color: '#666' }}>{s.description || '—'}</td>
                  <td style={tdStyle}>{s.round_count}</td>
                  <td style={tdStyle}></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {databases.length === 0 ? (
        <p style={{ color: '#888' }}>Zatím nemáte žádné databáze. Vytvořte si první.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e0e0e0', textAlign: 'left' }}>
              <th style={thStyle}>Název</th>
              <th style={thStyle}>Popis</th>
              <th style={thStyle}>Partií</th>
              <th style={thStyle}>Viditelnost</th>
              <th style={thStyle}>Akce</th>
            </tr>
          </thead>
          <tbody>
            {databases.map((db) => (
              <tr key={db.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={tdStyle}>
                  {editingId === db.id ? (
                    <EditInline
                      database={db}
                      onSave={(name, description) =>
                        updateMutation.mutate({ id: db.id, name, description })
                      }
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <Link to={`/db/${db.id}`} style={{ fontWeight: 500 }}>{db.name}</Link>
                  )}
                </td>
                <td style={{ ...tdStyle, color: '#666' }}>
                  {editingId !== db.id && (db.description || '—')}
                </td>
                <td style={tdStyle}>{db.game_count}</td>
                <td style={tdStyle}>
                  <button
                    onClick={() => updateMutation.mutate({ id: db.id, is_public: !db.is_public })}
                    style={{ ...smallBtnStyle, color: db.is_public ? '#16a34a' : '#888' }}
                    title={db.is_public ? 'Klikněte pro skrytí' : 'Klikněte pro zveřejnění'}
                  >
                    {db.is_public ? 'Veřejná' : 'Soukromá'}
                  </button>
                </td>
                <td style={tdStyle}>
                  <button onClick={() => setEditingId(db.id)} style={smallBtnStyle}>
                    Upravit
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Smazat databázi "${db.name}"? Smaže se i všech ${db.game_count} partií.`)) {
                        deleteMutation.mutate(db.id);
                      }
                    }}
                    style={{ ...smallBtnStyle, color: '#dc2626' }}
                  >
                    Smazat
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CreateDialog({ onSubmit, onCancel, error }: {
  onSubmit: (name: string, description: string) => void;
  onCancel: () => void;
  error?: string;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 6, padding: '1rem', marginBottom: '1.5rem', background: '#fafafa' }}>
      <h3 style={{ margin: '0 0 0.75rem' }}>Nová databáze</h3>
      <div style={{ marginBottom: '0.5rem' }}>
        <input
          placeholder="Název databáze"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
          autoFocus
        />
      </div>
      <div style={{ marginBottom: '0.75rem' }}>
        <input
          placeholder="Popis (volitelný)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={inputStyle}
        />
      </div>
      {error && <p style={{ color: '#dc2626', fontSize: '0.875rem' }}>{error}</p>}
      <button onClick={() => onSubmit(name, description)} style={btnStyle} disabled={!name.trim()}>
        Vytvořit
      </button>
      <button onClick={onCancel} style={{ ...smallBtnStyle, marginLeft: '0.5rem' }}>
        Zrušit
      </button>
    </div>
  );
}

function EditInline({ database, onSave, onCancel }: {
  database: Database;
  onSave: (name: string, description: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(database.name);
  const [description, setDescription] = useState(database.description ?? '');

  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, width: 150 }} autoFocus />
      <input value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle, width: 200 }} placeholder="Popis" />
      <button onClick={() => onSave(name, description)} style={smallBtnStyle} disabled={!name.trim()}>
        Uložit
      </button>
      <button onClick={onCancel} style={smallBtnStyle}>Zrušit</button>
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

const secondaryBtnStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  fontSize: '0.875rem',
  cursor: 'pointer',
  border: '1px solid #ccc',
  borderRadius: 4,
  background: '#fff',
  color: '#333',
};

const smallBtnStyle: React.CSSProperties = {
  padding: '0.25rem 0.5rem',
  fontSize: '0.8rem',
  cursor: 'pointer',
  border: '1px solid #ddd',
  borderRadius: 4,
  background: '#fff',
  marginRight: '0.25rem',
};

const inputStyle: React.CSSProperties = {
  padding: '0.4rem 0.6rem',
  fontSize: '0.875rem',
  border: '1px solid #ccc',
  borderRadius: 4,
  width: '100%',
};

const thStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', fontSize: '0.8rem', textTransform: 'uppercase', color: '#666' };
const tdStyle: React.CSSProperties = { padding: '0.6rem 0.75rem' };
