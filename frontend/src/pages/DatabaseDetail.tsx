import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, API_ORIGIN } from '../lib/api';
import { ImportDialog } from '../components/ImportDialog';
import { BulkActionDialog } from '../components/DatabaseDetail/BulkActionDialog';
import { removeDiacritics, stripMovetext, hasAnyTopLevelVariation, getResultColor } from '../lib/pgnUtils';
import { formatPgnDate } from '../lib/dateFormat';
import { ecoName } from '../lib/ecoNames';
import { headersFromGameRow, toApiHeaders, type EditorHeaders } from '../lib/editorPgn';
import {
  asArray,
  boardGameToHeaders,
  findMatch,
  type ChessczMatchResult,
} from '../lib/chesscz';
import { fetchChessczRoundMatches } from '../hooks/useChessczCompetition';

type DatabaseInfo = {
  id: string;
  name: string;
  description: string | null;
  game_count: number;
  import_source?: string | null;
  chesscz_comp_id?: number | null;
  chesscz_round_nr?: number | null;
  chesscz_home_team_id?: number | null;
  chesscz_away_team_id?: number | null;
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
  ply_count: number | null;
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

  const { data: dbInfo } = useQuery({
    queryKey: ['database', id],
    queryFn: () => api.get<{ database: DatabaseInfo }>(`/databases/${id}`),
    enabled: !!id,
  });

  const database = dbInfo?.database;
  const dbName = database?.name ?? '';
  const isChessczImport = database?.import_source === 'chesscz';

  const [viewMode, setViewMode] = useState<'standard' | 'match'>(() => {
    if (!id) return 'standard';
    return localStorage.getItem(`pgn-base-view-mode-${id}`) === 'match' ? 'match' : 'standard';
  });
  useEffect(() => {
    if (!id) return;
    localStorage.setItem(`pgn-base-view-mode-${id}`, viewMode);
  }, [id, viewMode]);
  // Force standard view when current DB is not a chesscz import.
  useEffect(() => {
    if (database && !isChessczImport && viewMode !== 'standard') {
      setViewMode('standard');
    }
  }, [database, isChessczImport, viewMode]);

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

  const effectiveLimit = viewMode === 'match' ? 1000 : 25;
  const effectivePage = viewMode === 'match' ? 1 : page;
  const effectiveSort = viewMode === 'match' ? 'date' : sort;
  const effectiveOrder = viewMode === 'match' ? 'asc' : order;

  const { data, isLoading } = useQuery({
    queryKey: ['games', id, { q: debouncedSearch, page: effectivePage, sort: effectiveSort, order: effectiveOrder, limit: effectiveLimit }],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(effectivePage),
        sort: effectiveSort,
        order: effectiveOrder,
        limit: String(effectiveLimit),
      });
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

  const [chessczBusy, setChessczBusy] = useState(false);

  const handleLoadChessczResults = async () => {
    if (!database || database.import_source !== 'chesscz' || chessczBusy) return;
    const compId = database.chesscz_comp_id;
    const roundNr = database.chesscz_round_nr;
    const homeTeamId = database.chesscz_home_team_id;
    const awayTeamId = database.chesscz_away_team_id;
    if (!compId || !roundNr || !homeTeamId || !awayTeamId) {
      alert('Databáze nemá uložené ŠSČR metadata.');
      return;
    }
    setChessczBusy(true);
    try {
      const res = await fetchChessczRoundMatches(compId, roundNr);
      const matches = asArray<ChessczMatchResult>(res.data as ChessczMatchResult | ChessczMatchResult[]);
      const match = findMatch(matches, homeTeamId, awayTeamId);
      if (!match) {
        alert('Zápas nebyl v daném kole nalezen.');
        return;
      }
      if (!match.matchGames || match.matchGames.length === 0) {
        alert('ŠSČR ještě neeviduje výsledky tohoto zápasu.');
        return;
      }

      // Load all games of this DB to know which board → which gameId.
      const allGames = await fetchAllFilteredGames(false);
      const byBoard = new Map<number, Game>();
      for (const g of allGames.games) {
        const b = parseInt(g.board ?? '', 10);
        if (Number.isFinite(b)) byBoard.set(b, g);
      }

      const compName = database.name || 'Soutěž';
      const updates: BulkUpdateItem[] = [];
      for (let idx = 0; idx < match.matchGames.length; idx++) {
        const board = idx + 1;
        const game = byBoard.get(board);
        if (!game) continue; // matchGames > existing games — skip; reverse case (extras) left untouched.
        const mapped = boardGameToHeaders(match, match.matchGames[idx], idx, compName);
        const existingHeaders = headersFromGameRow(game);
        const mergedHeaders = { ...existingHeaders, ...mapped };
        updates.push({ gameId: game.id, headers: toApiHeaders(mergedHeaders) });
      }

      if (updates.length === 0) {
        alert('Žádné partie k aktualizaci nebyly nalezeny.');
        return;
      }

      const resp = await api.post<{ updated: number }>(`/databases/${id}/games/bulk-update`, { updates });
      queryClient.invalidateQueries({ queryKey: ['games', id] });
      queryClient.invalidateQueries({ queryKey: ['database', id] });
      alert(`Načteno ${resp.updated} výsledků ze ŠSČR.`);
    } catch (err) {
      alert(`Chyba při načítání výsledků: ${(err as Error).message ?? 'neznámá chyba'}`);
    } finally {
      setChessczBusy(false);
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
  const totalPages = viewMode === 'match' ? 1 : Math.ceil(total / (data?.limit ?? 25));

  const sortIcon = (col: string) => sort === col ? (order === 'asc' ? ' ▲' : ' ▼') : '';

  const matchView = useMemo(() => {
    if (viewMode !== 'match') return null;
    const sortedGames = [...games].sort((a, b) => {
      const ba = parseInt(a.board ?? '', 10);
      const bb = parseInt(b.board ?? '', 10);
      const sa = Number.isFinite(ba) ? ba : 999;
      const sb = Number.isFinite(bb) ? bb : 999;
      return sa - sb;
    });
    const board1 = sortedGames.find((g) => g.board === '1');
    const board2 = sortedGames.find((g) => g.board === '2');
    let homeTeam: string | null = null;
    let awayTeam: string | null = null;
    if (board1) {
      homeTeam = board1.white_team;
      awayTeam = board1.black_team;
    } else if (board2) {
      homeTeam = board2.black_team;
      awayTeam = board2.white_team;
    }
    let home = 0;
    let away = 0;
    let anyResult = false;
    for (const g of sortedGames) {
      const b = parseInt(g.board ?? '', 10);
      if (!Number.isFinite(b)) continue;
      const homeIsWhite = b % 2 === 1;
      if (g.result === '1-0') { if (homeIsWhite) home += 1; else away += 1; anyResult = true; }
      else if (g.result === '0-1') { if (homeIsWhite) away += 1; else home += 1; anyResult = true; }
      else if (g.result === '1/2-1/2') { home += 0.5; away += 0.5; anyResult = true; }
    }
    const date = sortedGames.find((g) => g.date)?.date ?? null;
    return { sortedGames, homeTeam, awayTeam, home, away, anyResult, date };
  }, [viewMode, games]);

  const matchScoreColor = matchView && matchView.anyResult
    ? matchView.home > matchView.away ? '#16a34a'
      : matchView.home < matchView.away ? '#dc2626' : '#888'
    : '#888';

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
          {isChessczImport && (
            <>
              <button
                onClick={handleLoadChessczResults}
                disabled={chessczBusy || bulkBusy || bulkMutation.isPending}
                title="Načte výsledky ze ŠSČR a aktualizuje hlavičky partií podle šachovnic"
                style={smallBtnStyle}
              >
                {chessczBusy ? 'Načítám…' : 'Načíst výsledky'}
              </button>
              <div style={toggleGroup}>
                <button
                  onClick={() => setViewMode('standard')}
                  style={viewMode === 'standard' ? toggleBtnActive : toggleBtn}
                  title="Standardní pohled — všechny sloupce"
                >
                  Standardní
                </button>
                <button
                  onClick={() => setViewMode('match')}
                  style={viewMode === 'match' ? toggleBtnActive : toggleBtn}
                  title="Zápasový pohled — šachovnice, bílý, černý, výsledek"
                >
                  Zápasový
                </button>
              </div>
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

      {viewMode === 'match' && matchView && games.length > 0 && (
        <div style={matchHeaderBox}>
          <span>
            <strong>Kolo {database?.chesscz_round_nr ?? '?'}</strong>
            {matchView.date ? ` · ${formatPgnDate(matchView.date)}` : ''}
            {' · '}
            {matchView.homeTeam || '?'} – {matchView.awayTeam || '?'}
            {' · '}
            <span style={{ color: matchScoreColor, fontWeight: 600 }}>
              {matchView.anyResult ? `${formatHalf(matchView.home)}:${formatHalf(matchView.away)}` : '?:?'}
            </span>
          </span>
        </div>
      )}

      {isLoading ? (
        <p>Načítání...</p>
      ) : games.length === 0 ? (
        <p style={{ color: '#888' }}>
          {debouncedSearch ? 'Žádné partie odpovídající hledání.' : 'Žádné partie. Importujte PGN soubor.'}
        </p>
      ) : viewMode === 'match' && matchView ? (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e0e0e0', textAlign: 'left' }}>
              <th style={{ ...thStyle, cursor: 'default', textAlign: 'center' }}>Šach.</th>
              <th style={{ ...thStyle, cursor: 'default' }}>Domácí</th>
              <th style={{ ...thStyle, cursor: 'default' }}>Hosté</th>
              <th style={{ ...thStyle, cursor: 'default', textAlign: 'center' }}>Výsledek</th>
              <th style={{ ...thStyle, cursor: 'default', textAlign: 'right' }}>Tahy</th>
              <th style={{ ...thStyle, cursor: 'default' }}>ECO</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {matchView.sortedGames.map((game) => {
              const board = parseInt(game.board ?? '', 10);
              const homeIsWhite = Number.isFinite(board) && board % 2 === 1;

              const homePlayer = homeIsWhite ? game.white : game.black;
              const homeElo = homeIsWhite ? game.white_elo : game.black_elo;
              const homeTeam = homeIsWhite ? game.white_team : game.black_team;
              const awayPlayer = homeIsWhite ? game.black : game.white;
              const awayElo = homeIsWhite ? game.black_elo : game.white_elo;
              const awayTeam = homeIsWhite ? game.black_team : game.white_team;

              const boardResult = formatBoardResultForHome(game.result, homeIsWhite);

              return (
                <tr
                  key={game.id}
                  style={{
                    borderBottom: '1px solid #eee',
                    cursor: 'pointer',
                    background: refusedGameIds.has(game.id) ? '#fee2e2' : undefined,
                  }}
                  onClick={() => navigate(`/db/${id}/game/${game.id}`, {
                    state: { filter: debouncedSearch, sort, order, dbName, dbId: id },
                  })}
                >
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 500 }}>{game.board || '?'}</td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span>{homePlayer || '?'}{homeElo ? ` (${homeElo})` : ''}</span>
                      <ColorCube white={homeIsWhite} />
                    </div>
                    {homeTeam && <div style={teamSubtitle}>{homeTeam}</div>}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span>{awayPlayer || '?'}{awayElo ? ` (${awayElo})` : ''}</span>
                      <ColorCube white={!homeIsWhite} />
                    </div>
                    {awayTeam && <div style={teamSubtitle}>{awayTeam}</div>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center', color: boardResult.color, fontWeight: 500 }}>
                    {boardResult.text}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: game.ply_count ? '#333' : '#bbb' }}>
                    {game.ply_count ? Math.ceil(game.ply_count / 2) : '—'}
                  </td>
                  <td style={{ ...tdStyle, color: game.eco ? '#333' : '#bbb' }}>
                    {game.eco ? (
                      <span>
                        <span style={{ fontFamily: 'monospace', color: '#555' }}>{game.eco}</span>
                        {ecoName(game.eco) && (
                          <span style={{ marginLeft: '0.4rem', color: '#666' }}>{ecoName(game.eco)}</span>
                        )}
                      </span>
                    ) : '—'}
                  </td>
                  <td style={tdStyle}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Smazat tuto partii?')) deleteMutation.mutate(game.id);
                      }}
                      style={{ ...smallBtnStyle, color: '#dc2626' }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e0e0e0', textAlign: 'left' }}>
                <th style={thStyle} onClick={() => handleSort('white')} role="button">Bílý{sortIcon('white')}</th>
                <th style={thStyle} onClick={() => handleSort('black')} role="button">Černý{sortIcon('black')}</th>
                <th style={{ ...thStyle, textAlign: 'center' }} onClick={() => handleSort('result')} role="button">Výsledek{sortIcon('result')}</th>
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
                  <td style={{ ...tdStyle, textAlign: 'center', color: getResultColor(game.result), fontWeight: 500 }}>
                    {game.result || '*'}
                  </td>
                  <td style={tdStyle}>{game.date ? formatPgnDate(game.date) : '—'}</td>
                  <td style={tdStyle}>{game.event || '—'}</td>
                  <td style={tdStyle}>{game.round || '—'}</td>
                  <td style={tdStyle}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
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

const toggleGroup: React.CSSProperties = {
  display: 'inline-flex',
  border: '1px solid #ddd',
  borderRadius: 4,
  overflow: 'hidden',
};

const toggleBtn: React.CSSProperties = {
  padding: '0.25rem 0.6rem',
  fontSize: '0.8rem',
  cursor: 'pointer',
  border: 'none',
  background: '#fff',
  color: '#333',
};

const toggleBtnActive: React.CSSProperties = {
  ...toggleBtn,
  background: '#333',
  color: '#fff',
};

const matchHeaderBox: React.CSSProperties = {
  padding: '0.6rem 0.9rem',
  marginBottom: '1rem',
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  fontSize: '0.95rem',
};

const teamSubtitle: React.CSSProperties = {
  fontSize: '0.78rem',
  color: '#666',
  marginTop: 2,
};

function formatHalf(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1).replace(/\.0$/, '');
}

function formatBoardResultForHome(result: string | null | undefined, homeIsWhite: boolean): { text: string; color: string } {
  if (!result || result === '*') return { text: '*', color: '#888' };
  if (result === '1/2-1/2') return { text: '½:½', color: '#888' };
  const whiteWon = result === '1-0';
  const blackWon = result === '0-1';
  if (!whiteWon && !blackWon) return { text: result, color: '#888' };
  const homeWon = homeIsWhite ? whiteWon : blackWon;
  return homeWon
    ? { text: '1:0', color: '#16a34a' }
    : { text: '0:1', color: '#dc2626' };
}

function ColorCube({ white }: { white: boolean }) {
  return (
    <span
      aria-label={white ? 'bílé' : 'černé'}
      title={white ? 'bílými' : 'černými'}
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        background: white ? '#fff' : '#000',
        border: '1px solid #333',
        borderRadius: 2,
        flexShrink: 0,
      }}
    />
  );
}
