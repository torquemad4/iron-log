-- Iron Log — D1 schema
-- One row per set, one row per session. The set table is the truth;
-- the session table carries how it felt and where it landed in Notion.

CREATE TABLE IF NOT EXISTS sets (
  id         TEXT PRIMARY KEY,      -- client-generated, makes retries idempotent
  date       TEXT NOT NULL,         -- YYYY-MM-DD, local date of the session
  day        TEXT NOT NULL,         -- mon|tue|wed|thu|fri|sat|sun
  exercise   TEXT NOT NULL,
  set_index  INTEGER NOT NULL,
  reps       INTEGER NOT NULL,
  weight     REAL    NOT NULL,
  ts         TEXT    NOT NULL,      -- ISO timestamp the set was logged
  created_at TEXT    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sets_date     ON sets(date);
CREATE INDEX IF NOT EXISTS idx_sets_day_date ON sets(day, date);
CREATE INDEX IF NOT EXISTS idx_sets_exercise ON sets(exercise, ts);

CREATE TABLE IF NOT EXISTS sessions (
  date           TEXT NOT NULL,
  day            TEXT NOT NULL,
  started_at     TEXT,
  ended_at       TEXT,
  bodyweight     REAL,
  felt           TEXT,
  notes          TEXT,
  notion_page_id TEXT,
  PRIMARY KEY (date, day)
);
