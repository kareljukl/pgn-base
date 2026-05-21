import { Hono } from 'hono';
import { authRequired } from '../middleware/auth';
import type { AppEnv } from '../types';

const chesscz = new Hono<AppEnv>();

const MIN_QUERY_LEN = 4;
const SEARCH_TTL_MS = 7 * 24 * 3600 * 1000;
const PLAYER_TTL_MS = 30 * 24 * 3600 * 1000;
const COMP_DETAILS_TTL_MS = 24 * 3600 * 1000;
const COMP_TABLE_TTL_MS = 3600 * 1000;
const COMP_SCHEDULE_TTL_MS = 24 * 3600 * 1000;
const COMP_MATCHES_TTL_MS = 30 * 60 * 1000;
const RATE_MIN_GAP_MS = 10_000;
const MAX_WAIT_FOR_SLOT_MS = 12_000;
const BLOCK_DURATION_MS = 3_600_000;
const SSCR_FETCH_TIMEOUT_MS = 10_000;
const SSCR_BASE = 'https://api.chess.cz/api';

type SscrMember = {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  czeId?: number;
  fideId?: number;
  clubId?: string | number;
  clubName?: string;
  birthYear?: number;
  gender?: string;
  playerClass?: string;
  czeStdElo?: number;
  czeRapidElo?: number;
  fideStdElo?: number;
  fideRapidElo?: number;
  fideBlitzElo?: number;
};

type PlayerRow = {
  cze_id: number;
  fide_id: number | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  club_id: string | null;
  club_name: string | null;
  birth_year: number | null;
  gender: string | null;
  player_class: string | null;
  cze_std_elo: number | null;
  cze_rapid_elo: number | null;
  fide_std_elo: number | null;
  fide_rapid_elo: number | null;
  fide_blitz_elo: number | null;
  fetched_at: number;
};

type PlayerHit = {
  czeId: number;
  fideId: number | null;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  clubId: string | null;
  clubName: string | null;
  birthYear: number | null;
  czeStdElo: number | null;
  czeRapidElo: number | null;
  fideStdElo: number | null;
  fideRapidElo: number | null;
  fideBlitzElo: number | null;
  fetchedAt: number;
};

function rowToHit(r: PlayerRow): PlayerHit {
  return {
    czeId: r.cze_id,
    fideId: r.fide_id,
    fullName: r.full_name,
    firstName: r.first_name,
    lastName: r.last_name,
    clubId: r.club_id,
    clubName: r.club_name,
    birthYear: r.birth_year,
    czeStdElo: r.cze_std_elo,
    czeRapidElo: r.cze_rapid_elo,
    fideStdElo: r.fide_std_elo,
    fideRapidElo: r.fide_rapid_elo,
    fideBlitzElo: r.fide_blitz_elo,
    fetchedAt: r.fetched_at,
  };
}

async function acquireSlot(db: D1Database): Promise<'ok' | 'blocked' | 'throttled'> {
  const now = Date.now();
  const row = await db
    .prepare('SELECT blocked_until FROM chesscz_rate WHERE id = 1')
    .first<{ blocked_until: number }>();
  if (row && row.blocked_until > now) return 'blocked';

  const res = await db
    .prepare('UPDATE chesscz_rate SET last_fetch_at = ? WHERE id = 1 AND last_fetch_at <= ?')
    .bind(now, now - RATE_MIN_GAP_MS)
    .run();

  return (res.meta?.changes ?? 0) > 0 ? 'ok' : 'throttled';
}

async function acquireSlotWithWait(db: D1Database): Promise<'ok' | 'blocked' | 'throttled'> {
  const startedAt = Date.now();
  while (true) {
    const slot = await acquireSlot(db);
    if (slot === 'ok' || slot === 'blocked') return slot;

    const row = await db
      .prepare('SELECT last_fetch_at FROM chesscz_rate WHERE id = 1')
      .first<{ last_fetch_at: number }>();
    if (!row) return 'throttled';

    const waitMs = row.last_fetch_at + RATE_MIN_GAP_MS - Date.now() + 100;
    if (waitMs <= 0) continue;

    const elapsed = Date.now() - startedAt;
    const remaining = MAX_WAIT_FOR_SLOT_MS - elapsed;
    if (remaining <= 0) return 'throttled';

    await new Promise((r) => setTimeout(r, Math.min(waitMs, remaining)));
  }
}

async function markBlocked(db: D1Database): Promise<void> {
  await db
    .prepare('UPDATE chesscz_rate SET blocked_until = ? WHERE id = 1')
    .bind(Date.now() + BLOCK_DURATION_MS)
    .run();
}

async function fetchSscr(path: string): Promise<unknown> {
  const url = `${SSCR_BASE}${path}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(SSCR_FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`SSCR ${res.status}`);
  }
  return res.json();
}

function normalizeMembers(data: unknown): SscrMember[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as SscrMember[];
  return [data as SscrMember];
}

async function upsertPlayers(db: D1Database, members: SscrMember[]): Promise<number[]> {
  const now = Date.now();
  const ids: number[] = [];
  const stmt = db.prepare(
    `INSERT INTO chesscz_player
       (cze_id, fide_id, full_name, first_name, last_name, club_id, club_name,
        birth_year, gender, player_class,
        cze_std_elo, cze_rapid_elo, fide_std_elo, fide_rapid_elo, fide_blitz_elo,
        raw_json, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(cze_id) DO UPDATE SET
       fide_id = excluded.fide_id,
       full_name = excluded.full_name,
       first_name = excluded.first_name,
       last_name = excluded.last_name,
       club_id = excluded.club_id,
       club_name = excluded.club_name,
       birth_year = excluded.birth_year,
       gender = excluded.gender,
       player_class = excluded.player_class,
       cze_std_elo = excluded.cze_std_elo,
       cze_rapid_elo = excluded.cze_rapid_elo,
       fide_std_elo = excluded.fide_std_elo,
       fide_rapid_elo = excluded.fide_rapid_elo,
       fide_blitz_elo = excluded.fide_blitz_elo,
       raw_json = excluded.raw_json,
       fetched_at = excluded.fetched_at`
  );

  const trim = (v: string | undefined | null) => (v != null ? v.trim() || null : null);
  const batch = members
    .filter((m) => typeof m.czeId === 'number')
    .map((m) => {
      ids.push(m.czeId!);
      return stmt.bind(
        m.czeId,
        m.fideId ?? null,
        trim(m.fullName),
        trim(m.firstName),
        trim(m.lastName),
        m.clubId != null ? String(m.clubId).trim() || null : null,
        trim(m.clubName),
        m.birthYear ?? null,
        m.gender ?? null,
        m.playerClass ?? null,
        m.czeStdElo ?? null,
        m.czeRapidElo ?? null,
        m.fideStdElo ?? null,
        m.fideRapidElo ?? null,
        m.fideBlitzElo ?? null,
        JSON.stringify(m),
        now
      );
    });

  if (batch.length > 0) {
    await db.batch(batch);
  }
  return ids;
}

async function loadPlayersByIds(db: D1Database, ids: number[]): Promise<PlayerHit[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db
    .prepare(`SELECT * FROM chesscz_player WHERE cze_id IN (${placeholders})`)
    .bind(...ids)
    .all<PlayerRow>();
  const byId = new Map<number, PlayerRow>();
  for (const r of rows.results) byId.set(r.cze_id, r);
  return ids.map((id) => byId.get(id)).filter((r): r is PlayerRow => !!r).map(rowToHit);
}

// GET /search?q=...
chesscz.get('/search', authRequired, async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (q.length < MIN_QUERY_LEN) {
    return c.json({ error: `Minimální délka dotazu je ${MIN_QUERY_LEN} znaků` }, 400);
  }
  const qNorm = q.toLowerCase();
  const now = Date.now();

  // Vrstva 1: search cache
  const cached = await c.env.DB
    .prepare('SELECT result_ids, fetched_at FROM chesscz_search WHERE query_norm = ?')
    .bind(qNorm)
    .first<{ result_ids: string; fetched_at: number }>();

  if (cached && now - cached.fetched_at < SEARCH_TTL_MS) {
    const ids = JSON.parse(cached.result_ids) as number[];
    const players = await loadPlayersByIds(c.env.DB, ids);
    return c.json({ players, fetchedAt: cached.fetched_at, stale: false });
  }

  // Vrstva 2: rate-limit gate (wait-and-retry up to ~12s)
  const slot = await acquireSlotWithWait(c.env.DB);
  if (slot === 'blocked') {
    if (cached) {
      const ids = JSON.parse(cached.result_ids) as number[];
      const players = await loadPlayersByIds(c.env.DB, ids);
      return c.json({ players, fetchedAt: cached.fetched_at, stale: true });
    }
    return c.json({ error: 'ŠSČR dočasně nedostupné, zkus to později' }, 503);
  }
  if (slot === 'throttled') {
    if (cached) {
      const ids = JSON.parse(cached.result_ids) as number[];
      const players = await loadPlayersByIds(c.env.DB, ids);
      c.header('X-Stale-Cache', 'true');
      return c.json({ players, fetchedAt: cached.fetched_at, stale: true });
    }
    c.header('Retry-After', '20');
    return c.json({ error: 'Vyhledávání právě probíhá, zkus za chvíli' }, 429);
  }

  // Vrstva 3: fetch
  let data: unknown;
  try {
    data = await fetchSscr(`/members/name?search=${encodeURIComponent(q)}`);
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      await markBlocked(c.env.DB);
      return c.json({ error: 'ŠSČR timeout, dočasně blokujeme' }, 503);
    }
    return c.json({ error: 'Chyba volání ŠSČR' }, 502);
  }

  const members = normalizeMembers(data);
  const ids = await upsertPlayers(c.env.DB, members);

  await c.env.DB
    .prepare(
      `INSERT INTO chesscz_search (query_norm, result_ids, fetched_at) VALUES (?, ?, ?)
       ON CONFLICT(query_norm) DO UPDATE SET result_ids = excluded.result_ids, fetched_at = excluded.fetched_at`
    )
    .bind(qNorm, JSON.stringify(ids), now)
    .run();

  const players = await loadPlayersByIds(c.env.DB, ids);
  return c.json({ players, fetchedAt: now, stale: false });
});

async function getOrFetchPlayer(
  db: D1Database,
  type: 'cze' | 'fide',
  id: number,
  forceRefresh: boolean
): Promise<{ status: number; body: Record<string, unknown> }> {
  const now = Date.now();
  const idColumn = type === 'cze' ? 'cze_id' : 'fide_id';
  const row = await db
    .prepare(`SELECT * FROM chesscz_player WHERE ${idColumn} = ? LIMIT 1`)
    .bind(id)
    .first<PlayerRow>();

  if (row && !forceRefresh && now - row.fetched_at < PLAYER_TTL_MS) {
    return { status: 200, body: { player: rowToHit(row), stale: false } };
  }

  const slot = await acquireSlotWithWait(db);
  if (slot === 'blocked') {
    if (row) return { status: 200, body: { player: rowToHit(row), stale: true } };
    return { status: 503, body: { error: 'ŠSČR dočasně nedostupné' } };
  }
  if (slot === 'throttled') {
    if (row) return { status: 200, body: { player: rowToHit(row), stale: true } };
    return { status: 429, body: { error: 'Vyhledávání právě probíhá, zkus za chvíli' } };
  }

  let data: unknown;
  try {
    data = await fetchSscr(`/members/${id}/${type}`);
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      await markBlocked(db);
      if (row) return { status: 200, body: { player: rowToHit(row), stale: true } };
      return { status: 503, body: { error: 'ŠSČR timeout' } };
    }
    if (row) return { status: 200, body: { player: rowToHit(row), stale: true } };
    return { status: 502, body: { error: 'Chyba volání ŠSČR' } };
  }

  const members = normalizeMembers(data);
  if (members.length === 0) {
    return { status: 404, body: { error: 'Hráč nenalezen' } };
  }
  await upsertPlayers(db, members);
  const fresh = await db
    .prepare(`SELECT * FROM chesscz_player WHERE ${idColumn} = ? LIMIT 1`)
    .bind(id)
    .first<PlayerRow>();
  if (!fresh) return { status: 404, body: { error: 'Hráč nenalezen po fetch' } };
  return { status: 200, body: { player: rowToHit(fresh), stale: false } };
}

// GET /player/cze/:czeId
chesscz.get('/player/cze/:czeId', authRequired, async (c) => {
  const id = parseInt(c.req.param('czeId'));
  if (!Number.isFinite(id) || id <= 0) {
    return c.json({ error: 'Neplatné Cze ID' }, 400);
  }
  const refresh = c.req.query('refresh') === 'true';
  const r = await getOrFetchPlayer(c.env.DB, 'cze', id, refresh);
  return c.json(r.body, r.status as 200 | 400 | 401 | 404 | 429 | 502 | 503);
});

// GET /player/fide/:fideId
chesscz.get('/player/fide/:fideId', authRequired, async (c) => {
  const id = parseInt(c.req.param('fideId'));
  if (!Number.isFinite(id) || id <= 0) {
    return c.json({ error: 'Neplatné FIDE ID' }, 400);
  }
  const refresh = c.req.query('refresh') === 'true';
  const r = await getOrFetchPlayer(c.env.DB, 'fide', id, refresh);
  return c.json(r.body, r.status as 200 | 400 | 401 | 404 | 429 | 502 | 503);
});

type CacheRow = { payload: string; fetched_at: number };

type CachedResult = {
  status: number;
  body: Record<string, unknown>;
};

async function readCache(db: D1Database, key: string): Promise<CacheRow | null> {
  const row = await db
    .prepare('SELECT payload, fetched_at FROM chesscz_cache WHERE cache_key = ?')
    .bind(key)
    .first<CacheRow>();
  return row ?? null;
}

async function writeCache(
  db: D1Database,
  key: string,
  payload: unknown,
  ttlMs: number,
  fetchedAt: number
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO chesscz_cache (cache_key, payload, ttl_ms, fetched_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         payload = excluded.payload,
         ttl_ms = excluded.ttl_ms,
         fetched_at = excluded.fetched_at`
    )
    .bind(key, JSON.stringify(payload), ttlMs, fetchedAt)
    .run();
}

async function cachedFetchSscr(
  db: D1Database,
  cacheKey: string,
  path: string,
  ttlMs: number
): Promise<CachedResult> {
  const now = Date.now();
  const cached = await readCache(db, cacheKey);

  if (cached && now - cached.fetched_at < ttlMs) {
    return {
      status: 200,
      body: { data: JSON.parse(cached.payload), fetchedAt: cached.fetched_at, stale: false },
    };
  }

  const slot = await acquireSlotWithWait(db);
  if (slot === 'blocked') {
    if (cached) {
      return {
        status: 200,
        body: { data: JSON.parse(cached.payload), fetchedAt: cached.fetched_at, stale: true },
      };
    }
    return { status: 503, body: { error: 'ŠSČR dočasně nedostupné' } };
  }
  if (slot === 'throttled') {
    if (cached) {
      return {
        status: 200,
        body: { data: JSON.parse(cached.payload), fetchedAt: cached.fetched_at, stale: true },
      };
    }
    return { status: 429, body: { error: 'Vyhledávání právě probíhá, zkus za chvíli' } };
  }

  let data: unknown;
  try {
    data = await fetchSscr(path);
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      await markBlocked(db);
      if (cached) {
        return {
          status: 200,
          body: { data: JSON.parse(cached.payload), fetchedAt: cached.fetched_at, stale: true },
        };
      }
      return { status: 503, body: { error: 'ŠSČR timeout' } };
    }
    if (cached) {
      return {
        status: 200,
        body: { data: JSON.parse(cached.payload), fetchedAt: cached.fetched_at, stale: true },
      };
    }
    return { status: 502, body: { error: 'Chyba volání ŠSČR' } };
  }

  await writeCache(db, cacheKey, data, ttlMs, now);
  return { status: 200, body: { data, fetchedAt: now, stale: false } };
}

function parseIdParam(v: string): number | null {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

// GET /competitions/:compId/details
chesscz.get('/competitions/:compId/details', authRequired, async (c) => {
  const compId = parseIdParam(c.req.param('compId'));
  if (compId === null) return c.json({ error: 'Neplatné compId' }, 400);
  const r = await cachedFetchSscr(
    c.env.DB,
    `comp:${compId}:details`,
    `/competitions/${compId}/details`,
    COMP_DETAILS_TTL_MS
  );
  return c.json(r.body, r.status as 200 | 400 | 401 | 429 | 502 | 503);
});

// GET /competitions/:compId/table
chesscz.get('/competitions/:compId/table', authRequired, async (c) => {
  const compId = parseIdParam(c.req.param('compId'));
  if (compId === null) return c.json({ error: 'Neplatné compId' }, 400);
  const r = await cachedFetchSscr(
    c.env.DB,
    `comp:${compId}:table`,
    `/competitions/${compId}/table`,
    COMP_TABLE_TTL_MS
  );
  return c.json(r.body, r.status as 200 | 400 | 401 | 429 | 502 | 503);
});

// GET /competitions/:compId/team/:teamId/schedule
chesscz.get('/competitions/:compId/team/:teamId/schedule', authRequired, async (c) => {
  const compId = parseIdParam(c.req.param('compId'));
  const teamId = parseIdParam(c.req.param('teamId'));
  if (compId === null) return c.json({ error: 'Neplatné compId' }, 400);
  if (teamId === null) return c.json({ error: 'Neplatné teamId' }, 400);
  const r = await cachedFetchSscr(
    c.env.DB,
    `comp:${compId}:team:${teamId}:schedule`,
    `/competitions/${compId}/team/${teamId}/schedule`,
    COMP_SCHEDULE_TTL_MS
  );
  return c.json(r.body, r.status as 200 | 400 | 401 | 429 | 502 | 503);
});

// GET /competitions/:compId/schedule
chesscz.get('/competitions/:compId/schedule', authRequired, async (c) => {
  const compId = parseIdParam(c.req.param('compId'));
  if (compId === null) return c.json({ error: 'Neplatné compId' }, 400);
  const r = await cachedFetchSscr(
    c.env.DB,
    `comp:${compId}:schedule`,
    `/competitions/${compId}/schedule`,
    COMP_SCHEDULE_TTL_MS
  );
  return c.json(r.body, r.status as 200 | 400 | 401 | 429 | 502 | 503);
});

// GET /competitions/:compId/round/:round/schedule
chesscz.get('/competitions/:compId/round/:round/schedule', authRequired, async (c) => {
  const compId = parseIdParam(c.req.param('compId'));
  const round = parseIdParam(c.req.param('round'));
  if (compId === null) return c.json({ error: 'Neplatné compId' }, 400);
  if (round === null) return c.json({ error: 'Neplatné kolo' }, 400);
  const r = await cachedFetchSscr(
    c.env.DB,
    `comp:${compId}:round:${round}:schedule`,
    `/competitions/${compId}/round/${round}/schedule`,
    COMP_SCHEDULE_TTL_MS
  );
  return c.json(r.body, r.status as 200 | 400 | 401 | 429 | 502 | 503);
});

// GET /competitions/:compId/round/:round/matches
chesscz.get('/competitions/:compId/round/:round/matches', authRequired, async (c) => {
  const compId = parseIdParam(c.req.param('compId'));
  const round = parseIdParam(c.req.param('round'));
  if (compId === null) return c.json({ error: 'Neplatné compId' }, 400);
  if (round === null) return c.json({ error: 'Neplatné kolo' }, 400);
  const r = await cachedFetchSscr(
    c.env.DB,
    `comp:${compId}:round:${round}:matches`,
    `/competitions/${compId}/round/${round}/matches`,
    COMP_MATCHES_TTL_MS
  );
  return c.json(r.body, r.status as 200 | 400 | 401 | 429 | 502 | 503);
});

export { chesscz };
