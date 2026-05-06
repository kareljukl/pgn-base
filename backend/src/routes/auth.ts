import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { signJwt } from '../lib/jwt';
import { authRequired } from '../middleware/auth';
import type { AppEnv } from '../types';

const auth = new Hono<AppEnv>();

function cookieOpts(c: { env: AppEnv['Bindings'] }, maxAge: number) {
  const prod = isProduction(c);
  return {
    httpOnly: true,
    secure: prod,
    sameSite: prod ? 'None' : 'Lax',
    maxAge,
    path: '/',
  } as const;
}

// Google OAuth — redirect to Google
auth.get('/google', (c) => {
  const state = crypto.randomUUID();

  setCookie(c, 'oauth_state', state, cookieOpts(c, 300));

  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${getBackendUrl(c)}/api/v1/auth/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'consent',
  });

  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// Google OAuth — callback
auth.get('/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const storedState = getCookie(c, 'oauth_state');

  deleteCookie(c, 'oauth_state', { path: '/' });

  if (!code || !state || state !== storedState) {
    const frontendUrl = c.env.FRONTEND_URL || 'http://localhost:5173';
    return c.redirect(`${frontendUrl}/login#error=invalid_state`);
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${getBackendUrl(c)}/api/v1/auth/callback`,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const frontendUrl = c.env.FRONTEND_URL || 'http://localhost:5173';
    return c.redirect(`${frontendUrl}/login#error=token_exchange_failed`);
  }

  const tokens = await tokenRes.json<{ access_token: string }>();

  // Fetch user profile
  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!profileRes.ok) {
    const frontendUrl = c.env.FRONTEND_URL || 'http://localhost:5173';
    return c.redirect(`${frontendUrl}/login#error=profile_fetch_failed`);
  }

  const profile = await profileRes.json<{
    id: string;
    email: string;
    name: string;
    picture?: string;
  }>();

  // Upsert user
  const now = Math.floor(Date.now() / 1000);
  const userId = `google-${profile.id}`;

  await c.env.DB.prepare(
    `INSERT INTO users (id, email, name, avatar_url, role, created_at)
     VALUES (?, ?, ?, ?, 'user', ?)
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       name = excluded.name,
       avatar_url = excluded.avatar_url`
  ).bind(userId, profile.email, profile.name, profile.picture ?? null, now).run();

  const user = await c.env.DB.prepare(
    'SELECT id, email, name, avatar_url, role, created_at FROM users WHERE id = ?'
  ).bind(userId).first();

  // Generate JWT
  const jwt = await signJwt(
    { sub: user!.id as string, email: user!.email as string, name: user!.name as string, role: user!.role as string },
    c.env.JWT_SECRET
  );

  // In production: redirect with token in hash (avoids cross-domain cookie issues)
  // In dev: set cookie (same origin, works fine)
  const frontendUrl = c.env.FRONTEND_URL || 'http://localhost:5173';

  if (isProduction(c)) {
    return c.redirect(`${frontendUrl}/login#token=${jwt}`);
  }

  setCookie(c, 'token', jwt, cookieOpts(c, 7 * 86400));
  return c.redirect(frontendUrl);
});

// Dev-only login — bypasses Google OAuth
auth.post('/dev-login', async (c) => {
  if (isProduction(c)) {
    return c.json({ error: 'Nedostupné v produkci' }, 403);
  }

  const user = await c.env.DB.prepare(
    'SELECT id, email, name, avatar_url, role, created_at FROM users WHERE id = ?'
  ).bind('dev-user-001').first();

  if (!user) {
    return c.json({ error: 'Seed uživatel nenalezen. Spusťte npm run db:seed' }, 404);
  }

  const jwt = await signJwt(
    { sub: user.id as string, email: user.email as string, name: user.name as string, role: user.role as string },
    c.env.JWT_SECRET
  );

  setCookie(c, 'token', jwt, cookieOpts(c, 7 * 86400));

  return c.json({ user });
});

// Current user
auth.get('/me', authRequired, (c) => {
  return c.json({ user: c.get('user') });
});

// Logout
auth.post('/logout', (c) => {
  deleteCookie(c, 'token', { path: '/' });
  return c.json({ ok: true });
});

function getBackendUrl(c: { req: { url: string } }): string {
  const url = new URL(c.req.url);
  return `${url.protocol}//${url.host}`;
}

function isProduction(c: { env: AppEnv['Bindings'] }): boolean {
  return c.env.FRONTEND_URL?.includes('localhost') === false
    && !c.env.FRONTEND_URL?.startsWith('http://localhost');
}

export { auth };
