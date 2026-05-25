import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import {
  asArray,
  boardGameToHeaders,
  buildPlaceholderGames,
  DEFAULT_BOARD_COUNT,
  findMatch,
  formatMatchScore,
  type ChessczCompetitionRegion,
  type ChessczCompetitionSummary,
  type ChessczMatchResult,
  type ChessczRoundSchedule,
  type ChessczTableRow,
} from '../../lib/chesscz';
import {
  useChessczCompetitions,
  useChessczCompSchedule,
  useChessczDetails,
  useChessczTable,
  useChessczTeamSchedule,
  fetchChessczRoundMatches,
} from '../../hooks/useChessczCompetition';

type Props = {
  onClose: () => void;
};

type MatchPick = {
  roundNr: number;
  roundDate: string;
  homeTeamId: number;
  homeTeamName: string;
  homeTeamScore: number | null;
  awayTeamId: number;
  awayTeamName: string;
  awayTeamScore: number | null;
  hasScore: boolean;
};

type RoundPick = {
  roundNr: number;
  roundDate: string;
};

export function ChessczImportDialog({ onClose }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [compIdInput, setCompIdInput] = useState('');
  const [activeCompId, setActiveCompId] = useState<number | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [dbName, setDbName] = useState('');
  const [dbNameTouched, setDbNameTouched] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [pickMode, setPickMode] = useState<'team' | 'round'>('team');
  const [selectedRoundNr, setSelectedRoundNr] = useState<number | null>(null);
  const [selectedMatchKey, setSelectedMatchKey] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const catalogQuery = useChessczCompetitions();
  const detailsQuery = useChessczDetails(activeCompId);
  const tableQuery = useChessczTable(activeCompId);
  const teamScheduleQuery = useChessczTeamSchedule(
    pickMode === 'team' ? activeCompId : null,
    pickMode === 'team' ? selectedTeamId : null
  );
  const compScheduleQuery = useChessczCompSchedule(pickMode === 'round' ? activeCompId : null);

  const compDetail = detailsQuery.data?.data ?? null;
  const catalog = catalogQuery.data?.data ?? null;

  // ŠSČR (id 98) pinneme na začátek, ostatní v document order.
  const regions: Array<[string, ChessczCompetitionRegion]> = useMemo(() => {
    if (!catalog) return [];
    const entries = Object.entries(catalog);
    const sscr = entries.find(([id]) => id === '98');
    const rest = entries.filter(([id]) => id !== '98');
    return sscr ? [sscr, ...rest] : entries;
  }, [catalog]);

  const regionComps = useMemo<ChessczCompetitionSummary[]>(() => {
    if (!selectedRegionId || !catalog) return [];
    const list = catalog[selectedRegionId]?.competitions ?? [];
    return [...list].sort((a, b) =>
      a.compLevel - b.compLevel || a.compName.localeCompare(b.compName, 'cs')
    );
  }, [selectedRegionId, catalog]);
  const tableRows = useMemo<ChessczTableRow[]>(
    () => asArray(tableQuery.data?.data).slice().sort((a, b) => parseInt(a.teamRank) - parseInt(b.teamRank)),
    [tableQuery.data]
  );
  const teamSchedule = useMemo(
    () => asArray(teamScheduleQuery.data?.data),
    [teamScheduleQuery.data]
  );
  const compSchedule = useMemo<ChessczRoundSchedule[]>(
    () => asArray(compScheduleQuery.data?.data).slice().sort((a, b) => a.roundNr - b.roundNr),
    [compScheduleQuery.data]
  );
  const selectedRound = useMemo(
    () => compSchedule.find((r) => r.roundNr === selectedRoundNr) ?? null,
    [compSchedule, selectedRoundNr]
  );

  // Auto-fill DB name from compDetail when loaded.
  useEffect(() => {
    if (compDetail?.compName && !dbNameTouched) {
      setDbName(compDetail.compName);
    }
  }, [compDetail, dbNameTouched]);

  // Reset downstream selections when comp / team / mode changes.
  useEffect(() => {
    setSelectedTeamId(null);
    setSelectedRoundNr(null);
    setSelectedMatchKey(null);
  }, [activeCompId, pickMode]);
  useEffect(() => {
    setSelectedMatchKey(null);
  }, [selectedTeamId, selectedRoundNr]);

  const matchOptions: MatchPick[] = useMemo(() => {
    if (pickMode === 'team') {
      if (selectedTeamId === null) return [];
      return teamSchedule.map((e) => ({
        roundNr: e.roundNr,
        roundDate: e.roundDate,
        homeTeamId: e.homeTeamId,
        homeTeamName: e.homeTeamName,
        homeTeamScore: e.homeTeamScore,
        awayTeamId: e.awayTeamId,
        awayTeamName: e.awayTeamName,
        awayTeamScore: e.awayTeamScore,
        hasScore: (e.homeTeamScore ?? 0) + (e.awayTeamScore ?? 0) > 0,
      }));
    }
    if (selectedRound === null) return [];
    return selectedRound.roundMatches.map((m) => ({
      roundNr: selectedRound.roundNr,
      roundDate: selectedRound.roundDate,
      homeTeamId: m.homeTeamId,
      homeTeamName: m.homeTeamName,
      homeTeamScore: m.homeTeamScore,
      awayTeamId: m.awayTeamId,
      awayTeamName: m.awayTeamName,
      awayTeamScore: m.awayTeamScore,
      hasScore: (m.homeTeamScore ?? 0) + (m.awayTeamScore ?? 0) > 0,
    }));
  }, [pickMode, selectedTeamId, teamSchedule, selectedRound]);

  const selectedMatch: MatchPick | null = useMemo(() => {
    if (!selectedMatchKey) return null;
    return matchOptions.find((m) => keyOf(m) === selectedMatchKey) ?? null;
  }, [matchOptions, selectedMatchKey]);


  const createMutation = useMutation({
    mutationFn: async () => {
      if (!compDetail || !selectedMatch) throw new Error('Chybí výběr');
      const trimmedName = dbName.trim() || compDetail.compName;
      const dbBody = {
        name: trimmedName,
        description: `${selectedMatch.homeTeamName} – ${selectedMatch.awayTeamName} (kolo ${selectedMatch.roundNr}, ${selectedMatch.roundDate})`,
        import_source: 'chesscz' as const,
        chesscz_comp_id: compDetail.compId,
        chesscz_round_nr: selectedMatch.roundNr,
        chesscz_home_team_id: selectedMatch.homeTeamId,
        chesscz_away_team_id: selectedMatch.awayTeamId,
      };
      const dbRes = await api.post<{ database: { id: string } }>('/databases', dbBody);
      const dbId = dbRes.database.id;

      // Try to fetch match results up-front so we can size game count correctly.
      let matchResult: ChessczMatchResult | null = null;
      if (selectedMatch.hasScore) {
        try {
          const res = await fetchChessczRoundMatches(compDetail.compId, selectedMatch.roundNr);
          const matches = asArray(res.data);
          matchResult = findMatch(matches, selectedMatch.homeTeamId, selectedMatch.awayTeamId);
        } catch {
          // If results fetch fails, fall through to placeholder games.
          matchResult = null;
        }
      }

      const boardCount = matchResult?.matchGames.length ?? DEFAULT_BOARD_COUNT;
      const placeholders = buildPlaceholderGames({
        compName: compDetail.compName,
        roundNr: selectedMatch.roundNr,
        roundDate: selectedMatch.roundDate,
        homeTeamName: selectedMatch.homeTeamName,
        awayTeamName: selectedMatch.awayTeamName,
        boardCount,
      });

      // If we already have match results, merge them into placeholders before insert.
      const gamesPayload = placeholders.map((g, idx) => {
        if (!matchResult || idx >= matchResult.matchGames.length) return g;
        const mapped = boardGameToHeaders(matchResult, matchResult.matchGames[idx], idx, compDetail.compName);
        return { headers: { ...g.headers, ...mapped }, movesPgn: '' };
      });

      await api.post(`/databases/${dbId}/games`, { games: gamesPayload });

      return dbId;
    },
    onSuccess: (dbId) => {
      queryClient.invalidateQueries({ queryKey: ['databases'] });
      navigate(`/db/${dbId}`);
    },
    onError: (err) => {
      setSubmitError(err instanceof Error ? err.message : 'Chyba při vytváření databáze');
    },
  });

  const onLoad = () => {
    const n = parseInt(compIdInput.trim(), 10);
    if (!Number.isFinite(n) || n <= 0) return;
    setActiveCompId(n);
    setDbNameTouched(false);
  };

  const detailsLoading = activeCompId !== null && detailsQuery.isLoading;
  const detailsError = activeCompId !== null && detailsQuery.isError;
  const tableLoading = activeCompId !== null && tableQuery.isLoading;
  const tableError = activeCompId !== null && tableQuery.isError;
  const scheduleLoading = pickMode === 'round' && activeCompId !== null && compScheduleQuery.isLoading;
  const scheduleError = pickMode === 'round' && activeCompId !== null && compScheduleQuery.isError;

  return (
    <div style={backdrop} onClick={createMutation.isPending ? undefined : onClose}>
      <div style={box} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>Import ze ŠSČR</h3>
          <button onClick={onClose} disabled={createMutation.isPending} style={closeBtn}>×</button>
        </div>

        {/* Step 1: compId */}
        <Section title="1. Soutěž">
          {/* Cascade: kraj/liga → soutěž */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={selectedRegionId ?? ''}
              onChange={(e) => {
                const v = e.target.value || null;
                setSelectedRegionId(v);
                setActiveCompId(null);
                setDbNameTouched(false);
              }}
              disabled={catalogQuery.isLoading || !!catalogQuery.error}
              style={{ ...selectStyle, width: 'auto', minWidth: 220 }}
            >
              <option value="">
                {catalogQuery.isLoading ? 'Načítám…' : 'Kraj/liga…'}
              </option>
              {regions.map(([id, r]) => (
                <option key={id} value={id}>{r.regionName}</option>
              ))}
            </select>
            <select
              value={activeCompId !== null && regionComps.some((c) => c.compId === activeCompId) ? String(activeCompId) : ''}
              onChange={(e) => {
                const id = e.target.value ? parseInt(e.target.value, 10) : null;
                if (id !== null && Number.isFinite(id) && id > 0) {
                  setActiveCompId(id);
                  setDbNameTouched(false);
                }
              }}
              disabled={!selectedRegionId || catalogQuery.isLoading}
              style={{ ...selectStyle, width: 'auto', minWidth: 280, flex: 1 }}
            >
              <option value="">
                {selectedRegionId ? 'Soutěž…' : 'Nejprve vyber kraj/ligu'}
              </option>
              {regionComps.map((c) => (
                <option key={c.compId} value={c.compId}>
                  {c.compName}{c.compYoungOrAdult === 'Y' ? ' (mládež)' : ''}
                </option>
              ))}
            </select>
          </div>
          {catalogQuery.error && (
            <p style={mutedStyle}>Seznam soutěží se nepodařilo načíst — zadejte ID ručně níže.</p>
          )}

          <div style={{ fontSize: '0.75rem', color: '#999', margin: '0.5rem 0', textAlign: 'center' }}>— nebo —</div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              placeholder="ID soutěže (např. 3318)"
              value={compIdInput}
              onChange={(e) => setCompIdInput(e.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') onLoad(); }}
              style={{ ...inputStyle, width: 180 }}
            />
            <button onClick={onLoad} disabled={!compIdInput || detailsLoading} style={btnStyle}>
              {detailsLoading ? 'Načítám…' : 'Načíst'}
            </button>
          </div>
          {detailsError && <p style={errStyle}>Soutěž nenalezena nebo ŠSČR nedostupné.</p>}
          {compDetail && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
              <div><strong>Soutěž:</strong> {compDetail.compName}</div>
              {compDetail.regionName && <div><strong>Region:</strong> {compDetail.regionName}</div>}
              {compDetail.compManagerName && (
                <div><strong>Vedoucí:</strong> {compDetail.compManagerName}{compDetail.compManagerEmail ? ` · ${compDetail.compManagerEmail}` : ''}</div>
              )}
            </div>
          )}
        </Section>

        {/* Step 2: tým / kolo */}
        {compDetail && (
          <Section title="2. Tým nebo kolo">
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
              <label><input type="radio" checked={pickMode === 'team'} onChange={() => setPickMode('team')} /> Vybrat podle týmu</label>
              <label><input type="radio" checked={pickMode === 'round'} onChange={() => setPickMode('round')} /> Vybrat podle kola</label>
            </div>

            {pickMode === 'team' ? (
              <>
                {tableLoading && <p style={mutedStyle}>Načítám tabulku…</p>}
                {tableError && <p style={errStyle}>Tabulka nedostupná.</p>}
                {tableRows.length > 0 && (
                  <select
                    value={selectedTeamId ?? ''}
                    onChange={(e) => setSelectedTeamId(e.target.value ? parseInt(e.target.value, 10) : null)}
                    style={selectStyle}
                  >
                    <option value="">— vyberte tým —</option>
                    {tableRows.map((r) => (
                      <option key={r.teamId} value={r.teamId}>
                        {r.teamRank}. {r.teamName}{r.points != null ? ` (${r.points} b.)` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </>
            ) : (
              <>
                {scheduleLoading && <p style={mutedStyle}>Načítám rozpis…</p>}
                {scheduleError && <p style={errStyle}>Rozpis nedostupný.</p>}
                {compSchedule.length > 0 && (
                  <select
                    value={selectedRoundNr ?? ''}
                    onChange={(e) => setSelectedRoundNr(e.target.value ? parseInt(e.target.value, 10) : null)}
                    style={selectStyle}
                  >
                    <option value="">— vyberte kolo —</option>
                    {compSchedule.map((r) => (
                      <option key={r.roundNr} value={r.roundNr}>
                        {`Kolo ${r.roundNr} · ${r.roundDate}`}
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}
          </Section>
        )}

        {/* Step 3: výběr zápasu */}
        {compDetail && ((pickMode === 'team' && selectedTeamId) || (pickMode === 'round' && selectedRoundNr)) && (
          <Section title="3. Zápas">
            {teamScheduleQuery.isLoading && <p style={mutedStyle}>Načítám zápasy…</p>}
            {teamScheduleQuery.isError && <p style={errStyle}>Zápasy nedostupné.</p>}
            {matchOptions.length > 0 && (
              <div style={matchTableWrap}>
                <table style={matchTable}>
                  <tbody>
                    {matchOptions.map((m) => {
                      const selected = keyOf(m) === selectedMatchKey;
                      return (
                        <tr
                          key={keyOf(m)}
                          onClick={() => setSelectedMatchKey(keyOf(m))}
                          style={{ ...matchRow, ...(selected ? matchRowSelected : {}) }}
                        >
                          <td style={cellRound}>{m.roundNr}.</td>
                          <td style={cellDate}>{m.roundDate}</td>
                          <td style={cellHome}>{m.homeTeamName}</td>
                          <td style={{ ...cellScore, color: m.hasScore ? '#16a34a' : '#888' }}>
                            {formatMatchScore(m.homeTeamScore, m.awayTeamScore)}
                          </td>
                          <td style={cellAway}>{m.awayTeamName}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        )}

        {/* Step 4: confirm */}
        {selectedMatch && compDetail && (
          <Section title="4. Shrnutí">
            <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
              <div><strong>Soutěž:</strong> {compDetail.compName}</div>
              <div><strong>Kolo:</strong> {selectedMatch.roundNr} · {selectedMatch.roundDate}</div>
              <div>
                <strong>Zápas:</strong> {selectedMatch.homeTeamName} – {selectedMatch.awayTeamName}
                {' '}
                <span style={{ color: selectedMatch.hasScore ? '#16a34a' : '#888' }}>
                  {formatMatchScore(selectedMatch.homeTeamScore, selectedMatch.awayTeamScore)}
                </span>
              </div>
              <div><strong>Partie:</strong> {selectedMatch.hasScore ? 'počet dle ŠSČR' : `${DEFAULT_BOARD_COUNT} prázdných partií`}</div>
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#444', marginBottom: '0.25rem' }}>
                Název databáze
              </label>
              <input
                value={dbName}
                onChange={(e) => { setDbName(e.target.value); setDbNameTouched(true); }}
                style={inputStyle}
                maxLength={100}
              />
            </div>
            {submitError && <p style={errStyle}>{submitError}</p>}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
              <button onClick={onClose} disabled={createMutation.isPending} style={secondaryBtn}>Zrušit</button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !dbName.trim()}
                style={btnStyle}
              >
                {createMutation.isPending ? 'Vytvářím…' : 'Vytvořit databázi'}
              </button>
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

function keyOf(m: MatchPick): string {
  return `${m.roundNr}-${m.homeTeamId}-${m.awayTeamId}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #eee' }}>
      <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#666', marginBottom: '0.5rem' }}>{title}</div>
      {children}
    </div>
  );
}

const backdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 100,
};
const box: React.CSSProperties = {
  background: '#fff', borderRadius: 8, padding: '1.5rem',
  width: 'fit-content', minWidth: 'min(560px, 96vw)', maxWidth: '96vw',
  maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
};
const btnStyle: React.CSSProperties = {
  padding: '0.5rem 1rem', fontSize: '0.875rem', cursor: 'pointer',
  border: '1px solid #333', borderRadius: 4, background: '#333', color: '#fff',
};
const secondaryBtn: React.CSSProperties = {
  padding: '0.5rem 1rem', fontSize: '0.875rem', cursor: 'pointer',
  border: '1px solid #ccc', borderRadius: 4, background: '#fff', color: '#333',
};
const closeBtn: React.CSSProperties = {
  background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer',
  color: '#888', padding: '0 0.25rem',
};
const inputStyle: React.CSSProperties = {
  padding: '0.4rem 0.6rem', fontSize: '0.875rem', border: '1px solid #ccc',
  borderRadius: 4, width: '100%',
};
const selectStyle: React.CSSProperties = { ...inputStyle, width: '100%' };
const errStyle: React.CSSProperties = { color: '#dc2626', fontSize: '0.85rem', marginTop: '0.5rem' };
const mutedStyle: React.CSSProperties = { color: '#888', fontSize: '0.85rem' };

const matchTableWrap: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: 4,
  maxHeight: 320,
  overflowY: 'auto',
};
const matchTable: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.85rem',
};
const matchRow: React.CSSProperties = {
  cursor: 'pointer',
  borderBottom: '1px solid #f0f0f0',
};
const matchRowSelected: React.CSSProperties = {
  background: '#dbeafe',
};
const cellBase: React.CSSProperties = {
  padding: '0.35rem 0.5rem',
  whiteSpace: 'nowrap',
  verticalAlign: 'middle',
};
const cellRound: React.CSSProperties = { ...cellBase, color: '#666', width: 32, textAlign: 'right' };
const cellDate: React.CSSProperties = { ...cellBase, color: '#666', width: 96 };
const cellHome: React.CSSProperties = { ...cellBase, textAlign: 'right' };
const cellAway: React.CSSProperties = { ...cellBase, textAlign: 'left' };
const cellScore: React.CSSProperties = {
  ...cellBase,
  textAlign: 'center',
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 500,
  width: 72,
};
