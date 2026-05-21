import { removeDiacritics } from './pgnUtils';

export const DEFAULT_BOARD_COUNT = 8;

export type ChessczCompDetail = {
  compName: string;
  compId: number;
  compLevel?: number;
  compWww?: string | null;
  regionId?: number;
  regionName?: string;
  compManagerName?: string | null;
  compManagerEmail?: string | null;
  compManagerPhone?: string | null;
};

export type ChessczTableRow = {
  teamRank: string;
  teamName: string;
  teamId: number;
  matchesPlayed?: number;
  matchWins?: number;
  matchDraws?: number;
  matchLosses?: number;
  points?: number;
  score?: number;
  wonGames?: number;
};

export type ChessczTeamScheduleEntry = {
  roundNr: number;
  roundDate: string;
  homeTeamId: number;
  homeTeamName: string;
  homeTeamScore: number | null;
  awayTeamId: number;
  awayTeamName: string;
  awayTeamScore: number | null;
};

export type ChessczMatchPairing = ChessczTeamScheduleEntry;

export type ChessczRoundSchedule = {
  roundNr: number;
  roundDate: string;
  roundMatches: ChessczMatchPairing[];
};

export type ChessczBoardGame = {
  homePlayerId: number;
  homePlayerName: string;
  homePlayerRating: number;
  homePlayerResult: number;
  awayPlayerId: number;
  awayPlayerName: string;
  awayPlayerRating: number;
  awayPlayerResult: number;
  gameForfeited: number;
};

export type ChessczMatchResult = {
  roundNr: number;
  homeTeamId: number;
  homeTeamName: string;
  homeTeamScore: number;
  awayTeamId: number;
  awayTeamName: string;
  awayTeamScore: number;
  matchGames: ChessczBoardGame[];
};

export type ChessczProxyResponse<T> = {
  data: T;
  fetchedAt: number;
  stale: boolean;
};

export function asArray<T>(data: T | T[] | null | undefined): T[] {
  if (data == null) return [];
  return Array.isArray(data) ? data : [data];
}

// Format match score "4:4" / "0:8" / "1.5:6.5" / "?:?" (when not yet played).
export function formatMatchScore(home: number | null | undefined, away: number | null | undefined): string {
  if (home == null || away == null) return '?:?';
  if ((home + away) <= 0) return '?:?';
  return `${formatHalf(home)}:${formatHalf(away)}`;
}

function formatHalf(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1).replace(/\.0$/, '');
}

// DD.MM.YYYY → YYYY.MM.DD (PGN). Returns input unchanged if format unrecognized.
export function formatChessczDate(czDate: string | null | undefined): string {
  if (!czDate) return '';
  const m = czDate.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return czDate;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

type PlaceholderInput = {
  compName: string;
  roundNr: number;
  roundDate: string;
  homeTeamName: string;
  awayTeamName: string;
  boardCount: number;
};

export type PgnHeaders = Record<string, string>;

// Build N placeholder games with team-name placeholders in White/Black.
export function buildPlaceholderGames(input: PlaceholderInput): { headers: PgnHeaders; movesPgn: string }[] {
  const event = removeDiacritics(input.compName);
  const date = formatChessczDate(input.roundDate);
  const home = removeDiacritics(input.homeTeamName);
  const away = removeDiacritics(input.awayTeamName);

  const games: { headers: PgnHeaders; movesPgn: string }[] = [];
  for (let board = 1; board <= input.boardCount; board++) {
    const homeIsWhite = board % 2 === 1;
    games.push({
      headers: {
        Event: event,
        Site: 'chess.cz',
        Date: date,
        Round: `${input.roundNr}.${board}`,
        Board: String(board),
        White: homeIsWhite ? home : away,
        Black: homeIsWhite ? away : home,
        WhiteTeam: homeIsWhite ? home : away,
        BlackTeam: homeIsWhite ? away : home,
        Result: '*',
      },
      movesPgn: '',
    });
  }
  return games;
}

// Map a single BoardGame at index `idx` to PGN headers (board = idx + 1).
export function boardGameToHeaders(
  match: ChessczMatchResult,
  game: ChessczBoardGame,
  idx: number,
  compName: string
): PgnHeaders {
  const board = idx + 1;
  const homeIsWhite = board % 2 === 1;

  const whiteName = homeIsWhite ? game.homePlayerName : game.awayPlayerName;
  const blackName = homeIsWhite ? game.awayPlayerName : game.homePlayerName;
  const whiteElo = homeIsWhite ? game.homePlayerRating : game.awayPlayerRating;
  const blackElo = homeIsWhite ? game.awayPlayerRating : game.homePlayerRating;
  const whiteTeam = homeIsWhite ? match.homeTeamName : match.awayTeamName;
  const blackTeam = homeIsWhite ? match.awayTeamName : match.homeTeamName;
  const whiteCzeId = homeIsWhite ? game.homePlayerId : game.awayPlayerId;
  const blackCzeId = homeIsWhite ? game.awayPlayerId : game.homePlayerId;

  const homeResult = game.homePlayerResult;
  const awayResult = game.awayPlayerResult;

  let result = '*';
  if (game.gameForfeited === 1) {
    if (homeResult === 1 && awayResult === 0) result = homeIsWhite ? '1-0' : '0-1';
    else if (homeResult === 0 && awayResult === 1) result = homeIsWhite ? '0-1' : '1-0';
  } else {
    if (homeResult === 1 && awayResult === 0) result = homeIsWhite ? '1-0' : '0-1';
    else if (homeResult === 0 && awayResult === 1) result = homeIsWhite ? '0-1' : '1-0';
    else if (homeResult === 0.5 && awayResult === 0.5) result = '1/2-1/2';
  }

  return {
    Event: removeDiacritics(compName),
    Site: 'chess.cz',
    Round: `${match.roundNr}.${board}`,
    Board: String(board),
    White: removeDiacritics(whiteName),
    Black: removeDiacritics(blackName),
    WhiteElo: whiteElo ? String(whiteElo) : '',
    BlackElo: blackElo ? String(blackElo) : '',
    WhiteTeam: removeDiacritics(whiteTeam),
    BlackTeam: removeDiacritics(blackTeam),
    WhiteCzeId: whiteCzeId ? String(whiteCzeId) : '',
    BlackCzeId: blackCzeId ? String(blackCzeId) : '',
    Result: result,
  };
}

// Find the match that pairs the given home/away teams in a round's matches list.
export function findMatch(
  matches: ChessczMatchResult[],
  homeTeamId: number,
  awayTeamId: number
): ChessczMatchResult | null {
  return (
    matches.find((m) => m.homeTeamId === homeTeamId && m.awayTeamId === awayTeamId) ?? null
  );
}
