import { db } from '../client';
import { rawDb } from '../client';
import { workouts, workoutExercises, sets, personalRecords } from '../schema';
import { sql } from 'drizzle-orm';
import { estimateOneRM } from '@/utils/calculations';

// ─── Split definition ───────────────────────────────────────────
// 5-day PPL + Upper/Lower hybrid split
type SplitDay = {
  name: string;
  exercises: Array<{
    id: string;
    baseWeight: number; // starting weight 2 years ago (lbs)
    endWeight: number;  // current weight (lbs)
    repRange: [number, number];
    numSets: number;
  }>;
};

const SPLIT: SplitDay[] = [
  // Day 1: Chest & Triceps
  {
    name: 'Chest & Triceps',
    exercises: [
      { id: 'ex_bb_flat_bench', baseWeight: 135, endWeight: 225, repRange: [5, 8], numSets: 4 },
      { id: 'ex_bb_incline_bench', baseWeight: 115, endWeight: 185, repRange: [6, 10], numSets: 4 },
      { id: 'ex_db_flat_bench', baseWeight: 50, endWeight: 85, repRange: [8, 12], numSets: 3 },
      { id: 'ex_cable_crossover', baseWeight: 20, endWeight: 40, repRange: [10, 15], numSets: 3 },
      { id: 'ex_cable_tricep_pushdown', baseWeight: 40, endWeight: 70, repRange: [10, 15], numSets: 3 },
      { id: 'ex_bb_skull_crusher', baseWeight: 50, endWeight: 85, repRange: [8, 12], numSets: 3 },
    ],
  },
  // Day 2: Back & Biceps
  {
    name: 'Back & Biceps',
    exercises: [
      { id: 'ex_bb_deadlift', baseWeight: 185, endWeight: 365, repRange: [3, 6], numSets: 4 },
      { id: 'ex_bb_bent_row', baseWeight: 115, endWeight: 195, repRange: [6, 10], numSets: 4 },
      { id: 'ex_cable_lat_pulldown', baseWeight: 100, endWeight: 170, repRange: [8, 12], numSets: 3 },
      { id: 'ex_cable_row', baseWeight: 90, endWeight: 160, repRange: [8, 12], numSets: 3 },
      { id: 'ex_db_bicep_curl', baseWeight: 25, endWeight: 45, repRange: [8, 12], numSets: 3 },
      { id: 'ex_bb_curl', baseWeight: 55, endWeight: 95, repRange: [8, 12], numSets: 3 },
    ],
  },
  // Day 3: Legs (Quad focus)
  {
    name: 'Legs - Quads',
    exercises: [
      { id: 'ex_bb_back_squat', baseWeight: 155, endWeight: 295, repRange: [4, 8], numSets: 4 },
      { id: 'ex_bb_front_squat', baseWeight: 95, endWeight: 185, repRange: [6, 8], numSets: 3 },
      { id: 'ex_machine_leg_press', baseWeight: 270, endWeight: 500, repRange: [8, 12], numSets: 4 },
      { id: 'ex_machine_leg_extension', baseWeight: 70, endWeight: 130, repRange: [10, 15], numSets: 3 },
      { id: 'ex_db_lunge', baseWeight: 30, endWeight: 60, repRange: [8, 12], numSets: 3 },
      { id: 'ex_machine_calf_raise', baseWeight: 100, endWeight: 200, repRange: [12, 20], numSets: 4 },
    ],
  },
  // Day 4: Shoulders & Abs
  {
    name: 'Shoulders & Abs',
    exercises: [
      { id: 'ex_bb_overhead_press', baseWeight: 85, endWeight: 155, repRange: [5, 8], numSets: 4 },
      { id: 'ex_db_shoulder_press', baseWeight: 35, endWeight: 65, repRange: [8, 10], numSets: 3 },
      { id: 'ex_db_lateral_raise', baseWeight: 15, endWeight: 30, repRange: [10, 15], numSets: 4 },
      { id: 'ex_cable_face_pull', baseWeight: 30, endWeight: 55, repRange: [12, 15], numSets: 3 },
      { id: 'ex_db_rear_delt_fly', baseWeight: 12, endWeight: 25, repRange: [12, 15], numSets: 3 },
      { id: 'ex_bw_hanging_leg_raise', baseWeight: 0, endWeight: 0, repRange: [10, 15], numSets: 3 },
    ],
  },
  // Day 5: Legs (Posterior) & Arms
  {
    name: 'Hamstrings & Arms',
    exercises: [
      { id: 'ex_bb_rdl', baseWeight: 135, endWeight: 275, repRange: [6, 10], numSets: 4 },
      { id: 'ex_machine_leg_curl', baseWeight: 60, endWeight: 120, repRange: [8, 12], numSets: 3 },
      { id: 'ex_bb_hip_thrust', baseWeight: 135, endWeight: 315, repRange: [8, 12], numSets: 4 },
      { id: 'ex_db_hammer_curl', baseWeight: 25, endWeight: 45, repRange: [8, 12], numSets: 3 },
      { id: 'ex_cable_tricep_pushdown', baseWeight: 40, endWeight: 70, repRange: [10, 15], numSets: 3 },
      { id: 'ex_db_bicep_curl', baseWeight: 25, endWeight: 45, repRange: [10, 12], numSets: 3 },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────

let idCounter = 0;
function genId(prefix: string) {
  return `${prefix}_mock_${Date.now()}_${idCounter++}`;
}

/** Random int in range [min, max] inclusive */
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Add slight random variance (-variance% to +variance%) */
function vary(value: number, variancePct: number) {
  const factor = 1 + (Math.random() * 2 - 1) * (variancePct / 100);
  return Math.round(value * factor * 4) / 4; // round to nearest 0.25
}

/** Round weight to nearest 5 lbs */
function roundWeight(w: number) {
  return Math.round(w / 5) * 5;
}

/** Linear progression with small noise — weight at a given fraction of the 2-year span */
function progressWeight(base: number, end: number, fraction: number) {
  // Not perfectly linear: add some plateaus and jumps
  // Use a slightly S-curved progression
  const curved = fraction < 0.5
    ? 2 * fraction * fraction
    : 1 - Math.pow(-2 * fraction + 2, 2) / 2;
  const raw = base + (end - base) * curved;
  return roundWeight(vary(raw, 4));
}

// ─── Main seed function ──────────────────────────────────────────

export async function seedMockWorkouts() {
  // Check if we already have mock workouts
  const existing = await db
    .select({ count: sql<number>`count(*)` })
    .from(workouts);
  if (existing[0]?.count > 10) {
    // Already have data, skip
    return;
  }

  const now = new Date();
  const twoYearsAgo = new Date(now);
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  // Generate workout dates: 4-5 days per week over 2 years
  const workoutDates: Date[] = [];
  const cursor = new Date(twoYearsAgo);

  while (cursor < now) {
    // Each week, pick 4 or 5 days (Mon-Sat, skip some)
    const weekStart = new Date(cursor);
    const dayOfWeek = weekStart.getDay(); // 0=Sun
    // Advance to Monday
    const mon = new Date(weekStart);
    mon.setDate(mon.getDate() + ((1 - dayOfWeek + 7) % 7));

    if (mon >= now) break;

    // Available training days: Mon(1), Tue(2), Wed(3), Thu(4), Fri(5), Sat(6)
    const availableDays = [0, 1, 2, 3, 4, 5]; // offsets from Monday
    const numDays = Math.random() < 0.6 ? 5 : 4;

    // Randomly skip one or two days
    const skip = new Set<number>();
    while (skip.size < 6 - numDays) {
      skip.add(availableDays[randInt(0, 5)]);
    }

    for (let d = 0; d < 6; d++) {
      if (skip.has(d)) continue;
      const date = new Date(mon);
      date.setDate(date.getDate() + d);
      if (date < now && date >= twoYearsAgo) {
        workoutDates.push(date);
      }
    }

    // Advance cursor by 7 days
    cursor.setDate(cursor.getDate() + 7);
  }

  // Occasionally skip entire weeks (deload / vacation: ~5% of weeks)
  const filteredDates = workoutDates.filter(() => Math.random() > 0.02);

  // Track PRs per exercise
  const prTracker = new Map<string, { weight: number; reps: number; volume: number; e1rm: number }>();

  // Batch all inserts using raw SQL for speed
  const workoutRows: any[] = [];
  const weRows: any[] = [];
  const setRows: any[] = [];
  const prRows: any[] = [];

  let splitDayIndex = 0;

  const totalDays = filteredDates.length;

  for (let i = 0; i < totalDays; i++) {
    const date = filteredDates[i];
    const fraction = i / totalDays; // 0..1 over the 2-year span
    const split = SPLIT[splitDayIndex % SPLIT.length];
    splitDayIndex++;

    // Workout timing: morning (6-10am), random duration 45-90 min
    const hour = randInt(6, 10);
    const minute = randInt(0, 59);
    const startedAt = new Date(date);
    startedAt.setHours(hour, minute, 0, 0);

    const durationSeconds = randInt(45, 90) * 60;
    const completedAt = new Date(startedAt.getTime() + durationSeconds * 1000);

    const workoutId = genId('w');
    let workoutVolume = 0;

    // Pick 4-6 exercises from the split (sometimes skip one)
    const numExercises = Math.min(split.exercises.length, randInt(4, split.exercises.length));
    const exercisesToDo = split.exercises.slice(0, numExercises);

    for (let eIdx = 0; eIdx < exercisesToDo.length; eIdx++) {
      const ex = exercisesToDo[eIdx];
      const weId = genId('we');

      weRows.push({
        id: weId,
        workoutId,
        exerciseId: ex.id,
        sortOrder: eIdx,
        notes: null,
        restSeconds: ex.repRange[0] <= 6 ? 180 : 90,
      });

      const currentWeight = ex.baseWeight === 0 ? 0 : progressWeight(ex.baseWeight, ex.endWeight, fraction);

      for (let s = 0; s < ex.numSets; s++) {
        const setId = genId('s');
        const isWarmup = s === 0 && ex.numSets >= 4;
        const setType = isWarmup ? 'warmup' : 'working';

        let weight: number;
        let reps: number;

        if (ex.baseWeight === 0) {
          // Bodyweight exercise
          weight = 0;
          reps = randInt(ex.repRange[0], ex.repRange[1]);
        } else if (isWarmup) {
          weight = roundWeight(currentWeight * 0.6);
          reps = randInt(8, 12);
        } else {
          weight = currentWeight;
          // Last set might have fewer reps (fatigue)
          const fatigueDrop = s === ex.numSets - 1 ? randInt(0, 2) : 0;
          reps = Math.max(1, randInt(ex.repRange[0], ex.repRange[1]) - fatigueDrop);
        }

        const setCompletedAt = new Date(
          startedAt.getTime() + ((eIdx * ex.numSets + s + 1) / (numExercises * 4)) * durationSeconds * 1000
        );

        const volume = weight * reps;
        if (setType === 'working') workoutVolume += volume;

        // Track RPE: increases over the session and over sets
        const rpe = setType === 'warmup' ? vary(5, 10) : Math.min(10, vary(7.5 + s * 0.5, 8));

        // Check for PRs (only working sets)
        let isPR = 0;
        if (setType === 'working' && weight > 0) {
          const key = ex.id;
          const prev = prTracker.get(key);
          const e1rm = estimateOneRM(weight, reps);

          if (!prev) {
            prTracker.set(key, { weight, reps, volume, e1rm });
            // First entry is a PR
            isPR = 1;
            prRows.push({
              id: genId('pr'),
              exerciseId: ex.id,
              type: 'weight',
              value: weight,
              setId,
              achievedAt: setCompletedAt.toISOString(),
              previousValue: null,
            });
            prRows.push({
              id: genId('pr'),
              exerciseId: ex.id,
              type: 'estimated_1rm',
              value: Math.round(e1rm * 10) / 10,
              setId,
              achievedAt: setCompletedAt.toISOString(),
              previousValue: null,
            });
          } else {
            if (weight > prev.weight) {
              const prevWeight = prev.weight;
              prev.weight = weight;
              isPR = 1;
              prRows.push({
                id: genId('pr'),
                exerciseId: ex.id,
                type: 'weight',
                value: weight,
                setId,
                achievedAt: setCompletedAt.toISOString(),
                previousValue: prevWeight,
              });
            }
            if (e1rm > prev.e1rm) {
              const prevE1rm = prev.e1rm;
              prev.e1rm = e1rm;
              isPR = 1;
              prRows.push({
                id: genId('pr'),
                exerciseId: ex.id,
                type: 'estimated_1rm',
                value: Math.round(e1rm * 10) / 10,
                setId,
                achievedAt: setCompletedAt.toISOString(),
                previousValue: Math.round(prevE1rm * 10) / 10,
              });
            }
          }
        }

        setRows.push({
          id: setId,
          workoutExerciseId: weId,
          setNumber: s + 1,
          type: setType,
          weight: weight || null,
          reps,
          rpe: Math.round(rpe * 10) / 10,
          isCompleted: 1,
          completedAt: setCompletedAt.toISOString(),
          isPersonalRecord: isPR,
        });
      }
    }

    workoutRows.push({
      id: workoutId,
      name: split.name,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationSeconds,
      notes: null,
      programInstanceId: null,
      programWeek: null,
      programDay: null,
      totalVolume: workoutVolume,
      createdAt: startedAt.toISOString(),
    });
  }

  // Insert everything in a transaction for speed
  rawDb.execSync('BEGIN TRANSACTION;');
  try {
    // Insert workouts
    for (const w of workoutRows) {
      rawDb.execSync(
        `INSERT INTO workouts (id, name, started_at, completed_at, duration_seconds, notes, program_instance_id, program_week, program_day, total_volume, created_at)
         VALUES ('${w.id}', '${w.name.replace(/'/g, "''")}', '${w.startedAt}', '${w.completedAt}', ${w.durationSeconds}, NULL, NULL, NULL, NULL, ${w.totalVolume}, '${w.createdAt}');`
      );
    }

    // Insert workout exercises
    for (const we of weRows) {
      rawDb.execSync(
        `INSERT INTO workout_exercises (id, workout_id, exercise_id, sort_order, notes, rest_seconds)
         VALUES ('${we.id}', '${we.workoutId}', '${we.exerciseId}', ${we.sortOrder}, NULL, ${we.restSeconds});`
      );
    }

    // Insert sets
    for (const s of setRows) {
      rawDb.execSync(
        `INSERT INTO sets (id, workout_exercise_id, set_number, type, weight, reps, rpe, is_completed, completed_at, is_pr)
         VALUES ('${s.id}', '${s.workoutExerciseId}', ${s.setNumber}, '${s.type}', ${s.weight ?? 'NULL'}, ${s.reps}, ${s.rpe}, ${s.isCompleted}, '${s.completedAt}', ${s.isPersonalRecord});`
      );
    }

    // Insert PRs
    for (const pr of prRows) {
      rawDb.execSync(
        `INSERT INTO personal_records (id, exercise_id, type, value, set_id, achieved_at, previous_value)
         VALUES ('${pr.id}', '${pr.exerciseId}', '${pr.type}', ${pr.value}, '${pr.setId}', '${pr.achievedAt}', ${pr.previousValue ?? 'NULL'});`
      );
    }

    rawDb.execSync('COMMIT;');
  } catch (e) {
    rawDb.execSync('ROLLBACK;');
    throw e;
  }

  console.log(
    `[MockData] Seeded ${workoutRows.length} workouts, ${weRows.length} workout exercises, ${setRows.length} sets, ${prRows.length} PRs`
  );
}

/**
 * Remove all mock workout data (for resetting).
 */
export async function clearMockWorkouts() {
  rawDb.execSync('BEGIN TRANSACTION;');
  try {
    rawDb.execSync("DELETE FROM personal_records WHERE id LIKE 'pr_mock_%';");
    rawDb.execSync("DELETE FROM sets WHERE id LIKE 's_mock_%';");
    rawDb.execSync("DELETE FROM workout_exercises WHERE id LIKE 'we_mock_%';");
    rawDb.execSync("DELETE FROM workouts WHERE id LIKE 'w_mock_%';");
    rawDb.execSync('COMMIT;');
  } catch (e) {
    rawDb.execSync('ROLLBACK;');
    throw e;
  }
  console.log('[MockData] Cleared all mock workout data');
}
