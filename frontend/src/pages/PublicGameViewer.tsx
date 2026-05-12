import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useGameStore } from '../store/gameStore';
import { Board } from '../components/Board/Board';
import { MoveList } from '../components/MoveList/MoveList';
import { Analysis } from '../components/Analysis/Analysis';
import { OpeningExplorer } from '../components/OpeningExplorer/OpeningExplorer';

type GameData = {
  id: string;
  white: string | null;
  black: string | null;
  white_elo: number | null;
  black_elo: number | null;
  result: string | null;
  event: string | null;
  date: string | null;
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

export function PublicGameViewer() {
  const { id, gameId } = useParams<{ id: string; gameId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { loadGame, goForward, goBack, goToStart, goToEnd, currentFen, info } = useGameStore();

  const ctx = location.state as SidebarContext | null;
  const hasSidebar = !!ctx?.dbId;

  const { data, isLoading } = useQuery({
    queryKey: ['public', 'game', id, gameId],
    queryFn: () => api.get<{ game: GameData }>(`/public/databases/${id}/games/${gameId}`),
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
      });
    }
  }, [data, loadGame]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      switch (e.key) {
        case 'ArrowRight': e.preventDefault(); goForward(); break;
        case 'ArrowLeft': e.preventDefault(); goBack(); break;
        case 'Home': e.preventDefault(); goToStart(); break;
        case 'End': e.preventDefault(); goToEnd(); break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goForward, goBack, goToStart, goToEnd]);

  const handleSelectGame = (game: SidebarGame) => {
    navigate(`/public/${ctx!.dbId}/game/${game.id}`, {
      state: ctx,
      replace: true,
    });
  };

  if (isLoading) return <p>Načítání...</p>;
  if (!data?.game) return <p>Partie nenalezena.</p>;

  const gameContent = (
    <div>
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
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
        <div style={{ color: '#888', fontSize: '0.85rem' }}>
          {info.event}{info.date ? ` · ${info.date}` : ''}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ flex: '0 0 auto', width: 'min(480px, 100%)' }}>
          <Board fen={currentFen} />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', justifyContent: 'center' }}>
            {(['|◀', '◀', '▶', '▶|'] as const).map((label, i) => (
              <button
                key={label}
                onClick={[goToStart, goBack, goForward, goToEnd][i]}
                style={{ padding: '0.5rem 1rem', fontSize: '1.1rem', cursor: 'pointer', border: '1px solid #ddd', borderRadius: 4, background: '#fff', minWidth: 44 }}
              >
                {label}
              </button>
            ))}
          </div>
          <Analysis fen={currentFen} />
          <OpeningExplorer fen={currentFen} />
        </div>
        <div style={{ flex: 1, minWidth: 250 }}>
          <MoveList />
        </div>
      </div>
    </div>
  );

  return (
    <div>
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
          <Link to={`/public/${id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
            ← Zpět na databázi
          </Link>
        )}
      </div>

      {hasSidebar ? (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1px 1fr', gap: 0, minHeight: 0 }}>
          <Sidebar
            dbId={ctx.dbId}
            filter={ctx.filter}
            sort={ctx.sort}
            order={ctx.order}
            activeGameId={gameId!}
            onSelect={handleSelectGame}
          />
          <div style={{ background: '#e0e0e0' }} />
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
    queryKey: ['public', 'sidebar-games', dbId, { q: filter, page, sort, order }],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), sort, order });
      if (filter) params.set('q', filter);
      return api.get<GamesResponse>(`/public/databases/${dbId}/games?${params}`);
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
