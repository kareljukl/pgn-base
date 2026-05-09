import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';

export type BookMove = {
  san: string;
  uci: string;
  white: number;
  draws: number;
  black: number;
  total: number;
  averageRating: number;
};

type LichessExplorerResponse = {
  white: number;
  draws: number;
  black: number;
  moves: {
    uci: string;
    san: string;
    white: number;
    draws: number;
    black: number;
    averageRating: number;
  }[];
};

export function useOpeningBook(fen: string) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['opening-book', fen],
    queryFn: async () => {
      try {
        return await api.get<LichessExplorerResponse>(
          `/explorer?fen=${encodeURIComponent(fen)}&moves=15`
        );
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 503)) {
          // Not configured or not authenticated — don't show component
          return null;
        }
        throw err;
      }
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
  });

  const moves: BookMove[] = (data?.moves ?? []).map((m) => ({
    san: m.san,
    uci: m.uci,
    white: m.white,
    draws: m.draws,
    black: m.black,
    total: m.white + m.draws + m.black,
    averageRating: m.averageRating,
  }));

  const isRateLimited = isError && error instanceof ApiError && error.status === 429;
  const hasData = moves.length > 0;
  const isConfigured = data !== null;

  return {
    moves,
    hasData,
    isLoading,
    isRateLimited,
    isConfigured,
  };
}
