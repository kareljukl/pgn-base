import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, API_ORIGIN } from '../lib/api';
import { ImportDialog } from '../components/ImportDialog';
import { BulkActionDialog } from '../components/DatabaseDetail/BulkActionDialog';
import { removeDiacritics, stripMovetext, hasAnyTopLevelVariation } from '../lib/pgnUtils';
import { headersFromGameRow, toApiHeaders, type EditorHeaders } from '../lib/editorPgn';

type DatabaseInfo = {
  id: string;
  name: string;
  description: string | null;
  game_count: number;
};

type Game = {
  id: string;
  event: string | null;
  site: string | null;
  date: string | null;
  round: string | null;
  board: string | null;
  white: string | null;
  black: string | null;
  white_elo: number | null;
  black_elo: number | null;
  white_fide_elo: number | null;
  black_fide_elo: number | null;
  white_cze_elo: number | null;
  black_cze_elo: number | null;
  white_team: string | null;
  black_team: string | null;
  white_fide_id: string | null;
  black_fide_id: string | null;
  white_cze_id: string | null;
  black_cze_id: string | null;
  result: string | null;
  eco: string | null;
  moves_pgn?: string;
};

type GamesResponse = {
  games: Game[];
  total: number;
  page: number;
  limit: number;
};

type BulkUpdateItem = {
  gameId: string;
  headers: Record<string, string>;
  movesPgn?: string;
};

type BulkDialogState = {
  title: string;
  message: string;
  totalCount: number;
  updates: BulkUpdateItem[];
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
  const [refusedGameIds, setRefusedGameIds] = useState<Set<string>>(new Set());
  const [bulkDialog, setBulkDialog] = useState<BulkDialogState | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    setRefusedGameIds(new Set());
  }, [debouncedSearch, sort, order]);

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

  const bulkMutation = useMutation({
    mutationFn: (updates: BulkUpdateItem[]) =>
      api.post<{ updated: number }>(`/databases/${id}/games/bulk-update`, { updates }),
    onSuccess: (resp) => {
      setBulkDialog(null);
      setRefusedGameIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['games', id] });
      alert(`Upraveno ${resp.updated} partií.`);
    },
    onError: (err: Error) => {
      alert(`Chyba: ${err.message ?? 'neznámá chyba'}`);
    },
  });

  const fetchAllFilteredGames = async (includeMoves: boolean): Promise<{ games: Game[]; total: number }> => {
    const params = new URLSearchParams({ limit: '1000', sort, order });
    if (debouncedSearch) params.set('q', debouncedSearch);
    if (includeMoves) params.set('includeMoves', 'true');
    return api.get<GamesResponse>(`/databases/${id}/games?${params}`);
  };

  const handleBulkDiacritics = async () => {
    if (bulkBusy) return;
    setBulkBusy(true);
    try {
      const { games: allGames, total } = await fetchAllFilteredGames(false);
      if (total > 1000) {
        alert('Filtr obsahuje více než 1000 partií. Zúžte filtr.');
        return;
      }
      const fields: (keyof EditorHeaders)[] = ['Event', 'Site', 'White', 'Black', 'WhiteTeam', 'BlackTeam'];
      const updates: BulkUpdateItem[] = [];
      for (const g of allGames) {
        const headers = headersFromGameRow(g);
        const next = { ...headers };
        let dirty = false;
        for (const f of fields) {
          const stripped = removeDiacritics(headers[f]);
          if (stripped !== headers[f]) {
            next[f] = stripped;
            dirty = true;
          }
        }
        if (dirty) updates.push({ gameId: g.id, headers: toApiHeaders(next) });
      }
      if (updates.length === 0) {
        alert('Žádná partie nepotřebuje úpravu diakritiky.');
        return;
      }
      setBulkDialog({
        title: 'Odstranění diakritiky',
        message: `Bude upraveno ${updates.length} z ${total} partií ve filtru.`,
        totalCount: total,
        updates,
      });
    } catch (err) {
      alert(`Chyba při načítání partií: ${(err as Error).message ?? 'neznámá chyba'}`);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkCleanup = async () => {
    if (bulkBusy) return;
    setBulkBusy(true);
    try {
      const { games: allGames, total } = await fetchAllFilteredGames(true);
      if (total > 1000) {
        alert('Filtr obsahuje více než 1000 partií. Zúžte filtr.');
        return;
      }
      const problematic: string[] = [];
      for (const g of allGames) {
        if (hasAnyTopLevelVariation(g.moves_pgn ?? '')) problematic.push(g.id);
      }
      if (problematic.length > 0) {
        setRefusedGameIds(new Set(problematic));
        alert(
          `${problematic.length} ${problematic.length === 1 ? 'partie obsahuje' : 'partií obsahuje'} varianty a nelze hromadně vyčistit (podbarveno). Vyčistěte je ručně v náhledu partie nebo zúžte filtr.`
        );
        return;
      }
      const updates: BulkUpdateItem[] = [];
      for (const g of allGames) {
        const raw = g.moves_pgn ?? '';
        const cleaned = stripMovetext(raw);
        if (cleaned !== raw.trim()) {
          const headers = headersFromGameRow(g);
          updates.push({ gameId: g.id, headers: toApiHeaders(headers), movesPgn: cleaned });
        }
      }
      if (updates.length === 0) {
        alert('Všechny partie ve filtru jsou již čisté.');
        return;
      }
      setBulkDialog({
        title: 'Vyčisti PGN',
        message: `Bude upraveno ${updates.length} z ${total} partií. Odstraní se komentáře, NAG, glyfy a escape řádky.`,
        totalCount: total,
        updates,
      });
    } catch (err) {
      alert(`Chyba při načítání partií: ${(err as Error).message ?? 'neznámá chyba'}`);
    } finally {
      setBulkBusy(false);
    }
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
          <button
            onClick={handleBulkDiacritics}
            disabled={bulkBusy || bulkMutation.isPending || total === 0}
            title="Odstraní diakritiku z Event, Site, jmen hráčů a názvů týmů ve všech vyfiltrovaných partiích"
            style={smallBtnStyle}
          >
            Odstranění diakritiky
          </button>
          <button
            onClick={handleBulkCleanup}
            disabled={bulkBusy || bulkMutation.isPending || total === 0}
            title="Vyčistí PGN ve všech vyfiltrovaných partiích bez variant"
            style={smallBtnStyle}
          >
            Vyčisti PGN
          </button>
          <button onClick={() => navigate(`/db/${id}/game/new`)} style={btnStyle}>
            + Nová partie
          </button>
          <button onClick={() => setShowImport(true)} style={btnStyle}>
            Importovat partie
          </button>
        </div>
      </div>

      {bulkDialog && (
        <BulkActionDialog
          title={bulkDialog.title}
          message={bulkDialog.message}
          updateCount={bulkDialog.updates.length}
          totalCount={bulkDialog.totalCount}
          isPending={bulkMutation.isPending}
          onConfirm={() => bulkMutation.mutate(bulkDialog.updates)}
          onCancel={() => setBulkDialog(null)}
        />
      )}

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
                  style={{
                    borderBottom: '1px solid #eee',
                    cursor: 'pointer',
                    background: refusedGameIds.has(game.id) ? '#fee2e2' : undefined,
                  }}
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
