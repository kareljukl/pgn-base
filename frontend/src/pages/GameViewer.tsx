import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { DrawShape } from 'chessground/draw';
import { api, API_ORIGIN } from '../lib/api';
import { useGameStore } from '../store/gameStore';
import { Board } from '../components/Board/Board';
import { MoveList } from '../components/MoveList/MoveList';
import { Analysis } from '../components/Analysis/Analysis';
import { OpeningExplorer } from '../components/OpeningExplorer/OpeningExplorer';
import { OpeningBook } from '../components/OpeningBook/OpeningBook';

type GameData = {
  id: string;
  white: string | null;
  black: string | null;
  white_elo: number | null;
  black_elo: number | null;
  result: string | null;
  event: string | null;
  date: string | null;
  white_fide_id: string | null;
  black_fide_id: string | null;
  white_cz_id: string | null;
  black_cz_id: string | null;
  moves_pgn: string;
};

type SidebarGame = {
  id: string;
  white: string | null;
  black: string | null;
  result: string | null;
};

type SidebarContext = {
  filter: string;
  sort: string;
  order: string;
  dbName: string;
  dbId: string;
};

type GamesResponse = {
  games: SidebarGame[];
  total: number;
  page: number;
  limit: number;
};

const PAGE_SIZE = 25;

export function GameViewer() {
  const { id, gameId } = useParams<{ id: string; gameId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { loadGame, goForward, goBack, goToStart, goToEnd, currentFen, info } = useGameStore();
  const [bestMoveArrow, setBestMoveArrow] = useState<DrawShape | null>(null);

  const handleBestMove = useCallback((uci: string | null) => {
    setBestMoveArrow(uci ? { orig: uci.slice(0, 2), dest: uci.slice(2, 4), brush: 'green' } as DrawShape : null);
  }, []);

  const ctx = location.state as SidebarContext | null;
  const hasSidebar = !!ctx?.dbId;

  const { data, isLoading } = useQuery({
    queryKey: ['game', id, gameId],
    queryFn: () => api.get<{ game: GameData }>(`/databases/${id}/games/${gameId}`),
  });

  useEffect(() => {
    if (data?.game) {
      const g = data.game;
      loadGame(g.moves_pgn, {
        white: g.white ?? undefined,
        black: g.black ?? undefined,
        whiteElo: g.white_elo ?? undefined,
        blackElo: g.black_elo ?? undefined,
        result: g.result ?? undefined,
        event: g.event ?? undefined,
        date: g.date ?? undefined,
        whiteFideId: g.white_fide_id ?? undefined,
        blackFideId: g.black_fide_id ?? undefined,
        whiteCzId: g.white_cz_id ?? undefined,
        blackCzId: g.black_cz_id ?? undefined,
      });
    }
  }, [data, loadGame]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          goForward();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          goBack();
          break;
        case 'Home':
          e.preventDefault();
          goToStart();
          break;
        case 'End':
          e.preventDefault();
          goToEnd();
          break;
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goForward, goBack, goToStart, goToEnd]);

  const handleSelectGame = (game: SidebarGame) => {
    navigate(`/db/${ctx!.dbId}/game/${game.id}`, {
      state: ctx,
      replace: true,
    });
  };

  if (isLoading) return <p>Načítání...</p>;
  if (!data?.game) return <p>Partie nenalezena.</p>;

  const gameContent = (
    <div>
      {/* Game header */}
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <div>
            <span style={{ fontWeight: 600 }}>
              {info.white || '?'}{info.whiteElo ? ` (${info.whiteElo})` : ''}
            </span>
            <span style={{ margin: '0 0.5rem', color: '#888' }}>vs</span>
            <span style={{ fontWeight: 600 }}>
              {info.black || '?'}{info.blackElo ? ` (${info.blackElo})` : ''}
            </span>
            <span style={{ marginLeft: '1rem', color: '#666' }}>{info.result}</span>
          </div>
          <PlayerIds info={info} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ color: '#888', fontSize: '0.85rem' }}>
            {info.event}{info.date ? ` · ${info.date}` : ''}
          </span>
          <a
            href={`${API_ORIGIN}/api/v1/databases/${id}/games/${gameId}/export?mode=full`}
            download
            style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', border: '1px solid #ddd', borderRadius: 4, background: '#fff', color: '#333', textDecoration: 'none' }}
          >
            Export PGN
          </a>
        </div>
      </div>

      {/* Main layout */}
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        {/* Left column: Board + controls + analysis */}
        <div style={{ flex: '0 0 auto', width: 'min(480px, 100%)' }}>
          <Board fen={currentFen} autoShapes={bestMoveArrow ? [bestMoveArrow] : []} />

          {/* Navigation buttons */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', justifyContent: 'center' }}>
            <NavButton onClick={goToStart} label="|◀" title="Na začátek (Home)" />
            <NavButton onClick={goBack} label="◀" title="Zpět (←)" />
            <NavButton onClick={goForward} label="▶" title="Vpřed (→)" />
            <NavButton onClick={goToEnd} label="▶|" title="Na konec (End)" />
          </div>

          {/* Stockfish Analysis */}
          <Analysis fen={currentFen} onBestMove={handleBestMove} />

          {/* Cloud Eval */}
          <OpeningExplorer fen={currentFen} />

          {/* Opening Book (Masters) */}
          <OpeningBook fen={currentFen} />
        </div>

        {/* Right column: Move list */}
        <div style={{ flex: 1, minWidth: 250 }}>
          <MoveList />
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: '#666' }}>
        {hasSidebar ? (
          <>
            <span
              onClick={() => navigate(-1)}
              style={{ cursor: 'pointer', color: '#2563eb', textDecoration: 'none' }}
            >
              ← {ctx.dbName || 'Zpět na seznam'}
            </span>
            {ctx.filter && (
              <span style={{ color: '#888' }}>{' '}· Filtr: „{ctx.filter}"</span>
            )}
          </>
        ) : (
          <Link to={`/db/${id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
            ← Zpět na databázi
          </Link>
        )}
      </div>

      {/* Layout with optional sidebar */}
      {hasSidebar ? (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1px 1fr', gap: 0, minHeight: 0 }}>
          {/* Sidebar */}
          <Sidebar
            dbId={ctx.dbId}
            filter={ctx.filter}
            sort={ctx.sort}
            order={ctx.order}
            activeGameId={gameId!}
            onSelect={handleSelectGame}
          />

          {/* Divider */}
          <div style={{ background: '#e0e0e0' }} />

          {/* Game content */}
          <div style={{ paddingLeft: '1rem', minWidth: 0 }}>
            {gameContent}
          </div>
        </div>
      ) : (
        gameContent
      )}
    </div>
  );
}

function Sidebar({ dbId, filter, sort, order, activeGameId, onSelect }: {
  dbId: string;
  filter: string;
  sort: string;
  order: string;
  activeGameId: string;
  onSelect: (game: SidebarGame) => void;
}) {
  const activeRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);

  const { data } = useQuery({
    queryKey: ['sidebar-games', dbId, { q: filter, page, sort, order }],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), sort, order });
      if (filter) params.set('q', filter);
      return api.get<GamesResponse>(`/databases/${dbId}/games?${params}`);
    },
  });

  const games = data?.games ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeGameId, page]);

  return (
    <div>
      {/* Header with pagination — fixed */}
      <div style={{ padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#999', letterSpacing: '0.05em' }}>
          {total} partií
        </span>
        {totalPages > 1 && (
          <>
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              style={paginationBtnStyle}
            >
              ◀
            </button>
            <span style={{ fontSize: '10px', color: '#999' }}>{page}/{totalPages}</span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              style={paginationBtnStyle}
            >
              ▶
            </button>
          </>
        )}
      </div>
      {/* Scrollable game list */}
      <div>
        {games.map((game) => {
          const isActive = game.id === activeGameId;
          return (
            <div
              key={game.id}
              ref={isActive ? activeRef : null}
              onClick={() => onSelect(game)}
              style={{
                padding: '0.35rem 0.75rem',
                cursor: 'pointer',
                borderLeft: isActive ? '3px solid #2563eb' : '3px solid transparent',
                background: isActive ? '#eff6ff' : undefined,
                transition: 'background 0.1s',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = '#f9fafb';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = '';
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {game.white || '?'}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {game.black || '?'}
                </div>
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: resultColor(game.result), flexShrink: 0 }}>
                {game.result || '*'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const paginationBtnStyle: React.CSSProperties = {
  padding: '0 4px',
  fontSize: '10px',
  cursor: 'pointer',
  border: '1px solid #ddd',
  borderRadius: 3,
  background: '#fff',
  color: '#666',
  lineHeight: '16px',
};

function resultColor(result: string | null): string {
  if (result === '1-0') return '#16a34a';
  if (result === '0-1') return '#dc2626';
  return '#888';
}

function PlayerIds({ info }: { info: {
  whiteFideId?: string;
  blackFideId?: string;
  whiteCzId?: string;
  blackCzId?: string;
} }) {
  const whiteIds = formatIds(info.whiteFideId, info.whiteCzId);
  const blackIds = formatIds(info.blackFideId, info.blackCzId);
  if (!whiteIds && !blackIds) return null;
  return (
    <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '0.15rem' }}>
      {whiteIds && <span>Bílý: {whiteIds}</span>}
      {whiteIds && blackIds && <span style={{ margin: '0 0.4rem' }}>·</span>}
      {blackIds && <span>Černý: {blackIds}</span>}
    </div>
  );
}

function formatIds(fideId?: string, czId?: string): string {
  const parts: string[] = [];
  if (fideId) parts.push(`FIDE ${fideId}`);
  if (czId) parts.push(`ČŠS ${czId}`);
  return parts.join(', ');
}

function NavButton({ onClick, label, title }: { onClick: () => void; label: string; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        padding: '0.5rem 1rem',
        fontSize: '1.1rem',
        cursor: 'pointer',
        border: '1px solid #ddd',
        borderRadius: 4,
        background: '#fff',
        minWidth: 44,
      }}
    >
      {label}
    </button>
  );
}
