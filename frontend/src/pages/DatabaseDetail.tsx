import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, API_ORIGIN } from '../lib/api';
import { ImportDialog } from '../components/ImportDialog';

type DatabaseInfo = {
  id: string;
  name: string;
  description: string | null;
  game_count: number;
};

type Game = {
  id: string;
  white: string | null;
  black: string | null;
  white_elo: number | null;
  black_elo: number | null;
  result: string | null;
  date: string | null;
  event: string | null;
  round: string | null;
};

type GamesResponse = {
  games: Game[];
  total: number;
  page: number;
  limit: number;
};

export function DatabaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showImport, setShowImport] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('date');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  const { data: dbList } = useQuery({
    queryKey: ['databases'],
    queryFn: () => api.get<{ databases: DatabaseInfo[] }>('/databases'),
  });

  const dbName = dbList?.databases.find((d) => d.id === id)?.name ?? '';

  // Debounce search
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = (value: string) => {
    setSearch(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    setDebounceTimer(setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300));
  };

  const { data, isLoading } = useQuery({
    queryKey: ['games', id, { q: debouncedSearch, page, sort, order }],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), sort, order });
      if (debouncedSearch) params.set('q', debouncedSearch);
      return api.get<GamesResponse>(`/databases/${id}/games?${params}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (gameId: string) => api.delete(`/databases/${id}/games/${gameId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['games', id] }),
  });

  const handleSort = (column: string) => {
    if (sort === column) {
      setOrder(order === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(column);
      setOrder('asc');
    }
    setPage(1);
  };

  const games = data?.games ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / (data?.limit ?? 25));

  const sortIcon = (col: string) => sort === col ? (order === 'asc' ? ' ▲' : ' ▼') : '';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h1 style={{ margin: 0 }}>{dbName || 'Partie'}</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {total > 0 && (
            <>
              <a href={`${API_ORIGIN}/api/v1/databases/${id}/export?mode=full`} download style={exportBtnStyle}>
                Export PGN
              </a>
              <a href={`${API_ORIGIN}/api/v1/databases/${id}/export?mode=stripped`} download style={{ ...exportBtnStyle, color: '#666' }}>
                Export (bez komentářů)
              </a>
            </>
          )}
          <button onClick={() => navigate(`/db/${id}/game/new`)} style={btnStyle}>
            + Nová partie
          </button>
          <button onClick={() => setShowImport(true)} style={btnStyle}>
            Importovat partie
          </button>
        </div>
      </div>

      {showImport && (
        <ImportDialog
          databaseId={id!}
          onDone={() => {
            setShowImport(false);
            queryClient.invalidateQueries({ queryKey: ['games', id] });
          }}
          onCancel={() => setShowImport(false)}
        />
      )}

      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Hledat hráče..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          style={{ padding: '0.4rem 0.75rem', fontSize: '0.875rem', border: '1px solid #ccc', borderRadius: 4, width: 250 }}
        />
        {total > 0 && <span style={{ marginLeft: '1rem', color: '#666', fontSize: '0.875rem' }}>{total} partií</span>}
      </div>

      {isLoading ? (
        <p>Načítání...</p>
      ) : games.length === 0 ? (
        <p style={{ color: '#888' }}>
          {debouncedSearch ? 'Žádné partie odpovídající hledání.' : 'Žádné partie. Importujte PGN soubor.'}
        </p>
      ) : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e0e0e0', textAlign: 'left' }}>
                <th style={thStyle} onClick={() => handleSort('white')} role="button">Bílý{sortIcon('white')}</th>
                <th style={thStyle} onClick={() => handleSort('black')} role="button">Černý{sortIcon('black')}</th>
                <th style={thStyle} onClick={() => handleSort('result')} role="button">Výsledek{sortIcon('result')}</th>
                <th style={thStyle} onClick={() => handleSort('date')} role="button">Datum{sortIcon('date')}</th>
                <th style={thStyle} onClick={() => handleSort('event')} role="button">Event{sortIcon('event')}</th>
                <th style={thStyle} onClick={() => handleSort('round')} role="button">Kolo{sortIcon('round')}</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {games.map((game) => (
                <tr
                  key={game.id}
                  style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}
                  onClick={() => navigate(`/db/${id}/game/${game.id}`, {
                    state: {
                      filter: debouncedSearch,
                      sort,
                      order,
                      dbName,
                      dbId: id,
                    },
                  })}
                >
                  <td style={{ ...tdStyle, fontWeight: 500, color: '#2563eb' }}>
                    {game.white || '?'}{game.white_elo ? ` (${game.white_elo})` : ''}
                  </td>
                  <td style={tdStyle}>
                    {game.black || '?'}{game.black_elo ? ` (${game.black_elo})` : ''}
                  </td>
                  <td style={tdStyle}>{game.result || '*'}</td>
                  <td style={tdStyle}>{game.date || '—'}</td>
                  <td style={tdStyle}>{game.event || '—'}</td>
                  <td style={tdStyle}>{game.round || '—'}</td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => {
                        if (confirm('Smazat tuto partii?')) deleteMutation.mutate(game.id);
                      }}
                      style={{ ...smallBtnStyle, color: '#dc2626' }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} style={smallBtnStyle}>
                ← Předchozí
              </button>
              <span style={{ fontSize: '0.875rem' }}>
                Strana {page} z {totalPages}
              </span>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} style={smallBtnStyle}>
                Další →
              </button>
            </div>
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

const exportBtnStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  fontSize: '0.875rem',
  cursor: 'pointer',
  border: '1px solid #ddd',
  borderRadius: 4,
  background: '#fff',
  color: '#333',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
};

const smallBtnStyle: React.CSSProperties = {
  padding: '0.25rem 0.5rem',
  fontSize: '0.8rem',
  cursor: 'pointer',
  border: '1px solid #ddd',
  borderRadius: 4,
  background: '#fff',
};

const thStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  fontSize: '0.8rem',
  textTransform: 'uppercase',
  color: '#666',
  cursor: 'pointer',
  userSelect: 'none',
};

const tdStyle: React.CSSProperties = { padding: '0.6rem 0.75rem' };
