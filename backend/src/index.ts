import { Hono } from 'hono';
import { auth } from './routes/auth';
import { databases } from './routes/databases';
import { games } from './routes/games';
import { publicRoutes } from './routes/public';
import { explorer } from './routes/explorer';
import type { AppEnv } from './types';

const app = new Hono<AppEnv>();

function getAllowedOrigin(origin: string | undefined): string {
  if (!origin) return 'http://localhost:5173';
  if (origin.includes('localhost') || origin.endsWith('.pages.dev') || origin.endsWith('.workers.dev')) {
    return origin;
  }
  return 'http://localhost:5173';
}

app.use('/api/*', async (c, next) => {
  const origin = c.req.header('Origin');
  const allowedOrigin = getAllowedOrigin(origin);

  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
      },
    });
  }

  await next();

  const headers = new Headers(c.res.headers);
  headers.set('Access-Control-Allow-Origin', allowedOrigin);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Vary', 'Origin');
  c.res = new Response(c.res.body, { status: c.res.status, statusText: c.res.statusText, headers });
});

app.get('/api/v1/health', (c) => {
  return c.json({ status: 'ok' });
});

app.route('/api/v1/auth', auth);
app.route('/api/v1/databases', databases);
app.route('/api/v1/databases', games);
app.route('/api/v1/public', publicRoutes);
app.route('/api/v1/explorer', explorer);

export default app;
