import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { uciSequenceToSan } from '../lib/uciToSan';

type CloudEvalPvRaw = {
  moves: string;
  cp?: number;
  mate?: number;
};

type CloudEvalResponse = {
  fen: string;
  knodes: number;
  depth: number;
  pvs: CloudEvalPvRaw[];
};

export type CloudPv = {
  score: { type: 'cp' | 'mate'; value: number };
  pvUci: string;
  pvSan: string[];
};

export function useCloudEval(fen: string) {
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['cloud-eval', fen],
    queryFn: async () => {
      const base = import.meta.env.PROD ? 'https://lichess.org/api' : '/lichess-explorer';
      const res = await fetch(`${base}/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=5`);
      if (!res.ok) return null;
      return res.json() as Promise<CloudEvalResponse>;
    },
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
  });

  const pvs: CloudPv[] = (data?.pvs ?? []).map((pv) => {
    const pvUci = pv.moves;
    const pvSan = uciSequenceToSan(fen, pvUci.split(/\s+/));
    const score = pv.mate !== undefined
      ? { type: 'mate' as const, value: pv.mate }
      : { type: 'cp' as const, value: pv.cp ?? 0 };
    return { score, pvUci, pvSan };
  });

  return {
    pvs,
    depth: data?.depth ?? 0,
    hasData: pvs.length > 0,
    isLoading,
    isFetching,
  };
}
