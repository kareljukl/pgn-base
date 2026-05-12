export type EditorHeaders = {
  Event: string;
  White: string;
  Black: string;
  Date: string;
  Round: string;
  Result: string;
  WhiteElo: string;
  BlackElo: string;
  WhiteTeam: string;
  BlackTeam: string;
  ECO: string;
};

export function emptyHeaders(): EditorHeaders {
  return {
    Event: '',
    White: '',
    Black: '',
    Date: todayPgnDate(),
    Round: '',
    Result: '*',
    WhiteElo: '',
    BlackElo: '',
    WhiteTeam: '',
    BlackTeam: '',
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

export function toApiHeaders(h: EditorHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  const keys: (keyof EditorHeaders)[] = [
    'Event', 'White', 'Black', 'Date', 'Round', 'Result',
    'WhiteElo', 'BlackElo', 'WhiteTeam', 'BlackTeam', 'ECO',
  ];
  for (const k of keys) {
    const v = h[k]?.trim();
    if (v) out[k] = v;
  }
  return out;
}
