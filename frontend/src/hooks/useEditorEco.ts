import { useEffect, useRef, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';

type ExplorerResponse = {
  opening?: { eco: string; name: string } | null;
};

export type Eco = { eco: string; name: string };

const DEBOUNCE_MS = 300;

export function useEditorEco(fen: string): Eco | null {
  const [debouncedFen, setDebouncedFen] = useState(fen);
  const lastKnown = useRef<Eco | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedFen(fen), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [fen]);

  const { data } = useQuery({
    queryKey: ['editor-eco', debouncedFen],
    queryFn: async () => {
      try {
        return await api.get<ExplorerResponse>(
          `/explorer?fen=${encodeURIComponent(debouncedFen)}&moves=0`
        );
      } catch (err) {
        if (err instanceof ApiError) return null;
        throw err;
      }
    },
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
  });

  if (data?.opening) {
    lastKnown.current = { eco: data.opening.eco, name: data.opening.name };
  }

  return lastKnown.current;
}
