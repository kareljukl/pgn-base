import { useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

type DatabaseInfo = {
  id: string;
  name: string;
  description: string | null;
  owner_name: string;
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

export function PublicDatabase() {
  const { id } = useParams<{ id: string }>();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('date');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const { data: dbData } = useQuery({
    queryKey: ['public', 'database', id],
    queryFn: () => api.get<{ database: DatabaseInfo }>(`/public/databases/${id}`),
  });

  const { data: gamesData, isLoading } = useQuery({
    queryKey: ['public', 'games', id, { q: debouncedSearch, page, sort, order }],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), sort, order });
      if (debouncedSearch) params.set('q', debouncedSearch);
      return api.get<GamesResponse>(`/public/databases/${id}/games?${params}`);
    },
  });

  const handleSearch = (value: string) => {
    setSearch(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    setDebounceTimer(setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300));
  };

  const handleSort = (column: string) => {
    if (sort === column) {
      setOrder(order === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(column);
      setOrder('asc');
    }
    setPage(1);
  };

  const db = dbData?.database;
  const games = gamesData?.games ?? [];
  const total = gamesData?.total ?? 0;
  const totalPages = Math.ceil(total / (gamesData?.limit ?? 25));
  const sortIcon = (col: string) => sort === col ? (order === 'asc' ? ' ▲' : ' ▼') : '';

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: '0 0 0.25rem' }}>{db?.name ?? 'Načítání...'}</h1>
        {db?.description && <p style={{ color: '#666', margin: '0 0 0.25rem' }}>{db.description}</p>}
        {db?.owner_name && <p style={{ color: '#888', fontSize: '0.85rem', margin: 0 }}>Vlastník: {db.owner_name}</p>}
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Hledat hráče..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          style={{ padding: '0.4rem 0.75rem', fontSize: '0.875rem', border: '1px solid #ccc', borderRadius: 4, width: 250 }}
        />
        {total > 0 && <span style={{ color: '#666', fontSize: '0.875rem' }}>{total} partií</span>}
        {db && (
          <ExportButtons baseUrl={`/public/databases/${id}/export`} />
        )}
      </div>

      {isLoading ? (
        <p>Načítání...</p>
      ) : games.length === 0 ? (
        <p style={{ color: '#888' }}>
          {debouncedSearch ? 'Žádné partie odpovídající hledání.' : 'Žádné partie.'}
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
              </tr>
            </thead>
            <tbody>
              {games.map((game) => (
                <tr key={game.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={tdStyle}>
                    <Link to={`/public/${id}/game/${game.id}`}>
                      {game.white || '?'}{game.white_elo ? ` (${game.white_elo})` : ''}
                    </Link>
                  </td>
                  <td style={tdStyle}>
                    {game.black || '?'}{game.black_elo ? ` (${game.black_elo})` : ''}
                  </td>
                  <td style={tdStyle}>{game.result || '*'}</td>
                  <td style={tdStyle}>{game.date || '—'}</td>
                  <td style={tdStyle}>{game.event || '—'}</td>
                  <td style={tdStyle}>{game.round || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} style={smallBtnStyle}>
                ← Předchozí
              </button>
              <span style={{ fontSize: '0.875rem' }}>Strana {page} z {totalPages}</span>
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

function ExportButtons({ baseUrl }: { baseUrl: string }) {
  return (
    <span style={{ display: 'flex', gap: '0.25rem' }}>
      <a href={`/api/v1${baseUrl}?mode=full`} download style={smallBtnStyle}>
        Export PGN
      </a>
      <a href={`/api/v1${baseUrl}?mode=stripped`} download style={{ ...smallBtnStyle, color: '#666' }}>
        Export (bez komentářů)
      </a>
    </span>
  );
}

const smallBtnStyle: React.CSSProperties = {
  padding: '0.25rem 0.5rem',
  fontSize: '0.8rem',
  cursor: 'pointer',
  border: '1px solid #ddd',
  borderRadius: 4,
  background: '#fff',
  textDecoration: 'none',
  color: '#333',
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
