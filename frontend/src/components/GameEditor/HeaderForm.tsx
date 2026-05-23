import { useState } from 'react';
import type { EditorHeaders } from '../../lib/editorPgn';
import { PlayerAutocomplete } from './PlayerAutocomplete';
import { RosterAutocomplete } from './RosterAutocomplete';
import { fetchPlayerByCzeId, type PlayerHit } from '../../hooks/useChessczSearch';
import { useChessczRoster } from '../../hooks/useChessczCompetition';
import { asArray, type ChessczRosterEntry } from '../../lib/chesscz';

export type ChessczContext = {
  compId: number;
  homeTeamId: number;
  awayTeamId: number;
};

type Props = {
  headers: EditorHeaders;
  onChange: (next: EditorHeaders) => void;
  showRequired: boolean;
  initialHeaders?: EditorHeaders;
  chessczContext?: ChessczContext | null;
};

const RESULTS = ['*', '1-0', '0-1', '1/2-1/2'];

type Side = 'White' | 'Black';

export function HeaderForm({ headers, onChange, showRequired, initialHeaders, chessczContext }: Props) {
  const [refreshingSide, setRefreshingSide] = useState<Side | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const set = <K extends keyof EditorHeaders>(key: K, value: EditorHeaders[K]) => {
    onChange({ ...headers, [key]: value });
  };

  const missing = (key: keyof EditorHeaders) => showRequired && !headers[key].trim();
  const changed = (key: keyof EditorHeaders) => !!initialHeaders && headers[key] !== initialHeaders[key];

  const board = parseInt(headers.Board, 10);
  const boardForRoster = Number.isFinite(board) && board > 0 ? board : 1;
  const homeIsWhite = boardForRoster % 2 === 1;
  const whiteTeamId = chessczContext ? (homeIsWhite ? chessczContext.homeTeamId : chessczContext.awayTeamId) : null;
  const blackTeamId = chessczContext ? (homeIsWhite ? chessczContext.awayTeamId : chessczContext.homeTeamId) : null;

  const whiteRosterQ = useChessczRoster(chessczContext?.compId ?? null, whiteTeamId);
  const blackRosterQ = useChessczRoster(chessczContext?.compId ?? null, blackTeamId);

  const whiteRoster = asArray<ChessczRosterEntry>(whiteRosterQ.data?.data);
  const blackRoster = asArray<ChessczRosterEntry>(blackRosterQ.data?.data);
  const whiteRosterError = (whiteRosterQ.error as { status?: number } | null)?.status ?? null;
  const blackRosterError = (blackRosterQ.error as { status?: number } | null)?.status ?? null;

  const applyPlayer = (side: Side, p: PlayerHit) => {
    const eloFallback = p.fideStdElo ?? p.czeStdElo ?? null;
    const fullName = p.fullName?.trim();
    const clubName = p.clubName?.trim();
    // In chesscz (match) mode the {side}Team field is the team name from the
    // league lineup, not the player's club — never overwrite it from /members.
    const nextTeam = chessczContext
      ? headers[`${side}Team`]
      : (clubName || headers[`${side}Team`]);
    onChange({
      ...headers,
      [side]: fullName || headers[side],
      [`${side}CzeId`]: String(p.czeId),
      [`${side}FideId`]: p.fideId != null ? String(p.fideId) : headers[`${side}FideId`],
      [`${side}CzeElo`]: p.czeStdElo != null ? String(p.czeStdElo) : headers[`${side}CzeElo`],
      [`${side}FideElo`]: p.fideStdElo != null ? String(p.fideStdElo) : headers[`${side}FideElo`],
      [`${side}Elo`]: eloFallback != null ? String(eloFallback) : headers[`${side}Elo`],
      [`${side}Team`]: nextTeam,
    });
  };

  const applyRosterEntry = (side: Side, r: ChessczRosterEntry) => {
    const eloFallback = r.playerFideElo > 0 ? r.playerFideElo : r.playerCzeElo > 0 ? r.playerCzeElo : null;
    onChange({
      ...headers,
      [side]: r.playerName.trim() || headers[side],
      [`${side}CzeId`]: String(r.playerId),
      [`${side}CzeElo`]: r.playerCzeElo > 0 ? String(r.playerCzeElo) : headers[`${side}CzeElo`],
      [`${side}FideElo`]: r.playerFideElo > 0 ? String(r.playerFideElo) : headers[`${side}FideElo`],
      [`${side}Elo`]: eloFallback != null ? String(eloFallback) : headers[`${side}Elo`],
      // WhiteFideId/BlackFideId stay as-is (roster doesn't return FIDE ID — use ⟳ on CzeId).
      // WhiteTeam/BlackTeam stay as-is (already set from import).
    });
  };

  const refresh = async (side: Side) => {
    const id = headers[`${side}CzeId`];
    if (!id.trim()) return;
    setRefreshingSide(side);
    setRefreshError(null);
    try {
      const p = await fetchPlayerByCzeId(id.trim(), true);
      applyPlayer(side, p);
    } catch (e) {
      const status = (e as { status?: number } | null)?.status;
      setRefreshError(
        status === 429 ? 'Vyhledávání omezeno, zkus za chvíli.'
        : status === 503 ? 'ŠSČR dočasně nedostupné.'
        : status === 404 ? 'Hráč nenalezen.'
        : 'Chyba při aktualizaci.'
      );
    } finally {
      setRefreshingSide(null);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Hlavičky partie</div>
      {refreshError && (
        <div style={{ fontSize: '0.75rem', color: '#b91c1c', marginBottom: '0.5rem' }}>{refreshError}</div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '0.4rem 0.5rem', alignItems: 'center' }}>
        <Label text="Event *" />
        <Input value={headers.Event} onChange={(v) => set('Event', v)} invalid={missing('Event')} changed={changed('Event')} />

        <Label text="Site" />
        <Input value={headers.Site} onChange={(v) => set('Site', v)} changed={changed('Site')} />

        <Label text="White *" />
        {chessczContext ? (
          <RosterAutocomplete
            value={headers.White}
            onChange={(v) => set('White', v)}
            onPick={(r) => applyRosterEntry('White', r)}
            roster={whiteRoster}
            isLoading={whiteRosterQ.isLoading}
            errorStatus={whiteRosterError}
            invalid={missing('White')}
            changed={changed('White')}
          />
        ) : (
          <PlayerAutocomplete
            value={headers.White}
            onChange={(v) => set('White', v)}
            onPick={(p) => applyPlayer('White', p)}
            invalid={missing('White')}
            changed={changed('White')}
          />
        )}

        <Label text="Black *" />
        {chessczContext ? (
          <RosterAutocomplete
            value={headers.Black}
            onChange={(v) => set('Black', v)}
            onPick={(r) => applyRosterEntry('Black', r)}
            roster={blackRoster}
            isLoading={blackRosterQ.isLoading}
            errorStatus={blackRosterError}
            invalid={missing('Black')}
            changed={changed('Black')}
          />
        ) : (
          <PlayerAutocomplete
            value={headers.Black}
            onChange={(v) => set('Black', v)}
            onPick={(p) => applyPlayer('Black', p)}
            invalid={missing('Black')}
            changed={changed('Black')}
          />
        )}

        <Label text="Date" />
        <Input value={headers.Date} onChange={(v) => set('Date', v)} placeholder="YYYY.MM.DD" changed={changed('Date')} />

        <Label text="Round" />
        <Input value={headers.Round} onChange={(v) => set('Round', v)} changed={changed('Round')} />

        <Label text="Board" />
        <Input value={headers.Board} onChange={(v) => set('Board', v)} changed={changed('Board')} />

        <Label text="Result" />
        <select
          value={headers.Result}
          onChange={(e) => set('Result', e.target.value)}
          style={{ ...inputStyle, background: changed('Result') ? '#fef9c3' : '#fff' }}
        >
          {RESULTS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        <Label text="WhiteElo" />
        <Input value={headers.WhiteElo} onChange={(v) => set('WhiteElo', v)} inputMode="numeric" changed={changed('WhiteElo')} />

        <Label text="WhiteFideElo" />
        <Input value={headers.WhiteFideElo} onChange={(v) => set('WhiteFideElo', v)} inputMode="numeric" changed={changed('WhiteFideElo')} />

        <Label text="WhiteCzeElo" />
        <Input value={headers.WhiteCzeElo} onChange={(v) => set('WhiteCzeElo', v)} inputMode="numeric" changed={changed('WhiteCzeElo')} />

        <Label text="BlackElo" />
        <Input value={headers.BlackElo} onChange={(v) => set('BlackElo', v)} inputMode="numeric" changed={changed('BlackElo')} />

        <Label text="BlackFideElo" />
        <Input value={headers.BlackFideElo} onChange={(v) => set('BlackFideElo', v)} inputMode="numeric" changed={changed('BlackFideElo')} />

        <Label text="BlackCzeElo" />
        <Input value={headers.BlackCzeElo} onChange={(v) => set('BlackCzeElo', v)} inputMode="numeric" changed={changed('BlackCzeElo')} />

        <Label text="WhiteTeam" />
        <Input value={headers.WhiteTeam} onChange={(v) => set('WhiteTeam', v)} changed={changed('WhiteTeam')} />

        <Label text="BlackTeam" />
        <Input value={headers.BlackTeam} onChange={(v) => set('BlackTeam', v)} changed={changed('BlackTeam')} />

        <Label text="WhiteFideId" />
        <Input value={headers.WhiteFideId} onChange={(v) => set('WhiteFideId', v)} changed={changed('WhiteFideId')} />

        <Label text="BlackFideId" />
        <Input value={headers.BlackFideId} onChange={(v) => set('BlackFideId', v)} changed={changed('BlackFideId')} />

        <Label text="WhiteCzeId" />
        <InputWithRefresh
          value={headers.WhiteCzeId}
          onChange={(v) => set('WhiteCzeId', v)}
          changed={changed('WhiteCzeId')}
          canRefresh={headers.WhiteCzeId.trim().length > 0 && refreshingSide !== 'White'}
          refreshing={refreshingSide === 'White'}
          onRefresh={() => refresh('White')}
        />

        <Label text="BlackCzeId" />
        <InputWithRefresh
          value={headers.BlackCzeId}
          onChange={(v) => set('BlackCzeId', v)}
          changed={changed('BlackCzeId')}
          canRefresh={headers.BlackCzeId.trim().length > 0 && refreshingSide !== 'Black'}
          refreshing={refreshingSide === 'Black'}
          onRefresh={() => refresh('Black')}
        />
      </div>
    </div>
  );
}

function Label({ text }: { text: string }) {
  return <span style={{ fontSize: '0.8rem', color: '#666' }}>{text}</span>;
}

function Input({
  value,
  onChange,
  placeholder,
  invalid,
  inputMode,
  changed,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  invalid?: boolean;
  inputMode?: 'numeric' | 'text';
  changed?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      inputMode={inputMode}
      onChange={(e) => onChange(e.target.value)}
      style={{
        ...inputStyle,
        borderColor: invalid ? '#dc2626' : changed ? '#facc15' : '#ccc',
        background: invalid ? '#fef2f2' : changed ? '#fef9c3' : '#fff',
      }}
    />
  );
}

function InputWithRefresh({
  value,
  onChange,
  changed,
  canRefresh,
  refreshing,
  onRefresh,
}: {
  value: string;
  onChange: (v: string) => void;
  changed?: boolean;
  canRefresh: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
      <Input value={value} onChange={onChange} changed={changed} />
      <button
        type="button"
        onClick={onRefresh}
        disabled={!canRefresh}
        title="Aktualizovat hráče z ŠSČR"
        style={{
          padding: '0.2rem 0.4rem',
          fontSize: '0.8rem',
          cursor: canRefresh ? 'pointer' : 'default',
          border: '1px solid #ddd',
          borderRadius: 3,
          background: '#fff',
          color: canRefresh ? '#333' : '#bbb',
          minWidth: 28,
        }}
      >
        {refreshing ? '…' : '⟳'}
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '0.3rem 0.5rem',
  fontSize: '0.85rem',
  border: '1px solid #ccc',
  borderRadius: 4,
  width: '100%',
  boxSizing: 'border-box',
};

const containerStyle: React.CSSProperties = {
  border: '1px solid #e0e0e0',
  borderRadius: 6,
  padding: '0.75rem',
};

const headerStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#666',
  textTransform: 'uppercase',
  marginBottom: '0.5rem',
};
