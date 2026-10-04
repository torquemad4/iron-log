-- Iron Log — D1 schema
-- One row per set, one row per session. The set table is the truth;
-- the session table carries how it felt. D1 is the whole record.

CREATE TABLE IF NOT EXISTS sets (
  id         TEXT PRIMARY KEY,      -- client-generated, makes retries idempotent
  date       TEXT NOT NULL,         -- YYYY-MM-DD, local date of the session
  day        TEXT NOT NULL,         -- mon|tue|wed|thu|fri|sat|sun
  exercise   TEXT NOT NULL,
  set_index  INTEGER NOT NULL,
  reps       INTEGER NOT NULL,
  weight     REAL    NOT NULL,
  ts         TEXT    NOT NULL,      -- ISO timestamp the set was PERFORMED; an edit never moves it
  edited_at  TEXT,                  -- set only when a logged set is corrected; the last-write-wins clock
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
  PRIMARY KEY (date, day)
);

-- ------------------------------------------------------------------ PLANNER
-- The exercise library. Seeded below from what programme.js already prescribes;
-- Sophie adds to it from the Planner tab. `weight` is the suggested load — kg,
-- or a nominal band level when kind = 'banded'.
CREATE TABLE IF NOT EXISTS exercises (
  name       TEXT PRIMARY KEY COLLATE NOCASE,
  kind       TEXT    NOT NULL DEFAULT 'weighted',   -- weighted|banded
  sets       INTEGER NOT NULL DEFAULT 3,
  reps       TEXT    NOT NULL DEFAULT '8-12',       -- "8-12", "15", "AMRAP"
  weight     REAL,                                  -- suggested load, may be null
  rest       INTEGER NOT NULL DEFAULT 75,
  step       REAL,                                  -- +/- increment; null = default
  side       INTEGER NOT NULL DEFAULT 0,            -- 1 = logged per arm/side
  muscle     TEXT,                                  -- Chest|Back|Shoulders|Traps|Biceps|Triceps|Legs|Core|Full body
  equipment  TEXT,                                  -- barbell|dumbbell|band|bodyweight|kettlebell|other
  added_by   TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- A weekly template: every day has a morning slot and a bonus slot. A slot only
-- reaches the Log tab once it is LOCKED — an unlocked slot is Sophie's draft.
-- `exercises` is a JSON array of {name, sets, reps, weight}, copied from the
-- library when added so a slot can prescribe differently from the default.
CREATE TABLE IF NOT EXISTS plan_slots (
  day        TEXT NOT NULL,                         -- mon|tue|wed|thu|fri|sat|sun
  slot       TEXT NOT NULL,                         -- morning|bonus
  exercises  TEXT NOT NULL DEFAULT '[]',
  locked     INTEGER NOT NULL DEFAULT 0,
  locked_at  TEXT,
  locked_by  TEXT,
  updated_at TEXT,
  updated_by TEXT,
  PRIMARY KEY (day, slot)
);

-- Historical rep maxes: the heaviest load moved for a given number of reps, on
-- a date. Imported from Trainerize; Iron Log's own sets are folded in at read
-- time by /api/rep-maxes rather than copied here, so there is one truth for each.
-- The id is derived from the row's content, so re-importing the same export
-- writes nothing the second time.
CREATE TABLE IF NOT EXISTS rep_maxes (
  id         TEXT PRIMARY KEY,
  exercise   TEXT    NOT NULL COLLATE NOCASE,
  reps       INTEGER NOT NULL,
  weight     REAL    NOT NULL,
  date       TEXT    NOT NULL,                      -- YYYY-MM-DD
  source     TEXT    NOT NULL DEFAULT 'trainerize',
  note       TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rep_maxes_ex ON rep_maxes(exercise, reps, weight);

-- Seed the library from programme.js. INSERT OR IGNORE, so this runs on every
-- deploy without touching anything Sophie has since changed. (A database made
-- before 27 Sep 2026 needs migrations/2026-09-27-exercise-tags.sql first.)
INSERT OR IGNORE INTO exercises (name, kind, sets, reps, rest, step, side, muscle, equipment) VALUES
  ('Single-Arm DB Row',            'weighted', 3, '8-12',  90, 2,   1, 'Back',      'dumbbell'),
  ('Leaning DB Lateral Raise',     'weighted', 3, '12-15', 60, 1,   0, 'Shoulders', 'dumbbell'),
  ('Band Face Pull',               'banded',   4, '15-20', 60, 1,   0, 'Shoulders', 'band'),
  ('Banded Lat Pulldown',          'banded',   3, '10-15', 75, 1,   0, 'Back',      'band'),
  ('DB Lateral Raise',             'weighted', 3, '12-15', 60, 1,   0, 'Shoulders', 'dumbbell'),
  ('DB Curl',                      'weighted', 3, '8-12',  75, 1,   0, 'Biceps',    'dumbbell'),
  ('Incline DB Flye',              'weighted', 3, '10-15', 75, 1,   0, 'Chest',     'dumbbell'),
  ('Rear Delt Flye',               'weighted', 3, '15-20', 60, 1,   0, 'Shoulders', 'dumbbell'),
  ('Hammer Curl',                  'weighted', 3, '10-12', 60, 1,   0, 'Biceps',    'dumbbell'),
  ('Skull Crusher',                'weighted', 3, '10-12', 75, 2.5, 0, 'Triceps',   'barbell'),
  ('Banded Straight-Arm Pulldown', 'banded',   3, '10-15', 60, 1,   0, 'Back',      'band'),
  ('Incline DB Press',             'weighted', 3, '8-12',  75, 2,   0, 'Chest',     'dumbbell');

-- The programme of 3 Oct 2026. Lifts it shares with the library above (DB Curl,
-- Skull Crusher, Rear Delt Flye, Hammer Curl, Single-Arm DB Row, Banded Lat
-- Pulldown) keep their existing rows, and their history. INSERT OR IGNORE, so a
-- row already there — Barbell Back Squat, say, from the Trainerize import — is
-- left exactly as it is.
INSERT OR IGNORE INTO exercises (name, kind, sets, reps, rest, step, side, muscle, equipment) VALUES
  ('Close-Grip Floor Press',          'weighted', 4, '8-12',  90,  2.5, 0, 'Chest',     'barbell'),
  ('One-Arm DB Lateral Raise',        'weighted', 3, '12-20', 60,  1,   1, 'Shoulders', 'dumbbell'),
  ('Barbell Shrug',                   'weighted', 4, '10-15', 75,  2.5, 0, 'Traps',     'barbell'),
  ('Barbell Bicep Curl',              'weighted', 3, '8-12',  75,  2.5, 0, 'Biceps',    'barbell'),
  ('Neutral-Grip DB Overhead Press',  'weighted', 3, '8-12',  90,  2,   0, 'Shoulders', 'dumbbell'),
  ('Barbell Back Squat',              'weighted', 3, '6-10',  150, 2.5, 0, 'Legs',      'barbell'),
  ('Barbell Deadlift',                'weighted', 3, '5-8',   180, 5,   0, 'Legs',      'barbell'),
  ('Band Pull-Apart',                 'banded',   2, '15-20', 30,  1,   0, 'Shoulders', 'band'),
  ('Side-Lying DB External Rotation', 'weighted', 2, '12-15', 30,  1,   1, 'Shoulders', 'dumbbell');
