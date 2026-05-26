import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { MatchView, type MatchViewDatabaseInfo } from '../components/DatabaseDetail/MatchView';
import {
  asArray,
  formatChessczDate,
  type ChessczProxyResponse,
  type ChessczRoundSchedule,
} from '../lib/chesscz';
import { formatPgnDate } from '../lib/dateFormat';

type Season = {
  id: string;
  name: string;
  description: string | null;
  chesscz_comp_id: number;
  chesscz_team_id: number;
  created_at: number;
  updated_at: number;
};

type ChildDatabase = MatchViewDatabaseInfo & {
  description: string | null;
  game_count: number;
};

type SeasonDetailResponse = {
  season: Season;
  databases: ChildDatabase[];
};

// Returns YYYY-MM-DD for today.
function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// Returns YYYY-MM-DD for today minus N days.
function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// chess.cz roundDate "DD.MM.YYYY" → "YYYY-MM-DD" for string compare. Empty if unparseable.
function czDateToIso(s: string | null | undefined): string {
  if (!s) return '';
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function SeasonDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedDbId, setSelectedDbId] = useState<string | null>(null);
  const [autoSelectDone, setAutoSelectDone] = useState(false);

  const { data: seasonData, isLoading: seasonLoading, error: seasonError } = useQuery({
    queryKey: ['season', id],
    queryFn: () => api.get<SeasonDetailResponse>(`/seasons/${id}`),
    enabled: !!id,
  });

  const season = seasonData?.season;
  const databases = useMemo(() => seasonData?.databases ?? [], [seasonData]);

  const compId = season?.chesscz_comp_id ?? null;
  const scheduleQuery = useQuery({
    queryKey: ['chesscz-comp-schedule', compId],
    queryFn: () =>
      api.get<ChessczProxyResponse<ChessczRoundSchedule | ChessczRoundSchedule[]>>(
        `/chesscz/competitions/${compId}/schedule`
      ),
    enabled: compId !== null && compId > 0,
    staleTime: 24 * 60 * 60_000,
    retry: false,
  });
  const scheduleData = scheduleQuery.data;
  const scheduleSettled = scheduleQuery.isFetched || scheduleQuery.isError || !compId;
  const rounds = useMemo<ChessczRoundSchedule[]>(
    () => asArray(scheduleData?.data).slice().sort((a, b) => a.roundNr - b.roundNr),
    [scheduleData?.data]
  );

  // Join: child DB → round metadata (date, opponent).
  const rows = useMemo(() => {
    const teamId = season?.chesscz_team_id ?? null;
    return databases.map((db) => {
      const round = rounds.find((r) => r.roundNr === db.chesscz_round_nr) ?? null;
      // Opponent = the team that isn't ours.
      let opponentName: string | null = null;
      if (db.chesscz_home_team_id === teamId) {
        // We are home → opponent is away. Pull from round.roundMatches if present.
        const m = round?.roundMatches.find((rm) => rm.awayTeamId === db.chesscz_away_team_id);
        opponentName = m?.awayTeamName ?? null;
      } else if (db.chesscz_away_team_id === teamId) {
        const m = round?.roundMatches.find((rm) => rm.homeTeamId === db.chesscz_home_team_id);
        opponentName = m?.homeTeamName ?? null;
      }
      // Fallback: derive from description ("Home – Away (kolo X, DATE)").
      if (!opponentName && db.description) {
        const m = db.description.match(/^(.+?)\s+–\s+(.+?)\s+\(/);
        if (m) {
          const home = m[1];
          const away = m[2];
          if (db.chesscz_home_team_id === teamId) opponentName = away;
          else if (db.chesscz_away_team_id === teamId) opponentName = home;
        }
      }
      const roundDateRaw = round?.roundDate ?? null;
      const dateIso = czDateToIso(roundDateRaw);
      return {
        db,
        roundNr: db.chesscz_round_nr ?? 0,
        roundDateRaw,
        dateIso,
        opponentName,
        isHome: db.chesscz_home_team_id === teamId,
      };
    });
  }, [databases, rounds, season?.chesscz_team_id]);

  // Default round selection — runs once when both seasons + schedule are ready.
  useEffect(() => {
    if (autoSelectDone || databases.length === 0) return;
    if (!scheduleSettled) return;
    const cutoff = isoDaysAgo(1);
    // Sort by roundDate ASC, then pick first with dateIso >= cutoff.
    const sorted = [...rows].sort((a, b) => {
      if (a.dateIso && b.dateIso) return a.dateIso.localeCompare(b.dateIso);
      if (a.dateIso) return -1;
      if (b.dateIso) return 1;
      return a.roundNr - b.roundNr;
    });
    const upcoming = sorted.find((r) => r.dateIso && r.dateIso >= cutoff);
    if (upcoming) {
      setSelectedDbId(upcoming.db.id);
    } else {
      // Fallback: last past round (largest dateIso < today), or last round in list.
      const today = todayIso();
      const past = [...sorted].reverse().find((r) => r.dateIso && r.dateIso < today);
      setSelectedDbId(past ? past.db.id : sorted[0]?.db.id ?? null);
    }
    setAutoSelectDone(true);
  }, [autoSelectDone, databases, rows, scheduleSettled]);

  const selectedDb = useMemo(
    () => databases.find((d) => d.id === selectedDbId) ?? null,
    [databases, selectedDbId]
  );
  const selectedRow = useMemo(
    () => rows.find((r) => r.db.id === selectedDbId) ?? null,
    [rows, selectedDbId]
  );

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/seasons/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seasons'] });
      queryClient.invalidateQueries({ queryKey: ['databases'] });
      navigate('/');
    },
    onError: (err: Error) => alert(`Chyba při mazání: ${err.message ?? 'neznámá chyba'}`),
  });

  if (seasonLoading) return <p>Načítání…</p>;
  if (seasonError) return <p style={{ color: '#dc2626' }}>Sezónu se nepodařilo načíst.</p>;
  if (!season) return <p>Sezóna nenalezena.</p>;

  return (
    <div>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.875rem' }}>
        <Link to="/" style={{ color: '#666' }}>← Moje databáze</Link>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>{season.name}</h1>
          {season.description && <div style={{ color: '#666', fontSize: '0.9rem', marginTop: 4 }}>{season.description}</div>}
        </div>
        <button
          onClick={() => {
            if (confirm(`Smazat celou sezónu "${season.name}" včetně všech ${databases.length} kol a partií?`)) {
              deleteMutation.mutate();
            }
          }}
          disabled={deleteMutation.isPending}
          style={{ ...smallBtnStyle, color: '#dc2626' }}
        >
          Smazat sezónu
        </button>
      </div>

      {databases.length === 0 ? (
        <p style={{ color: '#888' }}>Sezóna nemá žádná kola.</p>
      ) : (
        <>
          <div style={tabStrip}>
            {rows
              .slice()
              .sort((a, b) => a.roundNr - b.roundNr)
              .map((r) => {
                const isActive = r.db.id === selectedDbId;
                return (
                  <button
                    key={r.db.id}
                    onClick={() => setSelectedDbId(r.db.id)}
                    style={isActive ? tabBtnActive : tabBtn}
                    title={r.db.description ?? ''}
                  >
                    <div style={{ fontWeight: 600 }}>Kolo {r.roundNr}</div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>
                      {r.roundDateRaw ? formatPgnDate(formatChessczDate(r.roundDateRaw)) : '—'}
                    </div>
                    {r.opponentName && (
                      <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>
                        {r.isHome ? 'vs.' : 'u '} {r.opponentName}
                      </div>
                    )}
                  </button>
                );
              })}
          </div>

          {selectedDb && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.875rem', color: '#666' }}>
                  {selectedRow?.roundDateRaw ? `Termín: ${formatPgnDate(formatChessczDate(selectedRow.roundDateRaw))}` : null}
                </div>
                <Link to={`/db/${selectedDb.id}`} style={{ fontSize: '0.85rem', color: '#2563eb' }}>
                  Otevřít kolo v plném detailu →
                </Link>
              </div>
              <MatchView database={selectedDb} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

const tabStrip: React.CSSProperties = {
  display: 'flex',
  gap: '0.4rem',
  overflowX: 'auto',
  paddingBottom: '0.5rem',
  borderBottom: '1px solid #e5e7eb',
};

const tabBtn: React.CSSProperties = {
  flexShrink: 0,
  minWidth: 110,
  padding: '0.5rem 0.75rem',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  background: '#fff',
  color: '#333',
  cursor: 'pointer',
  textAlign: 'left',
  fontSize: '0.85rem',
  lineHeight: 1.3,
};

const tabBtnActive: React.CSSProperties = {
  ...tabBtn,
  background: '#1f2937',
  color: '#fff',
  borderColor: '#1f2937',
};

const smallBtnStyle: React.CSSProperties = {
  padding: '0.25rem 0.5rem',
  fontSize: '0.8rem',
  cursor: 'pointer',
  border: '1px solid #ddd',
  borderRadius: 4,
  background: '#fff',
};
