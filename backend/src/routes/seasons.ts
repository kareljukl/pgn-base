import { Hono } from 'hono';
import { authRequired } from '../middleware/auth';
import type { AppEnv } from '../types';

const seasons = new Hono<AppEnv>();

const MAX_SEASONS_PER_USER = 50;
const MAX_ROUNDS_PER_SEASON = 30;
const DEFAULT_BOARD_COUNT = 8;

type RoundInput = {
  roundNr: number;
  roundDate: string;            // DD.MM.YYYY (raw from chess.cz)
  homeTeamId: number;
  homeTeamName: string;
  awayTeamId: number;
  awayTeamName: string;
  boardCount?: number;
};

type CreateSeasonBody = {
  name?: string;
  description?: string;
  chesscz_comp_id?: number;
  chesscz_team_id?: number;
  comp_name?: string;
  rounds?: RoundInput[];
};

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// DD.MM.YYYY → YYYY.MM.DD; passthrough if format unknown.
function formatChessczDate(czDate: string): string {
  const m = czDate.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return czDate;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

// List seasons (auth required)
seasons.get('/', authRequired, async (c) => {
  const user = c.get('user');
  const results = await c.env.DB.prepare(
    `SELECT s.*,
            (SELECT COUNT(*) FROM databases d WHERE d.season_id = s.id) AS round_count
     FROM seasons s
     WHERE s.owner_id = ?
     ORDER BY s.updated_at DESC`
  ).bind(user.id).all();
  return c.json({ seasons: results.results });
});

// Get single season + its child databases
seasons.get('/:id', authRequired, async (c) => {
  const user = c.get('user');
  const seasonId = c.req.param('id');

  const season = await c.env.DB.prepare(
    'SELECT * FROM seasons WHERE id = ?'
  ).bind(seasonId).first();

  if (!season) return c.json({ error: 'Sezóna nenalezena' }, 404);
  if (season.owner_id !== user.id) return c.json({ error: 'Přístup odepřen' }, 403);

  const dbs = await c.env.DB.prepare(
    `SELECT d.*, COUNT(g.id) AS game_count
     FROM databases d
     LEFT JOIN games g ON g.database_id = d.id
     WHERE d.season_id = ?
     GROUP BY d.id
     ORDER BY d.chesscz_round_nr ASC`
  ).bind(seasonId).all();

  return c.json({ season, databases: dbs.results });
});

// Create season + N child databases + placeholder games per round
seasons.post('/', authRequired, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<CreateSeasonBody>();

  const name = (body.name ?? '').trim();
  if (!name) return c.json({ error: 'Název sezóny je povinný' }, 400);
  if (name.length > 100) return c.json({ error: 'Název může mít maximálně 100 znaků' }, 400);

  const compId = body.chesscz_comp_id;
  const teamId = body.chesscz_team_id;
  if (!Number.isFinite(compId) || !Number.isFinite(teamId)) {
    return c.json({ error: 'Chybí compId nebo teamId' }, 400);
  }

  const rounds = Array.isArray(body.rounds) ? body.rounds : [];
  if (rounds.length === 0) return c.json({ error: 'Vyberte alespoň jedno kolo' }, 400);
  if (rounds.length > MAX_ROUNDS_PER_SEASON) {
    return c.json({ error: `Maximum kol na sezónu je ${MAX_ROUNDS_PER_SEASON}` }, 400);
  }

  for (const r of rounds) {
    if (!Number.isFinite(r.roundNr) || !Number.isFinite(r.homeTeamId) || !Number.isFinite(r.awayTeamId)) {
      return c.json({ error: 'Kolo nemá platný roundNr / homeTeamId / awayTeamId' }, 400);
    }
  }

  const seasonCount = await c.env.DB.prepare(
    'SELECT COUNT(*) AS count FROM seasons WHERE owner_id = ?'
  ).bind(user.id).first<{ count: number }>();
  if (seasonCount && seasonCount.count >= MAX_SEASONS_PER_USER) {
    return c.json({ error: `Maximální počet sezón je ${MAX_SEASONS_PER_USER}` }, 400);
  }

  const compName = (body.comp_name ?? name).trim();
  const now = Math.floor(Date.now() / 1000);
  const seasonId = crypto.randomUUID();
  const description = body.description?.trim() || null;

  const statements: D1PreparedStatement[] = [];

  statements.push(
    c.env.DB.prepare(
      `INSERT INTO seasons
         (id, owner_id, name, description, chesscz_comp_id, chesscz_team_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(seasonId, user.id, name, description, compId!, teamId!, now, now)
  );

  const dbInsert = c.env.DB.prepare(
    `INSERT INTO databases
       (id, owner_id, name, description, is_public,
        import_source, chesscz_comp_id, chesscz_round_nr, chesscz_home_team_id, chesscz_away_team_id,
        season_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, 'chesscz', ?, ?, ?, ?, ?, ?, ?)`
  );

  const gameInsert = c.env.DB.prepare(
    `INSERT INTO games
       (id, database_id, event, site, date, round, board, white, black,
        white_team, black_team, result, ply_count, moves_pgn, created_at, updated_at)
     VALUES (?, ?, ?, 'chess.cz', ?, ?, ?, ?, ?, ?, ?, '*', 0, '', ?, ?)`
  );

  const eventName = stripDiacritics(compName);

  const dbIds: string[] = [];

  for (const r of rounds) {
    const dbId = crypto.randomUUID();
    dbIds.push(dbId);
    const dbName = `${name} – kolo ${r.roundNr}`.slice(0, 100);
    const dbDescription = `${r.homeTeamName} – ${r.awayTeamName} (kolo ${r.roundNr}, ${r.roundDate})`;

    statements.push(
      dbInsert.bind(
        dbId,
        user.id,
        dbName,
        dbDescription,
        compId!,
        r.roundNr,
        r.homeTeamId,
        r.awayTeamId,
        seasonId,
        now,
        now,
      )
    );

    const boardCount = Number.isFinite(r.boardCount) && (r.boardCount as number) > 0
      ? (r.boardCount as number)
      : DEFAULT_BOARD_COUNT;
    const dateIso = formatChessczDate(r.roundDate || '');
    const home = stripDiacritics(r.homeTeamName || '');
    const away = stripDiacritics(r.awayTeamName || '');

    for (let board = 1; board <= boardCount; board++) {
      const homeIsWhite = board % 2 === 1;
      const white = homeIsWhite ? home : away;
      const black = homeIsWhite ? away : home;
      const whiteTeam = homeIsWhite ? home : away;
      const blackTeam = homeIsWhite ? away : home;
      statements.push(
        gameInsert.bind(
          crypto.randomUUID(),
          dbId,
          eventName,
          dateIso,
          `${r.roundNr}.${board}`,
          String(board),
          white,
          black,
          whiteTeam,
          blackTeam,
          now,
          now,
        )
      );
    }
  }

  await c.env.DB.batch(statements);

  const season = await c.env.DB.prepare(
    'SELECT * FROM seasons WHERE id = ?'
  ).bind(seasonId).first();

  const childDbs = await c.env.DB.prepare(
    `SELECT d.*, COUNT(g.id) AS game_count
     FROM databases d
     LEFT JOIN games g ON g.database_id = d.id
     WHERE d.season_id = ?
     GROUP BY d.id
     ORDER BY d.chesscz_round_nr ASC`
  ).bind(seasonId).all();

  return c.json({ season, databases: childDbs.results }, 201);
});

// Rename / change description
seasons.patch('/:id', authRequired, async (c) => {
  const user = c.get('user');
  const seasonId = c.req.param('id');
  const body = await c.req.json<{ name?: string; description?: string }>();

  const existing = await c.env.DB.prepare(
    'SELECT * FROM seasons WHERE id = ?'
  ).bind(seasonId).first();

  if (!existing) return c.json({ error: 'Sezóna nenalezena' }, 404);
  if (existing.owner_id !== user.id) return c.json({ error: 'Přístup odepřen' }, 403);

  if (body.name !== undefined) {
    const trimmed = body.name.trim();
    if (!trimmed) return c.json({ error: 'Název je povinný' }, 400);
    if (trimmed.length > 100) return c.json({ error: 'Název může mít maximálně 100 znaků' }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const name = body.name !== undefined ? body.name.trim() : existing.name;
  const description = body.description !== undefined ? (body.description.trim() || null) : existing.description;

  await c.env.DB.prepare(
    `UPDATE seasons SET name = ?, description = ?, updated_at = ? WHERE id = ?`
  ).bind(name, description, now, seasonId).run();

  const updated = await c.env.DB.prepare(
    'SELECT * FROM seasons WHERE id = ?'
  ).bind(seasonId).first();
  return c.json({ season: updated });
});

// Delete season + cascade child databases (games drop via FK ON DELETE CASCADE)
seasons.delete('/:id', authRequired, async (c) => {
  const user = c.get('user');
  const seasonId = c.req.param('id');

  const existing = await c.env.DB.prepare(
    'SELECT * FROM seasons WHERE id = ?'
  ).bind(seasonId).first();

  if (!existing) return c.json({ error: 'Sezóna nenalezena' }, 404);
  if (existing.owner_id !== user.id) return c.json({ error: 'Přístup odepřen' }, 403);

  await c.env.DB.prepare(
    'DELETE FROM databases WHERE season_id = ? AND owner_id = ?'
  ).bind(seasonId, user.id).run();
  await c.env.DB.prepare(
    'DELETE FROM seasons WHERE id = ?'
  ).bind(seasonId).run();

  return c.json({ ok: true });
});

export { seasons };
