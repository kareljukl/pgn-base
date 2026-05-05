import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, API_ORIGIN } from '../lib/api';
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

export function GameViewer() {
  const { id, gameId } = useParams<{ id: string; gameId: string }>();
  const { loadGame, goForward, goBack, goToStart, goToEnd, currentFen, info, path, tree } = useGameStore();

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

  if (isLoading) return <p>Načítání...</p>;
  if (!data?.game) return <p>Partie nenalezena.</p>;

  return (
    <div>
      {/* Game header */}
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
          <Board fen={currentFen} />

          {/* Navigation buttons */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', justifyContent: 'center' }}>
            <NavButton onClick={goToStart} label="|◀" title="Na začátek (Home)" />
            <NavButton onClick={goBack} label="◀" title="Zpět (←)" />
            <NavButton onClick={goForward} label="▶" title="Vpřed (→)" />
            <NavButton onClick={goToEnd} label="▶|" title="Na konec (End)" />
          </div>

          {/* Stockfish Analysis */}
          <Analysis fen={currentFen} />

          {/* Opening Explorer */}
          <OpeningExplorer fen={currentFen} />
        </div>

        {/* Right column: Move list */}
        <div style={{ flex: 1, minWidth: 250 }}>
          <MoveList />
        </div>
      </div>
    </div>
  );
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
