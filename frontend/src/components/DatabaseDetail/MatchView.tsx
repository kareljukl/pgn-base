import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatPgnDate } from '../../lib/dateFormat';
import { ecoName } from '../../lib/ecoNames';
import { headersFromGameRow, toApiHeaders } from '../../lib/editorPgn';
import { asArray, boardGameToHeaders, findMatch, type ChessczMatchResult } from '../../lib/chesscz';
import { fetchChessczRoundMatches } from '../../hooks/useChessczCompetition';

export type MatchViewDatabaseInfo = {
  id: string;
  name: string;
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

type Props = {
  database: MatchViewDatabaseInfo;
  showHeader?: boolean;       // when false, parent renders its own (e.g. SeasonDetail tabs)
  onDeleteGame?: (gameId: string) => void;
};

export function MatchView({ database, showHeader = true, onDeleteGame }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const databaseId = database.id;
  const [chessczBusy, setChessczBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['games', databaseId, { mode: 'match' }],
    queryFn: () => {
      const params = new URLSearchParams({
        page: '1',
        sort: 'date',
        order: 'asc',
        limit: '1000',
      });
      return api.get<GamesResponse>(`/databases/${databaseId}/games?${params}`);
    },
  });
  const games = data?.games ?? [];

  const matchView = useMemo(() => {
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
  }, [games]);

  const matchScoreColor = matchView.anyResult
    ? matchView.home > matchView.away ? '#16a34a'
      : matchView.home < matchView.away ? '#dc2626' : '#888'
    : '#888';

  const bulkMutation = useMutation({
    mutationFn: (updates: BulkUpdateItem[]) =>
      api.post<{ updated: number }>(`/databases/${databaseId}/games/bulk-update`, { updates }),
    onSuccess: (resp) => {
      queryClient.invalidateQueries({ queryKey: ['games', databaseId] });
      queryClient.invalidateQueries({ queryKey: ['database', databaseId] });
      alert(`Načteno ${resp.updated} výsledků ze ŠSČR.`);
    },
    onError: (err: Error) => {
      alert(`Chyba: ${err.message ?? 'neznámá chyba'}`);
    },
  });

  const handleLoadChessczResults = async () => {
    if (chessczBusy) return;
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

      const byBoard = new Map<number, Game>();
      for (const g of games) {
        const b = parseInt(g.board ?? '', 10);
        if (Number.isFinite(b)) byBoard.set(b, g);
      }

      const compName = database.name || 'Soutěž';
      const updates: BulkUpdateItem[] = [];
      for (let idx = 0; idx < match.matchGames.length; idx++) {
        const board = idx + 1;
        const game = byBoard.get(board);
        if (!game) continue;
        const mapped = boardGameToHeaders(match, match.matchGames[idx], idx, compName);
        const existingHeaders = headersFromGameRow(game);
        const mergedHeaders = { ...existingHeaders, ...mapped };
        updates.push({ gameId: game.id, headers: toApiHeaders(mergedHeaders) });
      }
      if (updates.length === 0) {
        alert('Žádné partie k aktualizaci nebyly nalezeny.');
        return;
      }
      bulkMutation.mutate(updates);
    } catch (err) {
      alert(`Chyba při načítání výsledků: ${(err as Error).message ?? 'neznámá chyba'}`);
    } finally {
      setChessczBusy(false);
    }
  };

  if (isLoading) return <p>Načítání…</p>;
  if (games.length === 0) return <p style={{ color: '#888' }}>Žádné partie v tomto kole.</p>;

  return (
    <div>
      {showHeader && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={matchHeaderBox}>
            <strong>Kolo {database.chesscz_round_nr ?? '?'}</strong>
            {matchView.date ? ` · ${formatPgnDate(matchView.date)}` : ''}
            {' · '}
            {matchView.homeTeam || '?'} – {matchView.awayTeam || '?'}
            {' · '}
            <span style={{ color: matchScoreColor, fontWeight: 600 }}>
              {matchView.anyResult ? `${formatHalf(matchView.home)}:${formatHalf(matchView.away)}` : '?:?'}
            </span>
          </div>
          <button
            onClick={handleLoadChessczResults}
            disabled={chessczBusy || bulkMutation.isPending}
            title="Načte výsledky ze ŠSČR a aktualizuje hlavičky partií podle šachovnic"
            style={smallBtnStyle}
          >
            {chessczBusy || bulkMutation.isPending ? 'Načítám…' : 'Načíst výsledky'}
          </button>
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e0e0e0', textAlign: 'left' }}>
            <th style={{ ...thStyle, textAlign: 'center' }}>Šach.</th>
            <th style={thStyle}>Domácí</th>
            <th style={thStyle}>Hosté</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>Výsledek</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Tahy</th>
            <th style={thStyle}>ECO</th>
            {onDeleteGame && <th style={thStyle}></th>}
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
                style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}
                onClick={() => navigate(`/db/${databaseId}/game/${game.id}`, {
                  state: { dbName: database.name, dbId: databaseId },
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
                {onDeleteGame && (
                  <td style={tdStyle}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Smazat tuto partii?')) onDeleteGame(game.id);
                      }}
                      style={{ ...smallBtnStyle, color: '#dc2626' }}
                    >
                      ×
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
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
  userSelect: 'none',
};

const tdStyle: React.CSSProperties = { padding: '0.6rem 0.75rem' };

const matchHeaderBox: React.CSSProperties = {
  padding: '0.6rem 0.9rem',
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  fontSize: '0.95rem',
  flex: 1,
};

const teamSubtitle: React.CSSProperties = {
  fontSize: '0.78rem',
  color: '#666',
  marginTop: 2,
};
