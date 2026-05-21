import { Hono } from 'hono';
import { authRequired } from '../middleware/auth';
import type { AppEnv } from '../types';

const databases = new Hono<AppEnv>();

const MAX_DATABASES_PER_USER = 50;

// List own databases (auth required)
databases.get('/', authRequired, async (c) => {
  const user = c.get('user');

  const results = await c.env.DB.prepare(
    `SELECT d.*, COUNT(g.id) as game_count
     FROM databases d
     LEFT JOIN games g ON g.database_id = d.id
     WHERE d.owner_id = ?
     GROUP BY d.id
     ORDER BY d.updated_at DESC`
  ).bind(user.id).all();

  return c.json({ databases: results.results });
});

// Create database
databases.post('/', authRequired, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    name?: string;
    description?: string;
    import_source?: string;
    chesscz_comp_id?: number;
    chesscz_round_nr?: number;
    chesscz_home_team_id?: number;
    chesscz_away_team_id?: number;
  }>();

  if (!body.name || body.name.trim().length === 0) {
    return c.json({ error: 'Název je povinný' }, 400);
  }

  if (body.name.trim().length > 100) {
    return c.json({ error: 'Název může mít maximálně 100 znaků' }, 400);
  }

  // Check limit
  const countResult = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM databases WHERE owner_id = ?'
  ).bind(user.id).first<{ count: number }>();

  if (countResult && countResult.count >= MAX_DATABASES_PER_USER) {
    return c.json({ error: `Maximální počet databází je ${MAX_DATABASES_PER_USER}` }, 400);
  }

  const importSource = body.import_source === 'chesscz' ? 'chesscz' : 'manual';
  const compId = importSource === 'chesscz' && Number.isFinite(body.chesscz_comp_id) ? body.chesscz_comp_id! : null;
  const roundNr = importSource === 'chesscz' && Number.isFinite(body.chesscz_round_nr) ? body.chesscz_round_nr! : null;
  const homeTeamId = importSource === 'chesscz' && Number.isFinite(body.chesscz_home_team_id) ? body.chesscz_home_team_id! : null;
  const awayTeamId = importSource === 'chesscz' && Number.isFinite(body.chesscz_away_team_id) ? body.chesscz_away_team_id! : null;

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(
    `INSERT INTO databases
       (id, owner_id, name, description, is_public,
        import_source, chesscz_comp_id, chesscz_round_nr, chesscz_home_team_id, chesscz_away_team_id,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, user.id, body.name.trim(), body.description?.trim() || null,
    importSource, compId, roundNr, homeTeamId, awayTeamId,
    now, now
  ).run();

  const db = await c.env.DB.prepare(
    'SELECT * FROM databases WHERE id = ?'
  ).bind(id).first();

  return c.json({ database: db }, 201);
});

// Get single database
databases.get('/:id', authRequired, async (c) => {
  const user = c.get('user');
  const dbId = c.req.param('id');

  const db = await c.env.DB.prepare(
    `SELECT d.*, COUNT(g.id) as game_count
     FROM databases d
     LEFT JOIN games g ON g.database_id = d.id
     WHERE d.id = ?
     GROUP BY d.id`
  ).bind(dbId).first();

  if (!db) {
    return c.json({ error: 'Databáze nenalezena' }, 404);
  }

  if (db.owner_id !== user.id) {
    return c.json({ error: 'Přístup odepřen' }, 403);
  }

  return c.json({ database: db });
});

// Update database (rename, description, visibility)
databases.patch('/:id', authRequired, async (c) => {
  const user = c.get('user');
  const dbId = c.req.param('id');
  const body = await c.req.json<{ name?: string; description?: string; is_public?: boolean }>();

  const existing = await c.env.DB.prepare(
    'SELECT * FROM databases WHERE id = ?'
  ).bind(dbId).first();

  if (!existing) {
    return c.json({ error: 'Databáze nenalezena' }, 404);
  }

  if (existing.owner_id !== user.id) {
    return c.json({ error: 'Přístup odepřen' }, 403);
  }

  if (body.name !== undefined && body.name.trim().length === 0) {
    return c.json({ error: 'Název je povinný' }, 400);
  }

  if (body.name !== undefined && body.name.trim().length > 100) {
    return c.json({ error: 'Název může mít maximálně 100 znaků' }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const name = body.name !== undefined ? body.name.trim() : existing.name;
  const description = body.description !== undefined ? (body.description.trim() || null) : existing.description;
  const isPublic = body.is_public !== undefined ? (body.is_public ? 1 : 0) : existing.is_public;

  await c.env.DB.prepare(
    `UPDATE databases SET name = ?, description = ?, is_public = ?, updated_at = ? WHERE id = ?`
  ).bind(name, description, isPublic, now, dbId).run();

  const updated = await c.env.DB.prepare(
    'SELECT * FROM databases WHERE id = ?'
  ).bind(dbId).first();

  return c.json({ database: updated });
});

// Delete database
databases.delete('/:id', authRequired, async (c) => {
  const user = c.get('user');
  const dbId = c.req.param('id');

  const existing = await c.env.DB.prepare(
    'SELECT * FROM databases WHERE id = ?'
  ).bind(dbId).first();

  if (!existing) {
    return c.json({ error: 'Databáze nenalezena' }, 404);
  }

  if (existing.owner_id !== user.id) {
    return c.json({ error: 'Přístup odepřen' }, 403);
  }

  await c.env.DB.prepare('DELETE FROM databases WHERE id = ?').bind(dbId).run();

  return c.json({ ok: true });
});

export { databases };
