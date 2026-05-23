import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type {
  ChessczCompDetail,
  ChessczMatchResult,
  ChessczProxyResponse,
  ChessczRosterEntry,
  ChessczRoundSchedule,
  ChessczTableRow,
  ChessczTeamScheduleEntry,
} from '../lib/chesscz';

const STALE_5_MIN = 5 * 60_000;
const STALE_30_MIN = 30 * 60_000;

export function useChessczDetails(compId: number | null) {
  return useQuery({
    queryKey: ['chesscz-comp-details', compId],
    queryFn: () =>
      api.get<ChessczProxyResponse<ChessczCompDetail>>(
        `/chesscz/competitions/${compId}/details`
      ),
    enabled: compId !== null && compId > 0,
    staleTime: STALE_30_MIN,
    retry: false,
  });
}

export function useChessczTable(compId: number | null) {
  return useQuery({
    queryKey: ['chesscz-comp-table', compId],
    queryFn: () =>
      api.get<ChessczProxyResponse<ChessczTableRow | ChessczTableRow[]>>(
        `/chesscz/competitions/${compId}/table`
      ),
    enabled: compId !== null && compId > 0,
    staleTime: STALE_5_MIN,
    retry: false,
  });
}

export function useChessczRoster(compId: number | null, teamId: number | null) {
  return useQuery({
    queryKey: ['chesscz-team-roster', compId, teamId],
    queryFn: () =>
      api.get<ChessczProxyResponse<ChessczRosterEntry | ChessczRosterEntry[]>>(
        `/chesscz/competitions/${compId}/team/${teamId}/roster`
      ),
    enabled: compId !== null && compId > 0 && teamId !== null && teamId > 0,
    staleTime: STALE_30_MIN,
    retry: false,
  });
}

export function useChessczTeamSchedule(compId: number | null, teamId: number | null) {
  return useQuery({
    queryKey: ['chesscz-team-schedule', compId, teamId],
    queryFn: () =>
      api.get<ChessczProxyResponse<ChessczTeamScheduleEntry | ChessczTeamScheduleEntry[]>>(
        `/chesscz/competitions/${compId}/team/${teamId}/schedule`
      ),
    enabled: compId !== null && compId > 0 && teamId !== null && teamId > 0,
    staleTime: STALE_30_MIN,
    retry: false,
  });
}

export function useChessczCompSchedule(compId: number | null) {
  return useQuery({
    queryKey: ['chesscz-comp-schedule', compId],
    queryFn: () =>
      api.get<ChessczProxyResponse<ChessczRoundSchedule | ChessczRoundSchedule[]>>(
        `/chesscz/competitions/${compId}/schedule`
      ),
    enabled: compId !== null && compId > 0,
    staleTime: STALE_30_MIN,
    retry: false,
  });
}

export function useChessczRoundSchedule(compId: number | null, round: number | null) {
  return useQuery({
    queryKey: ['chesscz-round-schedule', compId, round],
    queryFn: () =>
      api.get<ChessczProxyResponse<ChessczRoundSchedule>>(
        `/chesscz/competitions/${compId}/round/${round}/schedule`
      ),
    enabled: compId !== null && compId > 0 && round !== null && round > 0,
    staleTime: STALE_30_MIN,
    retry: false,
  });
}

export function useChessczRoundMatches(compId: number | null, round: number | null, enabled = true) {
  return useQuery({
    queryKey: ['chesscz-round-matches', compId, round],
    queryFn: () =>
      api.get<ChessczProxyResponse<ChessczMatchResult | ChessczMatchResult[]>>(
        `/chesscz/competitions/${compId}/round/${round}/matches`
      ),
    enabled: enabled && compId !== null && compId > 0 && round !== null && round > 0,
    staleTime: STALE_5_MIN,
    retry: false,
  });
}

export async function fetchChessczRoundMatches(
  compId: number,
  round: number
): Promise<ChessczProxyResponse<ChessczMatchResult | ChessczMatchResult[]>> {
  return api.get<ChessczProxyResponse<ChessczMatchResult | ChessczMatchResult[]>>(
    `/chesscz/competitions/${compId}/round/${round}/matches`
  );
}
