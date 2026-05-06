import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { verifyJwt } from '../lib/jwt';
import type { AppEnv } from '../types';

export const authRequired = createMiddleware<AppEnv>(async (c, next) => {
  // Try Authorization header first, then cookie
  let token: string | undefined;

  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    token = getCookie(c, 'token');
  }

  if (!token) {
    return c.json({ error: 'Nepřihlášen' }, 401);
  }

  const payload = await verifyJwt(token, c.env.JWT_SECRET);
  if (!payload) {
    return c.json({ error: 'Neplatný nebo expirovaný token' }, 401);
  }

  const user = await c.env.DB.prepare(
    'SELECT id, email, name, avatar_url, role, created_at FROM users WHERE id = ?'
  ).bind(payload.sub).first();

  if (!user) {
    return c.json({ error: 'Uživatel nenalezen' }, 401);
  }

  c.set('user', user as any);
  await next();
});
