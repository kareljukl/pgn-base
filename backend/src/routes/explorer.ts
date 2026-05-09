import { Hono } from 'hono';
import { authRequired } from '../middleware/auth';
import type { AppEnv } from '../types';

const explorer = new Hono<AppEnv>();

explorer.get('/', authRequired, async (c) => {
  const fen = c.req.query('fen');
  if (!fen) {
    return c.json({ error: 'fen parameter required' }, 400);
  }

  const token = c.env.LICHESS_TOKEN;
  if (!token) {
    return c.json({ error: 'Explorer not configured' }, 503);
  }

  const moves = c.req.query('moves') ?? '15';

  const url = new URL('https://explorer.lichess.ovh/masters');
  url.searchParams.set('fen', fen);
  url.searchParams.set('moves', moves);
  url.searchParams.set('topGames', '0');

  const resp = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });

  if (!resp.ok) {
    const status = resp.status;
    if (status === 429) {
      return c.json({ error: 'Lichess rate limit exceeded' }, 429);
    }
    return c.json({ error: `Lichess API error: ${status}` }, status as any);
  }

  const data = await resp.json();
  return c.json(data);
});

export { explorer };
