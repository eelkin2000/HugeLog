export const MUSCLE_GROUPS = [
  'chest',
  'front_delts',
  'side_delts',
  'rear_delts',
  'triceps',
  'biceps',
  'forearms',
  'upper_back',
  'lats',
  'lower_back',
  'traps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'abs',
  'obliques',
  'hip_flexors',
  'adductors',
  'abductors',
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  front_delts: 'Front Delts',
  side_delts: 'Side Delts',
  rear_delts: 'Rear Delts',
  triceps: 'Triceps',
  biceps: 'Biceps',
  forearms: 'Forearms',
  upper_back: 'Upper Back',
  lats: 'Lats',
  lower_back: 'Lower Back',
  traps: 'Traps',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  abs: 'Abs',
  obliques: 'Obliques',
  hip_flexors: 'Hip Flexors',
  adductors: 'Adductors',
  abductors: 'Abductors',
};

export const EXERCISE_CATEGORIES = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'smith_machine',
  'cardio',
  'other',
] as const;

export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  bodyweight: 'Bodyweight',
  smith_machine: 'Smith Machine',
  cardio: 'Cardio',
  other: 'Other',
};

export const SET_TYPES = ['warmup', 'working', 'dropset', 'failure'] as const;
export type SetType = (typeof SET_TYPES)[number];

export const UNITS = ['lb', 'kg'] as const;
export type WeightUnit = (typeof UNITS)[number];

export const DEFAULT_REST_SECONDS = 90;
export const DEFAULT_UNIT: WeightUnit = 'lb';
