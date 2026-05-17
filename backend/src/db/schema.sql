CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  avatar_url  TEXT,
  role        TEXT DEFAULT 'user',
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS databases (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id),
  name        TEXT NOT NULL,
  description TEXT,
  is_public   INTEGER DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
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

CREATE INDEX IF NOT EXISTS idx_games_database_id ON games(database_id);
CREATE INDEX IF NOT EXISTS idx_games_white ON games(white COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_games_black ON games(black COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_games_date ON games(date);
CREATE INDEX IF NOT EXISTS idx_databases_owner ON databases(owner_id);
CREATE INDEX IF NOT EXISTS idx_databases_public ON databases(is_public);
