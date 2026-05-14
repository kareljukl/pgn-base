import { Hono } from 'hono';
import { authRequired } from '../middleware/auth';
import { buildPgn, countPlies } from '../lib/pgn';
import type { AppEnv } from '../types';

const games = new Hono<AppEnv>();

const MAX_IMPORT_GAMES = 1000;
const MAX_IMPORT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

type GameImport = {
  headers: Record<string, string>;
  movesPgn: string;
};

// List games in a database
games.get('/:dbId/games', authRequired, async (c) => {
  const user = c.get('user');
  const dbId = c.req.param('dbId');

  // Verify ownership
  const db = await c.env.DB.prepare(
    'SELECT * FROM databases WHERE id = ? AND owner_id = ?'
  ).bind(dbId, user.id).first();

  if (!db) {
    return c.json({ error: 'Databáze nenalezena' }, 404);
  }

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
            g.white_elo, g.black_elo, g.white_team, g.black_team,
            g.white_fide_id, g.black_fide_id, g.white_cz_id, g.black_cz_id,
            g.result, g.eco, g.ply_count
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

// Import games (batch)
games.post('/:dbId/games', authRequired, async (c) => {
  const user = c.get('user');
  const dbId = c.req.param('dbId');

  // Verify ownership
  const db = await c.env.DB.prepare(
    'SELECT * FROM databases WHERE id = ? AND owner_id = ?'
  ).bind(dbId, user.id).first();

  if (!db) {
    return c.json({ error: 'Databáze nenalezena' }, 404);
  }

  const body = await c.req.json<{ games: GameImport[] }>();

  if (!body.games || !Array.isArray(body.games)) {
    return c.json({ error: 'Očekáván objekt s polem "games"' }, 400);
  }

  if (body.games.length === 0) {
    return c.json({ error: 'Žádné partie k importu' }, 400);
  }

  if (body.games.length > MAX_IMPORT_GAMES) {
    return c.json({ error: `Maximální počet partií v jednom importu je ${MAX_IMPORT_GAMES}` }, 400);
  }

  // Rough size check
  const jsonSize = JSON.stringify(body.games).length;
  if (jsonSize > MAX_IMPORT_SIZE_BYTES) {
    return c.json({ error: 'Import překračuje maximální velikost 10 MB' }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const stmt = c.env.DB.prepare(
    `INSERT INTO games (id, database_id, event, site, date, round, board, white, black,
     white_elo, black_elo, white_team, black_team,
     white_fide_id, black_fide_id, white_cz_id, black_cz_id,
     result, eco, ply_count, moves_pgn, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const ids: string[] = [];
  const batch = body.games.map((game) => {
    const h = game.headers;
    const id = crypto.randomUUID();
    ids.push(id);
    return stmt.bind(
      id,
      dbId,
      h.Event || null,
      h.Site || null,
      h.Date || null,
      h.Round || null,
      h.Board || null,
      h.White || null,
      h.Black || null,
      h.WhiteElo ? parseInt(h.WhiteElo) || null : null,
      h.BlackElo ? parseInt(h.BlackElo) || null : null,
      h.WhiteTeam || null,
      h.BlackTeam || null,
      h.WhiteFideId || null,
      h.BlackFideId || null,
      h.WhiteCzId || null,
      h.BlackCzId || null,
      h.Result || null,
      h.ECO || null,
      countPlies(game.movesPgn || ''),
      game.movesPgn || '',
      now,
      now
    );
  });

  await c.env.DB.batch(batch);

  // Update database timestamp
  await c.env.DB.prepare(
    'UPDATE databases SET updated_at = ? WHERE id = ?'
  ).bind(now, dbId).run();

  return c.json({ imported: body.games.length, ids }, 201);
});

// Get single game
games.get('/:dbId/games/:gameId', authRequired, async (c) => {
  const user = c.get('user');
  const dbId = c.req.param('dbId');
  const gameId = c.req.param('gameId');

  const db = await c.env.DB.prepare(
    'SELECT * FROM databases WHERE id = ? AND owner_id = ?'
  ).bind(dbId, user.id).first();

  if (!db) {
    return c.json({ error: 'Databáze nenalezena' }, 404);
  }

  const game = await c.env.DB.prepare(
    'SELECT * FROM games WHERE id = ? AND database_id = ?'
  ).bind(gameId, dbId).first();

  if (!game) {
    return c.json({ error: 'Partie nenalezena' }, 404);
  }

  return c.json({ game });
});

// Update game headers
games.patch('/:dbId/games/:gameId', authRequired, async (c) => {
  const user = c.get('user');
  const dbId = c.req.param('dbId');
  const gameId = c.req.param('gameId');

  const db = await c.env.DB.prepare(
    'SELECT * FROM databases WHERE id = ? AND owner_id = ?'
  ).bind(dbId, user.id).first();

  if (!db) {
    return c.json({ error: 'Databáze nenalezena' }, 404);
  }

  const game = await c.env.DB.prepare(
    'SELECT id FROM games WHERE id = ? AND database_id = ?'
  ).bind(gameId, dbId).first();

  if (!game) {
    return c.json({ error: 'Partie nenalezena' }, 404);
  }

  const body = await c.req.json<{ headers: Record<string, string> }>();
  if (!body || typeof body.headers !== 'object') {
    return c.json({ error: 'Očekáván objekt s polem "headers"' }, 400);
  }

  const h = body.headers;
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(
    `UPDATE games SET
       event = ?, site = ?, date = ?, round = ?, board = ?,
       white = ?, black = ?,
       white_elo = ?, black_elo = ?,
       white_team = ?, black_team = ?,
       white_fide_id = ?, black_fide_id = ?,
       white_cz_id = ?, black_cz_id = ?,
       result = ?, eco = ?,
       updated_at = ?
     WHERE id = ? AND database_id = ?`
  ).bind(
    h.Event || null,
    h.Site || null,
    h.Date || null,
    h.Round || null,
    h.Board || null,
    h.White || null,
    h.Black || null,
    h.WhiteElo ? parseInt(h.WhiteElo) || null : null,
    h.BlackElo ? parseInt(h.BlackElo) || null : null,
    h.WhiteTeam || null,
    h.BlackTeam || null,
    h.WhiteFideId || null,
    h.BlackFideId || null,
    h.WhiteCzId || null,
    h.BlackCzId || null,
    h.Result || null,
    h.ECO || null,
    now,
    gameId,
    dbId
  ).run();

  await c.env.DB.prepare(
    'UPDATE databases SET updated_at = ? WHERE id = ?'
  ).bind(now, dbId).run();

  return c.json({ ok: true });
});

// Delete game
games.delete('/:dbId/games/:gameId', authRequired, async (c) => {
  const user = c.get('user');
  const dbId = c.req.param('dbId');
  const gameId = c.req.param('gameId');

  const db = await c.env.DB.prepare(
    'SELECT * FROM databases WHERE id = ? AND owner_id = ?'
  ).bind(dbId, user.id).first();

  if (!db) {
    return c.json({ error: 'Databáze nenalezena' }, 404);
  }

  const game = await c.env.DB.prepare(
    'SELECT id FROM games WHERE id = ? AND database_id = ?'
  ).bind(gameId, dbId).first();

  if (!game) {
    return c.json({ error: 'Partie nenalezena' }, 404);
  }

  await c.env.DB.prepare('DELETE FROM games WHERE id = ?').bind(gameId).run();

  return c.json({ ok: true });
});

// Export entire database as PGN
games.get('/:dbId/export', authRequired, async (c) => {
  const user = c.get('user');
  const dbId = c.req.param('dbId');

  const db = await c.env.DB.prepare(
    'SELECT * FROM databases WHERE id = ? AND owner_id = ?'
  ).bind(dbId, user.id).first();

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

// Export single game as PGN
games.get('/:dbId/games/:gameId/export', authRequired, async (c) => {
  const user = c.get('user');
  const dbId = c.req.param('dbId');
  const gameId = c.req.param('gameId');

  const db = await c.env.DB.prepare(
    'SELECT * FROM databases WHERE id = ? AND owner_id = ?'
  ).bind(dbId, user.id).first();

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

export { games };
