import { useQuery } from '@tanstack/react-query';

type CloudEvalPv = {
  moves: string;
  cp?: number;
  mate?: number;
};

type CloudEvalResponse = {
  fen: string;
  knodes: number;
  depth: number;
  pvs: CloudEvalPv[];
};

export type ExplorerMove = {
  uci: string;
  san: string;
  score: string;
};

export function useOpeningExplorer(fen: string) {
  const { data, isLoading } = useQuery({
    queryKey: ['opening-explorer', fen],
    queryFn: async () => {
      const res = await fetch(
        `/lichess-explorer/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=5`
      );
      if (!res.ok) return null;
      return res.json() as Promise<CloudEvalResponse>;
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
  });

  const moves: ExplorerMove[] = (data?.pvs ?? []).map((pv) => {
    const uci = pv.moves.split(' ')[0] ?? '';
    const score = pv.mate !== undefined
      ? `M${pv.mate}`
      : pv.cp !== undefined
        ? (pv.cp >= 0 ? `+${(pv.cp / 100).toFixed(1)}` : (pv.cp / 100).toFixed(1))
        : '?';
    return { uci, san: uci, score };
  });

  const hasData = moves.length > 0;

  return {
    moves,
    depth: data?.depth ?? 0,
    hasData,
    isLoading,
  };
}
