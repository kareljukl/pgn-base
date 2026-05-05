import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { buildPgn, stripMoveText } from '../lib/pgn';

const publicRoutes = new Hono<AppEnv>();

// Helper: verify database is public
async function getPublicDb(c: any, dbId: string) {
  return c.env.DB.prepare(
    `SELECT d.*, u.name as owner_name, COUNT(g.id) as game_count
     FROM databases d
     JOIN users u ON u.id = d.owner_id
     LEFT JOIN games g ON g.database_id = d.id
     WHERE d.id = ? AND d.is_public = 1
     GROUP BY d.id`
  ).bind(dbId).first();
}

// List public databases
publicRoutes.get('/databases', async (c) => {
  const results = await c.env.DB.prepare(
    `SELECT d.*, u.name as owner_name, COUNT(g.id) as game_count
     FROM databases d
     JOIN users u ON u.id = d.owner_id
     LEFT JOIN games g ON g.database_id = d.id
     WHERE d.is_public = 1
     GROUP BY d.id
     ORDER BY d.updated_at DESC`
  ).all();

  return c.json({ databases: results.results });
});

// Get public database detail
publicRoutes.get('/databases/:id', async (c) => {
  const db = await getPublicDb(c, c.req.param('id'));
  if (!db) return c.json({ error: 'Databáze nenalezena' }, 404);
  return c.json({ database: db });
});

// List games in a public database
publicRoutes.get('/databases/:id/games', async (c) => {
  const dbId = c.req.param('id');
  const db = await getPublicDb(c, dbId);
  if (!db) return c.json({ error: 'Databáze nenalezena' }, 404);

  const q = c.req.query('q') || '';
  const page = Math.max(1, parseInt(c.req.query('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '25')));
  const sort = c.req.query('sort') || 'date';
  const order = c.req.query('order') === 'asc' ? 'ASC' : 'DESC';

  const allowedSorts = ['date', 'white', 'black', 'result', 'event', 'round'];
  const sortColumn = allowedSorts.includes(sort) ? sort : 'date';
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE g.database_id = ?';
  const params: unknown[] = [dbId];

  if (q) {
    whereClause += ' AND (g.white LIKE ? OR g.black LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }

  const countResult = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM games g ${whereClause}`
  ).bind(...params).first<{ total: number }>();

  const results = await c.env.DB.prepare(
    `SELECT g.id, g.event, g.site, g.date, g.round, g.board, g.white, g.black,
            g.white_elo, g.black_elo, g.white_team, g.black_team, g.result, g.eco
     FROM games g ${whereClause}
     ORDER BY g.${sortColumn} ${order}
     LIMIT ? OFFSET ?`
  ).bind(...params, limit, offset).all();

  return c.json({
    games: results.results,
    total: countResult?.total ?? 0,
    page,
    limit,
  });
});

// Get single game from public database
publicRoutes.get('/databases/:id/games/:gameId', async (c) => {
  const dbId = c.req.param('id');
  const gameId = c.req.param('gameId');
  const db = await getPublicDb(c, dbId);
  if (!db) return c.json({ error: 'Databáze nenalezena' }, 404);

  const game = await c.env.DB.prepare(
    'SELECT * FROM games WHERE id = ? AND database_id = ?'
  ).bind(gameId, dbId).first();

  if (!game) return c.json({ error: 'Partie nenalezena' }, 404);
  return c.json({ game });
});

// Export public database as PGN
publicRoutes.get('/databases/:id/export', async (c) => {
  const dbId = c.req.param('id');
  const db = await getPublicDb(c, dbId);
  if (!db) return c.json({ error: 'Databáze nenalezena' }, 404);

  const mode = c.req.query('mode') === 'stripped' ? 'stripped' : 'full';
  const results = await c.env.DB.prepare(
    'SELECT * FROM games WHERE database_id = ? ORDER BY date ASC'
  ).bind(dbId).all();

  const pgn = results.results.map((g: any) => buildPgn(g, mode)).join('\n\n');
  const filename = `${(db.name as string).replace(/[^a-zA-Z0-9_-]/g, '_')}.pgn`;

  return new Response(pgn, {
    headers: {
      'Content-Type': 'application/x-chess-pgn',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});

// Export single game from public database
publicRoutes.get('/databases/:id/games/:gameId/export', async (c) => {
  const dbId = c.req.param('id');
  const gameId = c.req.param('gameId');
  const db = await getPublicDb(c, dbId);
  if (!db) return c.json({ error: 'Databáze nenalezena' }, 404);

  const game = await c.env.DB.prepare(
    'SELECT * FROM games WHERE id = ? AND database_id = ?'
  ).bind(gameId, dbId).first();

  if (!game) return c.json({ error: 'Partie nenalezena' }, 404);

  const mode = c.req.query('mode') === 'stripped' ? 'stripped' : 'full';
  const pgn = buildPgn(game as any, mode);

  return new Response(pgn, {
    headers: {
      'Content-Type': 'application/x-chess-pgn',
      'Content-Disposition': `attachment; filename="game.pgn"`,
    },
  });
});

export { publicRoutes };
