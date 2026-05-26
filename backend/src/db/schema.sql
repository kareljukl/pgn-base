CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  avatar_url  TEXT,
  role        TEXT DEFAULT 'user',
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS seasons (
  id                    TEXT PRIMARY KEY,
  owner_id              TEXT NOT NULL REFERENCES users(id),
  name                  TEXT NOT NULL,
  description           TEXT,
  chesscz_comp_id       INTEGER NOT NULL,
  chesscz_team_id       INTEGER NOT NULL,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seasons_owner ON seasons(owner_id);

CREATE TABLE IF NOT EXISTS databases (
  id                    TEXT PRIMARY KEY,
  owner_id              TEXT NOT NULL REFERENCES users(id),
  name                  TEXT NOT NULL,
  description           TEXT,
  is_public             INTEGER DEFAULT 0,
  import_source         TEXT DEFAULT 'manual',
  chesscz_comp_id       INTEGER,
  chesscz_round_nr      INTEGER,
  chesscz_home_team_id  INTEGER,
  chesscz_away_team_id  INTEGER,
  season_id             TEXT REFERENCES seasons(id),
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
  id             TEXT PRIMARY KEY,
  database_id    TEXT NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
  event          TEXT,
  site           TEXT,
  date           TEXT,
  round          TEXT,
  board          TEXT,
  white          TEXT,
  black          TEXT,
  white_elo      INTEGER,
  black_elo      INTEGER,
  white_fide_elo INTEGER,
  black_fide_elo INTEGER,
  white_cze_elo  INTEGER,
  black_cze_elo  INTEGER,
  white_team     TEXT,
  black_team     TEXT,
  white_fide_id  TEXT,
  black_fide_id  TEXT,
  white_cze_id    TEXT,
  black_cze_id    TEXT,
  result         TEXT,
  eco            TEXT,
  ply_count      INTEGER,
  moves_pgn      TEXT NOT NULL DEFAULT '',
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chesscz_player (
  cze_id          INTEGER PRIMARY KEY,
  fide_id         INTEGER,
  full_name       TEXT,
  first_name      TEXT,
  last_name       TEXT,
  club_id         TEXT,
  club_name       TEXT,
  birth_year      INTEGER,
  gender          TEXT,
  player_class    TEXT,
  cze_std_elo     INTEGER,
  cze_rapid_elo   INTEGER,
  fide_std_elo    INTEGER,
  fide_rapid_elo  INTEGER,
  fide_blitz_elo  INTEGER,
  raw_json        TEXT NOT NULL,
  fetched_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chesscz_player_fide_id ON chesscz_player(fide_id);
CREATE INDEX IF NOT EXISTS idx_chesscz_player_full_name ON chesscz_player(full_name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS chesscz_search (
  query_norm    TEXT PRIMARY KEY,
  result_ids    TEXT NOT NULL,
  fetched_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chesscz_rate (
  id              INTEGER PRIMARY KEY,
  last_fetch_at   INTEGER NOT NULL DEFAULT 0,
  blocked_until   INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO chesscz_rate (id, last_fetch_at, blocked_until) VALUES (1, 0, 0);

CREATE TABLE IF NOT EXISTS chesscz_cache (
  cache_key   TEXT PRIMARY KEY,
  payload     TEXT NOT NULL,
  ttl_ms      INTEGER NOT NULL,
  fetched_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_games_database_id ON games(database_id);
CREATE INDEX IF NOT EXISTS idx_games_white ON games(white COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_games_black ON games(black COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_games_date ON games(date);
CREATE INDEX IF NOT EXISTS idx_databases_owner ON databases(owner_id);
CREATE INDEX IF NOT EXISTS idx_databases_public ON databases(is_public);
CREATE INDEX IF NOT EXISTS idx_databases_season ON databases(season_id);
