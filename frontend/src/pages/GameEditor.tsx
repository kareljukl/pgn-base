import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Chess } from 'chess.js';
import type { DrawShape } from 'chessground/draw';
import { api } from '../lib/api';
import { EditableBoard } from '../components/Board/EditableBoard';
import { EditorMoveList } from '../components/GameEditor/EditorMoveList';
import { HeaderForm, type ChessczContext } from '../components/GameEditor/HeaderForm';
import { ReplaceMoveInline, ReplaceConfirmModal } from '../components/GameEditor/ReplaceMoveDialog';
import { RestoreDraftDialog } from '../components/GameEditor/RestoreDraftDialog';
import { OpeningBook } from '../components/OpeningBook/OpeningBook';
import { Analysis } from '../components/Analysis/Analysis';
import { useEditorEco } from '../hooks/useEditorEco';
import { parseMoveText } from '../lib/moveTree';
import {
  buildEditorMovesPgn,
  emptyHeaders,
  headersEqual,
  headersFromGameRow,
  toApiHeaders,
  type EditorHeaders,
  type GameRowLike,
} from '../lib/editorPgn';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AUTOSAVE_INTERVAL_MS = 60_000;

type DatabaseInfo = { id: string; name: string };
type DatabasesResponse = { databases: DatabaseInfo[] };

type DatabaseDetailInfo = {
  id: string;
  import_source?: string | null;
  chesscz_comp_id?: number | null;
  chesscz_home_team_id?: number | null;
  chesscz_away_team_id?: number | null;
};

type GameData = GameRowLike & { id: string; moves_pgn: string };

type Draft = {
  savedAt: number;
  moves: string[];
  fens: string[];
  cursor: number;
  headers: EditorHeaders;
};

type PendingMove = {
  san: string;
  fen: string;
  fromCursor: number; // cursor index at which the move was attempted (replacing K = fromCursor + 1)
};

type ReplaceConfirm = {
  previewFen: string;
  keptAfterCount: number;
  totalAfterCount: number;
  droppedFirstLabel: string | null;
  droppedLastLabel: string | null;
  mergedMoves: string[];
  mergedFens: string[];
};

export function GameEditor() {
  const { id, gameId } = useParams<{ id: string; gameId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = !!gameId;

  const draftKey = isEdit ? `pgn-base-draft-edit-${gameId}` : `pgn-base-draft-${id}`;

  const [moves, setMoves] = useState<string[]>([]);
  const [fens, setFens] = useState<string[]>([]);
  const [cursor, setCursor] = useState(-1);
  const [headers, setHeaders] = useState<EditorHeaders>(emptyHeaders);
  const [initialMoves, setInitialMoves] = useState<string[]>([]);
  const [initialHeaders, setInitialHeaders] = useState<EditorHeaders>(emptyHeaders);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [replaceConfirm, setReplaceConfirm] = useState<ReplaceConfirm | null>(null);
  const [showRequired, setShowRequired] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState<Draft | null>(null);
  const [autoResultNote, setAutoResultNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bestMoveArrow, setBestMoveArrow] = useState<DrawShape | null>(null);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const draftLoaded = useRef(false);
  const initFromGameDone = useRef(false);

  const handleBestMove = useCallback((uci: string | null) => {
    setBestMoveArrow(uci
      ? ({ orig: uci.slice(0, 2), dest: uci.slice(2, 4), brush: 'green' } as DrawShape)
      : null);
  }, []);

  const { data: dbList } = useQuery({
    queryKey: ['databases'],
    queryFn: () => api.get<DatabasesResponse>('/databases'),
  });
  const dbName = dbList?.databases.find((d) => d.id === id)?.name ?? '';

  const { data: dbDetail } = useQuery({
    queryKey: ['database', id],
    queryFn: () => api.get<{ database: DatabaseDetailInfo }>(`/databases/${id}`),
    enabled: !!id,
  });
  const chessczContext: ChessczContext | null =
    dbDetail?.database.import_source === 'chesscz'
    && dbDetail.database.chesscz_comp_id
    && dbDetail.database.chesscz_home_team_id
    && dbDetail.database.chesscz_away_team_id
      ? {
          compId: dbDetail.database.chesscz_comp_id,
          homeTeamId: dbDetail.database.chesscz_home_team_id,
          awayTeamId: dbDetail.database.chesscz_away_team_id,
        }
      : null;

  // Edit mode: fetch existing game
  const { data: gameData, isLoading: gameLoading } = useQuery({
    queryKey: ['game', id, gameId],
    queryFn: () => api.get<{ game: GameData }>(`/databases/${id}/games/${gameId}`),
    enabled: isEdit,
  });

  // Init state from fetched game (only once per gameId, and skipped if draft restore wins)
  useEffect(() => {
    if (!isEdit || !gameData?.game || initFromGameDone.current) return;
    if (draftPrompt) return; // wait for user choice before initializing
    initFromGameDone.current = true;

    const g = gameData.game;
    const tree = parseMoveText(g.moves_pgn || '');
    const parsedMoves = tree.moves.map((n) => n.san);
    const parsedFens = tree.moves.map((n) => n.fen);
    const loadedHeaders = headersFromGameRow(g);
    setMoves(parsedMoves);
    setFens(parsedFens);
    setHeaders(loadedHeaders);
    setInitialMoves(parsedMoves);
    setInitialHeaders(loadedHeaders);

    const stateIdx = (location.state as { currentMoveIndex?: number } | null)?.currentMoveIndex;
    let initCursor: number;
    if (typeof stateIdx === 'number' && stateIdx >= 0 && stateIdx <= parsedMoves.length) {
      initCursor = stateIdx - 1; // spec: 0 = start, N = after N moves → cursor = N-1
    } else {
      initCursor = parsedMoves.length - 1; // fallback to end
    }
    setCursor(initCursor);
  }, [isEdit, gameData, draftPrompt, location.state]);

  // Check for draft on mount
  useEffect(() => {
    if (draftLoaded.current) return;
    draftLoaded.current = true;
    const raw = localStorage.getItem(draftKey);
    if (!raw) return;
    try {
      const d = JSON.parse(raw) as Draft;
      if (d.moves?.length > 0 || hasHeaderContent(d.headers)) {
        setDraftPrompt(d);
      } else {
        localStorage.removeItem(draftKey);
      }
    } catch {
      localStorage.removeItem(draftKey);
    }
  }, [draftKey]);

  const currentFen = cursor === -1 ? START_FEN : fens[cursor];
  const atEnd = cursor === moves.length - 1;
  const navLocked = pending !== null || replaceConfirm !== null;

  const movesDirty = !movesArraysEqual(moves, initialMoves);
  const headersDirty = !headersEqual(headers, initialHeaders);
  const dirty = movesDirty || headersDirty;

  // Autosave every minute
  useEffect(() => {
    const interval = setInterval(() => {
      if (!dirty) return;
      const draft: Draft = {
        savedAt: Date.now(),
        moves,
        fens,
        cursor,
        headers,
      };
      localStorage.setItem(draftKey, JSON.stringify(draft));
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [moves, fens, cursor, headers, draftKey, dirty]);

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (pending || replaceConfirm || draftPrompt) return;
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          setCursor((c) => Math.max(-1, c - 1));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setCursor((c) => Math.min(moves.length - 1, c + 1));
          break;
        case 'Home':
          e.preventDefault();
          setCursor(-1);
          break;
        case 'End':
          e.preventDefault();
          setCursor(moves.length - 1);
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [moves.length, pending, replaceConfirm, draftPrompt]);

  const handleBoardMove = (san: string, newFen: string) => {
    if (!atEnd) {
      setPending({ san, fen: newFen, fromCursor: cursor });
      return;
    }
    appendMove(san, newFen);
  };

  const appendMove = (san: string, newFen: string) => {
    const newMoves = [...moves, san];
    const newFens = [...fens, newFen];
    setMoves(newMoves);
    setFens(newFens);
    setCursor(newMoves.length - 1);
    maybeAutoResult(newFen);
  };

  const maybeAutoResult = (fen: string) => {
    const chess = new Chess(fen);
    if (chess.isCheckmate()) {
      const winner = chess.turn() === 'w' ? '0-1' : '1-0';
      setHeaders((h) => ({ ...h, Result: winner }));
      setAutoResultNote(`Mat — výsledek nastaven na ${winner}.`);
    } else if (chess.isStalemate()) {
      setHeaders((h) => ({ ...h, Result: '1/2-1/2' }));
      setAutoResultNote('Pat — výsledek nastaven na 1/2-1/2.');
    } else if (chess.isInsufficientMaterial() || chess.isThreefoldRepetition()) {
      setHeaders((h) => ({ ...h, Result: '1/2-1/2' }));
      setAutoResultNote('Remíza — výsledek nastaven na 1/2-1/2.');
    } else {
      setAutoResultNote(null);
    }
  };

  const handleReplaceChoice = (choice: 'overwrite' | 'replace' | 'cancel') => {
    if (!pending) return;
    const K = pending.fromCursor + 1; // index of move being replaced

    if (choice === 'cancel') {
      setPending(null);
      return;
    }

    if (choice === 'overwrite') {
      const newMoves = [...moves.slice(0, K), pending.san];
      const newFens = [...fens.slice(0, K), pending.fen];
      setMoves(newMoves);
      setFens(newFens);
      setCursor(newMoves.length - 1);
      maybeAutoResult(pending.fen);
      setPending(null);
      return;
    }

    // 'replace' — validate following moves against new position
    const mergedMoves: string[] = [...moves.slice(0, K), pending.san];
    const mergedFens: string[] = [...fens.slice(0, K), pending.fen];
    let firstInvalidIdx: number | null = null;
    let firstInvalidSan: string | null = null;
    const chess = new Chess(pending.fen);
    for (let i = K + 1; i < moves.length; i++) {
      const san = moves[i];
      try {
        const result = chess.move(san);
        mergedMoves.push(result.san);
        mergedFens.push(chess.fen());
      } catch {
        firstInvalidIdx = i;
        firstInvalidSan = san;
        break;
      }
    }

    const totalAfterCount = moves.length - K - 1;
    const keptAfterCount = mergedMoves.length - K - 1;
    const droppedFirstLabel = firstInvalidIdx !== null ? formatPly(firstInvalidIdx, firstInvalidSan!) : null;
    const droppedLastLabel = firstInvalidIdx !== null && moves.length - 1 > firstInvalidIdx
      ? formatPly(moves.length - 1, moves[moves.length - 1])
      : null;

    setReplaceConfirm({
      previewFen: mergedFens[mergedFens.length - 1],
      keptAfterCount,
      totalAfterCount,
      droppedFirstLabel,
      droppedLastLabel,
      mergedMoves,
      mergedFens,
    });
  };

  const confirmReplace = () => {
    if (!replaceConfirm) return;
    setMoves(replaceConfirm.mergedMoves);
    setFens(replaceConfirm.mergedFens);
    setCursor(replaceConfirm.mergedMoves.length - 1);
    maybeAutoResult(replaceConfirm.previewFen);
    setReplaceConfirm(null);
    setPending(null);
  };

  const cancelReplaceConfirm = () => {
    setReplaceConfirm(null);
    setPending(null);
  };

  const restoreDraft = () => {
    if (!draftPrompt) return;
    setMoves(draftPrompt.moves);
    setFens(draftPrompt.fens);
    setCursor(draftPrompt.cursor);
    setHeaders(draftPrompt.headers);
    setDraftPrompt(null);
    initFromGameDone.current = true; // don't overwrite restored draft with fresh game data in edit mode
  };

  const discardDraft = () => {
    localStorage.removeItem(draftKey);
    setDraftPrompt(null);
  };

  type SaveResult = { imported?: number; ids?: string[]; ok?: true };
  const saveMutation = useMutation<SaveResult>({
    mutationFn: async () => {
      const movesPgn = buildEditorMovesPgn(moves, headers.Result);
      if (isEdit) {
        return await api.patch<SaveResult>(`/databases/${id}/games/${gameId}`, {
          headers: toApiHeaders(headers),
          movesPgn,
        });
      }
      const payload = {
        games: [
          {
            headers: toApiHeaders(headers),
            movesPgn,
          },
        ],
      };
      return await api.post<SaveResult>(`/databases/${id}/games`, payload);
    },
    onSuccess: (data) => {
      localStorage.removeItem(draftKey);
      queryClient.invalidateQueries({ queryKey: ['games', id] });
      if (isEdit) {
        queryClient.invalidateQueries({ queryKey: ['game', id, gameId] });
        queryClient.invalidateQueries({ queryKey: ['sidebar-games', id] });
        navigate(`/db/${id}/game/${gameId}`);
        return;
      }
      const newId = data?.ids?.[0];
      if (newId) {
        navigate(`/db/${id}/game/${newId}`);
      } else {
        navigate(`/db/${id}`);
      }
    },
    onError: (err: Error) => setError(err.message ?? 'Chyba při ukládání'),
  });

  const handleSave = () => {
    if (!headers.Event.trim() || !headers.White.trim() || !headers.Black.trim()) {
      setShowRequired(true);
      setError('Vyplňte povinná pole (Event, White, Black).');
      return;
    }
    if (moves.length === 0) {
      setError('Partie nemá žádné tahy.');
      return;
    }
    setError(null);
    saveMutation.mutate();
  };

  const handleDiscard = () => {
    if (dirty) {
      const message = buildDiscardMessage(movesDirty, headersDirty, isEdit);
      if (!confirm(message)) return;
    }
    localStorage.removeItem(draftKey);
    navigate(isEdit ? `/db/${id}/game/${gameId}` : `/db/${id}`);
  };

  const lastMovePair = useMemo<[string, string] | undefined>(() => {
    if (cursor < 0) return undefined;
    const fen = cursor === 0 ? START_FEN : fens[cursor - 1];
    return extractLastMoveFromFens(fen, fens[cursor], moves[cursor]);
  }, [cursor, fens, moves]);

  // While the replace dialog is open, show the attempted move on the main board
  // so the user can see what they're proposing.
  const boardFen = pending ? pending.fen : currentFen;
  const boardLastMove = pending
    ? extractLastMoveFromFens(currentFen, pending.fen, pending.san)
    : lastMovePair;
  const eco = useEditorEco(boardFen);
  const ecoLabel = eco ? `ECO: ${eco.eco} ${eco.name}` : null;

  // Keep ECO in headers in sync
  useEffect(() => {
    if (eco && headers.ECO !== eco.eco) {
      setHeaders((h) => ({ ...h, ECO: eco.eco }));
    }
  }, [eco]);

  if (isEdit && gameLoading && !initFromGameDone.current && !draftPrompt) {
    return <p>Načítání...</p>;
  }

  if (draftPrompt) {
    return (
      <RestoreDraftDialog
        savedAt={draftPrompt.savedAt}
        white={draftPrompt.headers.White}
        black={draftPrompt.headers.Black}
        moveCount={draftPrompt.moves.length}
        onRestore={restoreDraft}
        onDiscard={discardDraft}
      />
    );
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: '#666' }}>
        <Link to={`/db/${id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
          ← {dbName || 'Zpět na databázi'}
        </Link>
        {!isEdit && <span style={{ color: '#888' }}>{' '}· Nová partie</span>}
      </div>

      {/* Game header line (mirrors GameViewer) */}
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          {isEdit ? (
            <span>
              <span style={{ fontWeight: 600 }}>
                {headers.White || '?'}{headers.WhiteElo ? ` (${headers.WhiteElo})` : ''}
              </span>
              <span style={{ margin: '0 0.5rem', color: '#888' }}>vs</span>
              <span style={{ fontWeight: 600 }}>
                {headers.Black || '?'}{headers.BlackElo ? ` (${headers.BlackElo})` : ''}
              </span>
              {headers.Result && headers.Result !== '*' && (
                <span style={{ marginLeft: '1rem', color: '#666' }}>{headers.Result}</span>
              )}
            </span>
          ) : (
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Nová partie</h2>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {isEdit && (headers.Event || headers.Date) && (
            <span style={{ color: '#888', fontSize: '0.85rem' }}>
              {headers.Event}{headers.Date ? ` · ${headers.Date}` : ''}
            </span>
          )}
          <button onClick={handleDiscard} style={secondaryBtn}>Zahodit</button>
          <button
            onClick={handleSave}
            style={{ ...primaryBtn, ...(dirty && !saveMutation.isPending ? null : disabledOverlay) }}
            disabled={!dirty || saveMutation.isPending}
            title={!dirty ? 'Žádné změny k uložení' : undefined}
          >
            {saveMutation.isPending ? 'Ukládám...' : 'Uložit'}
          </button>
        </div>
      </div>

      {error && (
        <p style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: 0 }}>{error}</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 480px) 1fr', gap: '1.5rem', alignItems: 'start' }}>
        <div>
          <EditableBoard
            fen={boardFen}
            editable={!pending && !replaceConfirm}
            orientation={orientation}
            lastMove={boardLastMove}
            onMove={handleBoardMove}
            autoShapes={bestMoveArrow ? [bestMoveArrow] : []}
          />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', justifyContent: 'center', alignItems: 'center' }}>
            <NavButton onClick={() => setCursor(-1)} disabled={cursor === -1 || navLocked} label="|◀" title="Na začátek (Home)" />
            <NavButton onClick={() => setCursor((c) => Math.max(-1, c - 1))} disabled={cursor === -1 || navLocked} label="◀" title="Zpět (←)" />
            <NavButton onClick={() => setCursor((c) => Math.min(moves.length - 1, c + 1))} disabled={atEnd || navLocked} label="▶" title="Vpřed (→)" />
            <NavButton onClick={() => setCursor(moves.length - 1)} disabled={atEnd || navLocked} label="▶|" title="Na konec (End)" />
            <NavButton onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))} label="⇅" title="Otočit šachovnici" />
          </div>
          {pending && <ReplaceMoveInline onChoice={handleReplaceChoice} />}
          <Analysis fen={boardFen} onBestMove={handleBestMove} />
          <OpeningBook fen={boardFen} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <EditorMoveList
            moves={moves}
            cursor={cursor}
            onJump={(c) => { if (!navLocked) setCursor(c); }}
            ecoLabel={ecoLabel}
            disabled={navLocked}
          />
          {autoResultNote && (
            <p style={{ color: '#1d4ed8', fontSize: '0.85rem', margin: '-0.25rem 0 0' }}>{autoResultNote}</p>
          )}
          <HeaderForm
            headers={headers}
            onChange={setHeaders}
            showRequired={showRequired}
            initialHeaders={isEdit ? initialHeaders : undefined}
            chessczContext={chessczContext}
          />
        </div>
      </div>

      {replaceConfirm && (
        <ReplaceConfirmModal
          previewFen={replaceConfirm.previewFen}
          keptAfterCount={replaceConfirm.keptAfterCount}
          totalAfterCount={replaceConfirm.totalAfterCount}
          droppedFirstLabel={replaceConfirm.droppedFirstLabel}
          droppedLastLabel={replaceConfirm.droppedLastLabel}
          onConfirm={confirmReplace}
          onCancel={cancelReplaceConfirm}
        />
      )}
    </div>
  );
}

function formatPly(plyIdx: number, san: string): string {
  const moveNo = Math.floor(plyIdx / 2) + 1;
  const prefix = plyIdx % 2 === 0 ? `${moveNo}.` : `${moveNo}...`;
  return `${prefix} ${san}`;
}

function hasHeaderContent(h: EditorHeaders): boolean {
  return Object.entries(h).some(([k, v]) => {
    if (k === 'Date' || k === 'Result' || k === 'ECO') return false;
    return v.trim() !== '';
  });
}

function movesArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function buildDiscardMessage(movesDirty: boolean, headersDirty: boolean, isEdit: boolean): string {
  const what = movesDirty && headersDirty
    ? 'Tahy i hlavička'
    : movesDirty
      ? 'Úpravy tahů'
      : 'Úpravy hlavičky';
  if (isEdit) {
    return `Zahodit neuložené změny?\n${what} budou ztraceny, partie zůstane beze změn.`;
  }
  return `Zahodit neuloženou partii?\n${what} budou ztraceny.`;
}

function extractLastMoveFromFens(prevFen: string, _newFen: string, san: string): [string, string] | undefined {
  try {
    const chess = new Chess(prevFen);
    const move = chess.move(san);
    return [move.from, move.to];
  } catch {
    return undefined;
  }
}

function NavButton({ onClick, disabled, label, title }: { onClick: () => void; disabled?: boolean; label: string; title: string }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={navBtnStyle(disabled)}>
      {label}
    </button>
  );
}

const primaryBtn: React.CSSProperties = {
  padding: '0.5rem 1rem',
  fontSize: '0.875rem',
  cursor: 'pointer',
  border: '1px solid #333',
  borderRadius: 4,
  background: '#333',
  color: '#fff',
};

const secondaryBtn: React.CSSProperties = {
  padding: '0.5rem 1rem',
  fontSize: '0.875rem',
  cursor: 'pointer',
  border: '1px solid #ddd',
  borderRadius: 4,
  background: '#fff',
};

const disabledOverlay: React.CSSProperties = {
  opacity: 0.5,
  cursor: 'not-allowed',
};

function navBtnStyle(disabled?: boolean): React.CSSProperties {
  return {
    padding: '0.5rem 1rem',
    fontSize: '1.1rem',
    cursor: disabled ? 'default' : 'pointer',
    border: '1px solid #ddd',
    borderRadius: 4,
    background: '#fff',
    color: disabled ? '#ccc' : '#333',
    minWidth: 44,
    opacity: disabled ? 0.5 : 1,
  };
}
