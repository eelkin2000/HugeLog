import { create } from 'zustand';
import type { SetType } from '@/utils/constants';

export interface ActiveSet {
  id: string;
  setNumber: number;
  type: SetType;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  isCompleted: boolean;
  isPersonalRecord: boolean;
}

export interface ActiveExercise {
  id: string; // workoutExercise ID
  exerciseId: string;
  exerciseName: string;
  sortOrder: number;
  sets: ActiveSet[];
  restSeconds: number | null;
  notes: string;
}

interface ActiveWorkoutState {
  workoutId: string | null;
  workoutName: string;
  startedAt: string | null;
  exercises: ActiveExercise[];
  isActive: boolean;
  restTimerEndTime: number | null; // epoch ms
  restTimerDuration: number | null; // seconds

  // Actions
  startWorkout: (id: string, name: string) => void;
  endWorkout: () => void;
  setWorkoutName: (name: string) => void;
  addExercise: (exercise: ActiveExercise) => void;
  removeExercise: (workoutExerciseId: string) => void;
  reorderExercises: (exercises: ActiveExercise[]) => void;
  addSet: (workoutExerciseId: string, set: ActiveSet) => void;
  updateSet: (workoutExerciseId: string, setId: string, updates: Partial<ActiveSet>) => void;
  removeSet: (workoutExerciseId: string, setId: string) => void;
  completeSet: (workoutExerciseId: string, setId: string) => void;
  uncompleteSet: (workoutExerciseId: string, setId: string) => void;
  setExerciseRestSeconds: (workoutExerciseId: string, seconds: number) => void;
  startRestTimer: (duration: number) => void;
  clearRestTimer: () => void;
}

export const useActiveWorkoutStore = create<ActiveWorkoutState>((set) => ({
  workoutId: null,
  workoutName: '',
  startedAt: null,
  exercises: [],
  isActive: false,
  restTimerEndTime: null,
  restTimerDuration: null,

  startWorkout: (id, name) =>
    set({
      workoutId: id,
      workoutName: name,
      startedAt: new Date().toISOString(),
      exercises: [],
      isActive: true,
    }),

  endWorkout: () =>
    set({
      workoutId: null,
      workoutName: '',
      startedAt: null,
      exercises: [],
      isActive: false,
      restTimerEndTime: null,
      restTimerDuration: null,
    }),

  setWorkoutName: (name) => set({ workoutName: name }),

  addExercise: (exercise) =>
    set((state) => ({ exercises: [...state.exercises, exercise] })),

  removeExercise: (workoutExerciseId) =>
    set((state) => ({
      exercises: state.exercises.filter((e) => e.id !== workoutExerciseId),
    })),

  reorderExercises: (exercises) => set({ exercises }),

  addSet: (workoutExerciseId, newSet) =>
    set((state) => ({
      exercises: state.exercises.map((e) =>
        e.id === workoutExerciseId ? { ...e, sets: [...e.sets, newSet] } : e
      ),
    })),

  updateSet: (workoutExerciseId, setId, updates) =>
    set((state) => ({
      exercises: state.exercises.map((e) =>
        e.id === workoutExerciseId
          ? {
              ...e,
              sets: e.sets.map((s) =>
                s.id === setId ? { ...s, ...updates } : s
              ),
            }
          : e
      ),
    })),

  removeSet: (workoutExerciseId, setId) =>
    set((state) => ({
      exercises: state.exercises.map((e) =>
        e.id === workoutExerciseId
          ? {
              ...e,
              sets: e.sets
                .filter((s) => s.id !== setId)
                .map((s, i) => ({ ...s, setNumber: i + 1 })),
            }
          : e
      ),
    })),

  completeSet: (workoutExerciseId, setId) =>
    set((state) => ({
      exercises: state.exercises.map((e) =>
        e.id === workoutExerciseId
          ? {
              ...e,
              sets: e.sets.map((s) =>
                s.id === setId ? { ...s, isCompleted: true } : s
              ),
            }
          : e
      ),
    })),

  uncompleteSet: (workoutExerciseId, setId) =>
    set((state) => ({
      exercises: state.exercises.map((e) =>
        e.id === workoutExerciseId
          ? {
              ...e,
              sets: e.sets.map((s) =>
                s.id === setId ? { ...s, isCompleted: false, isPersonalRecord: false } : s
              ),
            }
          : e
      ),
    })),

  setExerciseRestSeconds: (workoutExerciseId, seconds) =>
    set((state) => ({
      exercises: state.exercises.map((e) =>
        e.id === workoutExerciseId ? { ...e, restSeconds: seconds } : e
      ),
    })),

  startRestTimer: (duration) =>
    set({
      restTimerEndTime: Date.now() + duration * 1000,
      restTimerDuration: duration,
    }),

  clearRestTimer: () =>
    set({ restTimerEndTime: null, restTimerDuration: null }),
}));
