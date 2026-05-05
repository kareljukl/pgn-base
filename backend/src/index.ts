import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth } from './routes/auth';
import { databases } from './routes/databases';
import { games } from './routes/games';
import { publicRoutes } from './routes/public';
import type { AppEnv } from './types';

const app = new Hono<AppEnv>();

app.use(
  '/api/*',
  cors({
    origin: ['http://localhost:5173'],
    credentials: true,
  })
);

app.get('/api/v1/health', (c) => {
  return c.json({ status: 'ok' });
});

app.route('/api/v1/auth', auth);
app.route('/api/v1/databases', databases);
app.route('/api/v1/databases', games);
app.route('/api/v1/public', publicRoutes);

export default app;
