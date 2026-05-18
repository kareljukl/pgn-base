import type { ReactNode } from 'react';

export type SanMode = 'en' | 'cs' | 'fig';

const CS_MAP: Record<string, string> = { K: 'K', Q: 'D', R: 'V', B: 'S', N: 'J' };
const FIG_MAP: Record<string, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞' };

const FIG_STYLE: React.CSSProperties = {
  fontSize: '1.4em',
  lineHeight: 1,
  verticalAlign: '-0.01em',
};

function formatCs(san: string): string {
  let out = san;
  const first = san[0];
  if (CS_MAP[first]) out = CS_MAP[first] + san.slice(1);
  return out.replace(/=([KQRBN])/g, (_, p: string) => `=${CS_MAP[p] ?? p}`);
}

function formatFig(san: string): ReactNode {
  const first = san[0];
  const elements: ReactNode[] = [];
  let body = san;
  if (FIG_MAP[first]) {
    elements.push(<span key="p" style={FIG_STYLE}>{FIG_MAP[first]}</span>);
    body = san.slice(1);
  }
  const parts = body.split(/(=[KQRBN])/);
  parts.forEach((p, i) => {
    const m = /^=([KQRBN])$/.exec(p);
    if (m) {
      const piece = m[1];
      elements.push('=');
      elements.push(<span key={`q${i}`} style={FIG_STYLE}>{FIG_MAP[piece] ?? piece}</span>);
    } else if (p) {
      elements.push(p);
    }
  });
  return <>{elements}</>;
}

export function formatSan(san: string, mode: SanMode): ReactNode {
  if (!san) return san;
  if (mode === 'en') return san;
  if (mode === 'cs') return formatCs(san);
  return formatFig(san);
}
