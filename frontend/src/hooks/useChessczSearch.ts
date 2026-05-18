import { useEffect, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '../lib/api';

export type PlayerHit = {
  czeId: number;
  fideId: number | null;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  clubId: string | null;
  clubName: string | null;
  birthYear: number | null;
  czeStdElo: number | null;
  czeRapidElo: number | null;
  fideStdElo: number | null;
  fideRapidElo: number | null;
  fideBlitzElo: number | null;
  fetchedAt: number;
};

type SearchResponse = { players: PlayerHit[]; fetchedAt: number; stale: boolean };
type PlayerResponse = { player: PlayerHit; stale: boolean };

export const MIN_QUERY_LEN = 4;

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useChessczSearch(rawQuery: string) {
  const debounced = useDebounced(rawQuery.trim(), 700);
  const enabled = debounced.length >= MIN_QUERY_LEN;
  return useQuery({
    queryKey: ['chesscz-search', debounced.toLowerCase()],
    queryFn: () => api.get<SearchResponse>(`/chesscz/search?q=${encodeURIComponent(debounced)}`),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
  });
}

export async function fetchPlayerByCzeId(czeId: string, refresh = false): Promise<PlayerHit> {
  const path = `/chesscz/player/cze/${encodeURIComponent(czeId)}${refresh ? '?refresh=true' : ''}`;
  const res = await api.get<PlayerResponse>(path);
  return res.player;
}

export async function fetchPlayerByFideId(fideId: string, refresh = false): Promise<PlayerHit> {
  const path = `/chesscz/player/fide/${encodeURIComponent(fideId)}${refresh ? '?refresh=true' : ''}`;
  const res = await api.get<PlayerResponse>(path);
  return res.player;
}
