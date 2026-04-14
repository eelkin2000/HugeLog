/**
 * Estimate 1RM using Epley and Brzycki formulas.
 * For reps <= 10, averages both. For reps > 10, uses Epley only.
 */
export function estimateOneRM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;

  const epley = weight * (1 + reps / 30);

  if (reps <= 10) {
    const brzycki = weight * (36 / (37 - reps));
    return Math.round(((epley + brzycki) / 2) * 10) / 10;
  }

  return Math.round(epley * 10) / 10;
}

/**
 * Calculate volume for a single set: weight * reps.
 */
export function setVolume(weight: number, reps: number): number {
  return weight * reps;
}

/**
 * Calculate total volume from an array of sets.
 */
export function totalVolume(
  sets: Array<{ weight: number | null; reps: number | null; isCompleted: number }>
): number {
  return sets.reduce((sum, s) => {
    if (s.isCompleted && s.weight && s.reps) {
      return sum + s.weight * s.reps;
    }
    return sum;
  }, 0);
}

/**
 * Convert between lb and kg.
 */
export function convertWeight(
  value: number,
  from: 'lb' | 'kg',
  to: 'lb' | 'kg'
): number {
  if (from === to) return value;
  if (from === 'lb' && to === 'kg') return Math.round(value * 0.453592 * 10) / 10;
  return Math.round(value * 2.20462 * 10) / 10;
}

/**
 * Calculate streak: consecutive weeks with at least one workout.
 */
export function calculateStreak(
  workoutDates: string[]
): { current: number; longest: number } {
  if (workoutDates.length === 0) return { current: 0, longest: 0 };

  // Get unique weeks (ISO week number + year)
  const getWeekKey = (dateStr: string) => {
    const d = new Date(dateStr);
    const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(
      ((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7
    );
    return `${d.getFullYear()}-W${week}`;
  };

  const weeks = [...new Set(workoutDates.map(getWeekKey))].sort();

  let current = 1;
  let longest = 1;
  let streak = 1;

  for (let i = 1; i < weeks.length; i++) {
    const [prevYear, prevWeek] = weeks[i - 1].split('-W').map(Number);
    const [currYear, currWeek] = weeks[i].split('-W').map(Number);

    const isConsecutive =
      (currYear === prevYear && currWeek === prevWeek + 1) ||
      (currYear === prevYear + 1 && prevWeek >= 52 && currWeek === 1);

    if (isConsecutive) {
      streak++;
    } else {
      streak = 1;
    }
    longest = Math.max(longest, streak);
  }

  // Check if current week is part of the streak
  const now = new Date();
  const currentWeekKey = getWeekKey(now.toISOString());
  const lastWorkoutWeek = weeks[weeks.length - 1];

  if (lastWorkoutWeek === currentWeekKey) {
    current = streak;
  } else {
    // Check if last workout was last week
    const [ly, lw] = lastWorkoutWeek.split('-W').map(Number);
    const [cy, cw] = currentWeekKey.split('-W').map(Number);
    const wasLastWeek =
      (cy === ly && cw === lw + 1) ||
      (cy === ly + 1 && lw >= 52 && cw === 1);
    current = wasLastWeek ? streak : 0;
  }

  return { current, longest };
}

/**
 * Strength level based on bodyweight ratio.
 * Returns level and the ratio achieved.
 */
export type StrengthLevel = 'beginner' | 'novice' | 'intermediate' | 'advanced' | 'elite';

interface StrengthStandard {
  beginner: number;
  novice: number;
  intermediate: number;
  advanced: number;
  elite: number;
}

// Bodyweight multiplier standards for key lifts (male)
const STRENGTH_STANDARDS_MALE: Record<string, StrengthStandard> = {
  'Barbell Bench Press': { beginner: 0.5, novice: 0.75, intermediate: 1.25, advanced: 1.75, elite: 2.0 },
  'Barbell Back Squat': { beginner: 0.75, novice: 1.0, intermediate: 1.5, advanced: 2.0, elite: 2.5 },
  'Conventional Deadlift': { beginner: 1.0, novice: 1.25, intermediate: 1.75, advanced: 2.5, elite: 3.0 },
  'Overhead Press': { beginner: 0.35, novice: 0.55, intermediate: 0.8, advanced: 1.1, elite: 1.4 },
  'Barbell Row': { beginner: 0.4, novice: 0.6, intermediate: 0.9, advanced: 1.2, elite: 1.5 },
};

export function getStrengthLevel(
  exerciseName: string,
  estimatedOneRM: number,
  bodyWeight: number,
): { level: StrengthLevel; ratio: number } | null {
  const standards = STRENGTH_STANDARDS_MALE[exerciseName];
  if (!standards || bodyWeight <= 0) return null;

  const ratio = Math.round((estimatedOneRM / bodyWeight) * 100) / 100;

  let level: StrengthLevel = 'beginner';
  if (ratio >= standards.elite) level = 'elite';
  else if (ratio >= standards.advanced) level = 'advanced';
  else if (ratio >= standards.intermediate) level = 'intermediate';
  else if (ratio >= standards.novice) level = 'novice';

  return { level, ratio };
}
