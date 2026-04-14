import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

// ── EXERCISES ──

export const exercises = sqliteTable('exercises', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(), // barbell | dumbbell | machine | cable | bodyweight | smith_machine | cardio | other
  primaryMuscle: text('primary_muscle').notNull(),
  secondaryMuscles: text('secondary_muscles'), // JSON array: '["triceps","front_delts"]'
  equipment: text('equipment'),
  instructions: text('instructions'),
  isCustom: integer('is_custom').default(0),
  isArchived: integer('is_archived').default(0),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_exercises_muscle').on(table.primaryMuscle),
  index('idx_exercises_category').on(table.category),
]);

// ── WORKOUTS ──

export const workouts = sqliteTable('workouts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  durationSeconds: integer('duration_seconds'),
  notes: text('notes'),
  programInstanceId: text('program_instance_id'),
  programWeek: integer('program_week'),
  programDay: integer('program_day'),
  totalVolume: real('total_volume'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_workouts_started').on(table.startedAt),
  index('idx_workouts_program').on(table.programInstanceId),
]);

// ── WORKOUT EXERCISES ──

export const workoutExercises = sqliteTable('workout_exercises', {
  id: text('id').primaryKey(),
  workoutId: text('workout_id').notNull(),
  exerciseId: text('exercise_id').notNull(),
  sortOrder: integer('sort_order').notNull(),
  notes: text('notes'),
  restSeconds: integer('rest_seconds'),
}, (table) => [
  index('idx_we_workout').on(table.workoutId),
  index('idx_we_exercise').on(table.exerciseId),
]);

// ── SETS ──

export const sets = sqliteTable('sets', {
  id: text('id').primaryKey(),
  workoutExerciseId: text('workout_exercise_id').notNull(),
  setNumber: integer('set_number').notNull(),
  type: text('type').notNull().default('working'), // warmup | working | dropset | failure
  weight: real('weight'),
  reps: integer('reps'),
  rpe: real('rpe'),
  isCompleted: integer('is_completed').default(0),
  completedAt: text('completed_at'),
  isPersonalRecord: integer('is_pr').default(0),
}, (table) => [
  index('idx_sets_we').on(table.workoutExerciseId),
]);

// ── PERSONAL RECORDS ──

export const personalRecords = sqliteTable('personal_records', {
  id: text('id').primaryKey(),
  exerciseId: text('exercise_id').notNull(),
  type: text('type').notNull(), // weight | reps | volume | estimated_1rm
  value: real('value').notNull(),
  setId: text('set_id'),
  achievedAt: text('achieved_at').notNull(),
  previousValue: real('previous_value'),
}, (table) => [
  index('idx_pr_exercise').on(table.exerciseId),
  index('idx_pr_exercise_type').on(table.exerciseId, table.type),
]);

// ── PROGRAMS ──

export const programs = sqliteTable('programs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  numWeeks: integer('num_weeks').notNull(),
  daysPerWeek: integer('days_per_week').notNull(),
  difficulty: text('difficulty'), // beginner | intermediate | advanced
  isBuiltIn: integer('is_built_in').default(0),
  createdAt: text('created_at').notNull(),
});

// ── PROGRAM DAYS ──

export const programDays = sqliteTable('program_days', {
  id: text('id').primaryKey(),
  programId: text('program_id').notNull(),
  weekNumber: integer('week_number').notNull(),
  dayNumber: integer('day_number').notNull(),
  name: text('name').notNull(),
}, (table) => [
  index('idx_pd_program').on(table.programId),
]);

// ── PROGRAM EXERCISES ──

export const programExercises = sqliteTable('program_exercises', {
  id: text('id').primaryKey(),
  programDayId: text('program_day_id').notNull(),
  exerciseId: text('exercise_id').notNull(),
  sortOrder: integer('sort_order').notNull(),
  targetSets: integer('target_sets'),
  targetReps: text('target_reps'), // "5" or "8-12"
  targetRpe: real('target_rpe'),
  restSeconds: integer('rest_seconds'),
  notes: text('notes'),
  progressionRule: text('progression_rule'), // JSON
}, (table) => [
  index('idx_pe_day').on(table.programDayId),
]);

// ── PROGRAM INSTANCES ──

export const programInstances = sqliteTable('program_instances', {
  id: text('id').primaryKey(),
  programId: text('program_id').notNull(),
  startedAt: text('started_at').notNull(),
  currentWeek: integer('current_week').default(1),
  currentDay: integer('current_day').default(1),
  isActive: integer('is_active').default(1),
  completedAt: text('completed_at'),
});

// ── BODY WEIGHT LOG ──

export const bodyWeightLog = sqliteTable('body_weight_log', {
  id: text('id').primaryKey(),
  weight: real('weight').notNull(),
  date: text('date').notNull(), // YYYY-MM-DD
  notes: text('notes'),
}, (table) => [
  index('idx_bw_date').on(table.date),
]);
