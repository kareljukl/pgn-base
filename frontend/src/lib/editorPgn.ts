export type EditorHeaders = {
  Event: string;
  Site: string;
  White: string;
  Black: string;
  Date: string;
  Round: string;
  Board: string;
  Result: string;
  WhiteElo: string;
  WhiteFideElo: string;
  WhiteCzeElo: string;
  BlackElo: string;
  BlackFideElo: string;
  BlackCzeElo: string;
  WhiteTeam: string;
  BlackTeam: string;
  WhiteFideId: string;
  BlackFideId: string;
  WhiteCzeId: string;
  BlackCzeId: string;
  ECO: string;
};

export function emptyHeaders(): EditorHeaders {
  return {
    Event: '',
    Site: '',
    White: '',
    Black: '',
    Date: todayPgnDate(),
    Round: '',
    Board: '',
    Result: '*',
    WhiteElo: '',
    WhiteFideElo: '',
    WhiteCzeElo: '',
    BlackElo: '',
    BlackFideElo: '',
    BlackCzeElo: '',
    WhiteTeam: '',
    BlackTeam: '',
    WhiteFideId: '',
    BlackFideId: '',
    WhiteCzeId: '',
    BlackCzeId: '',
    ECO: '',
  };
}

export function todayPgnDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

export function buildEditorMovesPgn(moves: string[], result: string): string {
  let out = '';
  for (let i = 0; i < moves.length; i++) {
    const ply = i + 1;
    if (ply % 2 === 1) {
      const moveNo = Math.floor(ply / 2) + 1;
      out += (out ? ' ' : '') + `${moveNo}. ${moves[i]}`;
    } else {
      out += ` ${moves[i]}`;
    }
  }
  if (result && result !== '*') {
    out += (out ? ' ' : '') + result;
  } else if (out) {
    out += ' *';
  }
  return out;
}

export type GameRowLike = {
  event: string | null;
  site: string | null;
  date: string | null;
  round: string | null;
  board: string | null;
  white: string | null;
  black: string | null;
  white_elo: number | null;
  black_elo: number | null;
  white_fide_elo: number | null;
  black_fide_elo: number | null;
  white_cze_elo: number | null;
  black_cze_elo: number | null;
  white_team: string | null;
  black_team: string | null;
  white_fide_id: string | null;
  black_fide_id: string | null;
  white_cze_id: string | null;
  black_cze_id: string | null;
  result: string | null;
  eco: string | null;
};

const HEADER_KEYS: (keyof EditorHeaders)[] = [
  'Event', 'Site', 'White', 'Black', 'Date', 'Round', 'Board', 'Result',
  'WhiteElo', 'WhiteFideElo', 'WhiteCzeElo',
  'BlackElo', 'BlackFideElo', 'BlackCzeElo',
  'WhiteTeam', 'BlackTeam',
  'WhiteFideId', 'BlackFideId', 'WhiteCzeId', 'BlackCzeId', 'ECO',
];

export function headersFromGameRow(g: GameRowLike): EditorHeaders {
  return {
    Event: g.event ?? '',
    Site: g.site ?? '',
    White: g.white ?? '',
    Black: g.black ?? '',
    Date: g.date ?? '',
    Round: g.round ?? '',
    Board: g.board ?? '',
    Result: g.result ?? '*',
    WhiteElo: g.white_elo != null ? String(g.white_elo) : '',
    WhiteFideElo: g.white_fide_elo != null ? String(g.white_fide_elo) : '',
    WhiteCzeElo: g.white_cze_elo != null ? String(g.white_cze_elo) : '',
    BlackElo: g.black_elo != null ? String(g.black_elo) : '',
    BlackFideElo: g.black_fide_elo != null ? String(g.black_fide_elo) : '',
    BlackCzeElo: g.black_cze_elo != null ? String(g.black_cze_elo) : '',
    WhiteTeam: g.white_team ?? '',
    BlackTeam: g.black_team ?? '',
    WhiteFideId: g.white_fide_id ?? '',
    BlackFideId: g.black_fide_id ?? '',
    WhiteCzeId: g.white_cze_id ?? '',
    BlackCzeId: g.black_cze_id ?? '',
    ECO: g.eco ?? '',
  };
}

export function headersEqual(a: EditorHeaders, b: EditorHeaders): boolean {
  return HEADER_KEYS.every((k) => a[k] === b[k]);
}

export function toApiHeaders(h: EditorHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of HEADER_KEYS) {
    const v = h[k]?.trim();
    if (v) out[k] = v;
  }
  return out;
}
