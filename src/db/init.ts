import { rawDb } from './client';

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  primary_muscle TEXT NOT NULL,
  secondary_muscles TEXT,
  equipment TEXT,
  instructions TEXT,
  is_custom INTEGER DEFAULT 0,
  is_archived INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exercises_muscle ON exercises(primary_muscle);
CREATE INDEX IF NOT EXISTS idx_exercises_category ON exercises(category);

CREATE TABLE IF NOT EXISTS workouts (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_seconds INTEGER,
  notes TEXT,
  program_instance_id TEXT,
  program_week INTEGER,
  program_day INTEGER,
  total_volume REAL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workouts_started ON workouts(started_at);
CREATE INDEX IF NOT EXISTS idx_workouts_program ON workouts(program_instance_id);

CREATE TABLE IF NOT EXISTS workout_exercises (
  id TEXT PRIMARY KEY NOT NULL,
  workout_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  notes TEXT,
  rest_seconds INTEGER
);
CREATE INDEX IF NOT EXISTS idx_we_workout ON workout_exercises(workout_id);
CREATE INDEX IF NOT EXISTS idx_we_exercise ON workout_exercises(exercise_id);

CREATE TABLE IF NOT EXISTS sets (
  id TEXT PRIMARY KEY NOT NULL,
  workout_exercise_id TEXT NOT NULL,
  set_number INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'working',
  weight REAL,
  reps INTEGER,
  rpe REAL,
  is_completed INTEGER DEFAULT 0,
  completed_at TEXT,
  is_pr INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sets_we ON sets(workout_exercise_id);

CREATE TABLE IF NOT EXISTS personal_records (
  id TEXT PRIMARY KEY NOT NULL,
  exercise_id TEXT NOT NULL,
  type TEXT NOT NULL,
  value REAL NOT NULL,
  set_id TEXT,
  achieved_at TEXT NOT NULL,
  previous_value REAL
);
CREATE INDEX IF NOT EXISTS idx_pr_exercise ON personal_records(exercise_id);
CREATE INDEX IF NOT EXISTS idx_pr_exercise_type ON personal_records(exercise_id, type);

CREATE TABLE IF NOT EXISTS programs (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  num_weeks INTEGER NOT NULL,
  days_per_week INTEGER NOT NULL,
  difficulty TEXT,
  is_built_in INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS program_days (
  id TEXT PRIMARY KEY NOT NULL,
  program_id TEXT NOT NULL,
  week_number INTEGER NOT NULL,
  day_number INTEGER NOT NULL,
  name TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pd_program ON program_days(program_id);

CREATE TABLE IF NOT EXISTS program_exercises (
  id TEXT PRIMARY KEY NOT NULL,
  program_day_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  target_sets INTEGER,
  target_reps TEXT,
  target_rpe REAL,
  rest_seconds INTEGER,
  notes TEXT,
  progression_rule TEXT
);
CREATE INDEX IF NOT EXISTS idx_pe_day ON program_exercises(program_day_id);

CREATE TABLE IF NOT EXISTS program_instances (
  id TEXT PRIMARY KEY NOT NULL,
  program_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  current_week INTEGER DEFAULT 1,
  current_day INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS body_weight_log (
  id TEXT PRIMARY KEY NOT NULL,
  weight REAL NOT NULL,
  date TEXT NOT NULL,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_bw_date ON body_weight_log(date);
`;

/**
 * Initialize the database: run migrations and seed if needed.
 * Call this once at app startup.
 */
export async function initDatabase() {
  const statements = MIGRATION_SQL
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    rawDb.execSync(stmt + ';');
  }
}
