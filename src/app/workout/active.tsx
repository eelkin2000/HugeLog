import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { generateId as uuid } from '@/utils/id';
import { colors, spacing, fontSize, fontWeight, radius } from '@/ui/theme';
import { Card } from '@/ui/components/Card';
import { Button } from '@/ui/components/Button';
import { HapticPressable } from '@/ui/components/HapticPressable';
import { Badge } from '@/ui/components/Badge';
import { SwipeableSetRow } from '@/features/workout/components/SwipeableSetRow';
import { WorkoutSummary } from '@/features/workout/components/WorkoutSummary';
import { DraggableExerciseCard } from '@/features/workout/components/DraggableExerciseCard';
import {
  useActiveWorkoutStore,
  type ActiveSet,
  type ActiveExercise,
} from '@/stores/activeWorkoutStore';
import { useAppStore } from '@/stores/appStore';
import { db } from '@/db/client';
import {
  workouts,
  workoutExercises,
  sets,
  exercises as exercisesTable,
  personalRecords,
  programExercises,
  programInstances,
  programs as programsTable,
} from '@/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { formatDuration, formatVolume } from '@/utils/formatting';
import { totalVolume as calcTotalVolume, estimateOneRM } from '@/utils/calculations';
import type { SetType, MuscleGroup } from '@/utils/constants';

// Previous session data for ghost text
interface PreviousData {
  [exerciseId: string]: Array<{ weight: number | null; reps: number | null }>;
}

export default function ActiveWorkoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    programInstanceId?: string;
    programDayId?: string;
    programDayName?: string;
    programDayNumber?: string;
    programWeek?: string;
  }>();
  const unit = useAppStore((s) => s.unit);
  const defaultRest = useAppStore((s) => s.defaultRestSeconds);
  const store = useActiveWorkoutStore();
  const [elapsed, setElapsed] = useState(0);
  const [previousData, setPreviousData] = useState<PreviousData>({});
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>(null);
  const programContextRef = useRef<{
    instanceId: string;
    dayNumber: number;
    totalDays: number;
  } | null>(null);

  // Initialize workout if not active
  useEffect(() => {
    if (!store.isActive) {
      const id = uuid();
      const now = new Date();
      const workoutName = params.programDayName || `Workout - ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
      store.startWorkout(id, workoutName);

      const workoutValues: any = {
        id,
        name: workoutName,
        startedAt: now.toISOString(),
        createdAt: now.toISOString(),
      };

      // Link to program if coming from a program day
      if (params.programInstanceId) {
        workoutValues.programInstanceId = params.programInstanceId;
        workoutValues.programWeek = parseInt(params.programWeek || '1');
        workoutValues.programDay = parseInt(params.programDayNumber || '1');
      }

      db.insert(workouts)
        .values(workoutValues)
        .then(() => {});

      // Pre-populate exercises from program day
      if (params.programDayId) {
        loadProgramDayExercises(id, params.programDayId);
      }
    }
  }, []);

  // Load and add exercises from a program day
  const loadProgramDayExercises = async (workoutId: string, dayId: string) => {
    try {
      const dayExercises = await db
        .select({
          exerciseId: programExercises.exerciseId,
          name: exercisesTable.name,
          targetSets: programExercises.targetSets,
          targetReps: programExercises.targetReps,
          sortOrder: programExercises.sortOrder,
          restSeconds: programExercises.restSeconds,
        })
        .from(programExercises)
        .innerJoin(exercisesTable, eq(programExercises.exerciseId, exercisesTable.id))
        .where(eq(programExercises.programDayId, dayId))
        .orderBy(programExercises.sortOrder);

      for (const ex of dayExercises) {
        const weId = uuid();
        const numSets = ex.targetSets || 3;

        // Query last session's sets for auto-populate
        let previousSets: Array<{ weight: number | null; reps: number | null }> = [];
        try {
          const lastSets = await db
            .select({ weight: sets.weight, reps: sets.reps })
            .from(sets)
            .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
            .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
            .where(
              and(
                eq(workoutExercises.exerciseId, ex.exerciseId),
                eq(sets.isCompleted, 1),
                sql`${workouts.completedAt} IS NOT NULL`,
                sql`${workouts.id} != ${workoutId}`
              )
            )
            .orderBy(desc(workouts.startedAt), sets.setNumber)
            .limit(10);

          if (lastSets.length > 0) previousSets = lastSets;
        } catch {}

        const defaultSets = Array.from({ length: numSets }, (_, i) => ({
          id: uuid(),
          setNumber: i + 1,
          type: 'working' as const,
          weight: previousSets[i]?.weight ?? null,
          reps: previousSets[i]?.reps ?? null,
          rpe: null,
          isCompleted: false,
          isPersonalRecord: false,
        }));

        // Add to store
        const storeState = useActiveWorkoutStore.getState();
        storeState.addExercise({
          id: weId,
          exerciseId: ex.exerciseId,
          exerciseName: ex.name,
          sortOrder: ex.sortOrder,
          sets: defaultSets,
          restSeconds: ex.restSeconds,
          notes: '',
        });

        // Persist
        await db.insert(workoutExercises).values({
          id: weId,
          workoutId,
          exerciseId: ex.exerciseId,
          sortOrder: ex.sortOrder,
        });

        for (const s of defaultSets) {
          await db.insert(sets).values({
            id: s.id,
            workoutExerciseId: weId,
            setNumber: s.setNumber,
            type: s.type,
            weight: s.weight,
            reps: s.reps,
          });
        }
      }

      // Store program context for advancing day on finish
      if (params.programInstanceId && params.programDayNumber) {
        // Get total days in program to know when to wrap around
        const instanceResult = await db
          .select()
          .from(programInstances)
          .where(eq(programInstances.id, params.programInstanceId))
          .limit(1);
        if (instanceResult.length > 0) {
          // Use daysPerWeek from the workout values we already computed
          const dayNum = parseInt(params.programDayNumber);
          programContextRef.current = {
            instanceId: params.programInstanceId,
            dayNumber: dayNum,
            totalDays: dayExercises.length > 0 ? Math.max(dayNum, dayExercises.length) : dayNum,
          };
        }
      }
    } catch {}
  };

  // Timer
  useEffect(() => {
    if (store.isActive && store.startedAt) {
      timerRef.current = setInterval(() => {
        const start = new Date(store.startedAt!).getTime();
        setElapsed(Math.floor((Date.now() - start) / 1000));
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [store.isActive, store.startedAt]);

  // Load previous session data for an exercise
  const loadPreviousData = useCallback(
    async (exerciseId: string) => {
      if (!store.workoutId || previousData[exerciseId]) return;

      try {
        const lastSets = await db
          .select({ weight: sets.weight, reps: sets.reps })
          .from(sets)
          .innerJoin(
            workoutExercises,
            eq(sets.workoutExerciseId, workoutExercises.id)
          )
          .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
          .where(
            and(
              eq(workoutExercises.exerciseId, exerciseId),
              eq(sets.isCompleted, 1),
              sql`${workouts.completedAt} IS NOT NULL`,
              sql`${workouts.id} != ${store.workoutId}`
            )
          )
          .orderBy(desc(workouts.startedAt), sets.setNumber)
          .limit(10);

        setPreviousData((prev) => ({
          ...prev,
          [exerciseId]: lastSets,
        }));
      } catch {}
    },
    [store.workoutId, previousData]
  );

  // Load previous data when exercises change
  useEffect(() => {
    for (const ex of store.exercises) {
      loadPreviousData(ex.exerciseId);
    }
  }, [store.exercises.length]);

  // Detect PR when completing a set
  const detectPR = useCallback(
    async (exerciseId: string, weight: number, reps: number, setId: string) => {
      if (weight <= 0 || reps <= 0) return false;

      try {
        // Check weight PR
        const weightPRs = await db
          .select({ value: personalRecords.value })
          .from(personalRecords)
          .where(
            and(
              eq(personalRecords.exerciseId, exerciseId),
              eq(personalRecords.type, 'weight')
            )
          )
          .orderBy(desc(personalRecords.value))
          .limit(1);

        const currentWeightPR = weightPRs[0]?.value ?? 0;
        const e1rm = estimateOneRM(weight, reps);

        // Check e1RM PR
        const e1rmPRs = await db
          .select({ value: personalRecords.value })
          .from(personalRecords)
          .where(
            and(
              eq(personalRecords.exerciseId, exerciseId),
              eq(personalRecords.type, 'estimated_1rm')
            )
          )
          .orderBy(desc(personalRecords.value))
          .limit(1);

        const currentE1RMPR = e1rmPRs[0]?.value ?? 0;

        let isPR = false;

        if (weight > currentWeightPR) {
          isPR = true;
          await db.insert(personalRecords).values({
            id: uuid(),
            exerciseId,
            type: 'weight',
            value: weight,
            setId,
            achievedAt: new Date().toISOString(),
            previousValue: currentWeightPR > 0 ? currentWeightPR : null,
          });
        }

        if (e1rm > currentE1RMPR) {
          isPR = true;
          await db.insert(personalRecords).values({
            id: uuid(),
            exerciseId,
            type: 'estimated_1rm',
            value: e1rm,
            setId,
            achievedAt: new Date().toISOString(),
            previousValue: currentE1RMPR > 0 ? currentE1RMPR : null,
          });
        }

        return isPR;
      } catch {
        return false;
      }
    },
    []
  );

  // Complete or uncomplete a set (toggle)
  const handleCompleteSet = useCallback(
    async (workoutExerciseId: string, setId: string) => {
      const exercise = store.exercises.find((e) => e.id === workoutExerciseId);
      const set = exercise?.sets.find((s) => s.id === setId);
      if (!set) return;

      if (set.isCompleted) {
        // Uncheck: revert to incomplete
        store.uncompleteSet(workoutExerciseId, setId);
        await db
          .update(sets)
          .set({ isCompleted: 0, completedAt: null, isPersonalRecord: 0 })
          .where(eq(sets.id, setId));
        // Remove any PRs recorded for this set
        await db.delete(personalRecords).where(eq(personalRecords.setId, setId));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      }

      store.completeSet(workoutExerciseId, setId);

      // Persist
      const now = new Date().toISOString();
      await db
        .update(sets)
        .set({
          isCompleted: 1,
          completedAt: now,
          weight: set.weight,
          reps: set.reps,
        })
        .where(eq(sets.id, setId));

      // PR detection
      if (exercise && set.weight && set.reps) {
        const isPR = await detectPR(
          exercise.exerciseId,
          set.weight,
          set.reps,
          setId
        );

        if (isPR) {
          // Mark as PR in store and DB
          store.updateSet(workoutExerciseId, setId, { isPersonalRecord: true });
          await db.update(sets).set({ isPersonalRecord: 1 }).where(eq(sets.id, setId));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      // Start rest timer — use per-exercise rest if set, else global default
      const defaultRest = useAppStore.getState().defaultRestSeconds;
      store.startRestTimer(exercise?.restSeconds ?? defaultRest);
    },
    [store, detectPR]
  );

  // Update set weight/reps
  const handleUpdateSet = useCallback(
    async (
      workoutExerciseId: string,
      setId: string,
      field: 'weight' | 'reps',
      value: number | null
    ) => {
      store.updateSet(workoutExerciseId, setId, { [field]: value });
      await db
        .update(sets)
        .set({ [field]: value })
        .where(eq(sets.id, setId));
    },
    [store]
  );

  // Change set type
  const handleChangeType = useCallback(
    async (workoutExerciseId: string, setId: string, type: SetType) => {
      store.updateSet(workoutExerciseId, setId, { type });
      await db.update(sets).set({ type }).where(eq(sets.id, setId));
    },
    [store]
  );

  // Adjust per-exercise rest time
  const handleAdjustExerciseRest = useCallback(
    async (workoutExerciseId: string, delta: number) => {
      const exercise = store.exercises.find((e) => e.id === workoutExerciseId);
      if (!exercise) return;
      const current = exercise.restSeconds ?? defaultRest;
      const next = Math.max(15, current + delta);
      store.setExerciseRestSeconds(workoutExerciseId, next);
      await db
        .update(workoutExercises)
        .set({ restSeconds: next })
        .where(eq(workoutExercises.id, workoutExerciseId));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [store, defaultRest]
  );

  // Add a set to an exercise
  const handleAddSet = useCallback(
    async (workoutExerciseId: string) => {
      const exercise = store.exercises.find((e) => e.id === workoutExerciseId);
      if (!exercise) return;

      const lastSet = exercise.sets[exercise.sets.length - 1];
      const newSet: ActiveSet = {
        id: uuid(),
        setNumber: exercise.sets.length + 1,
        type: 'working',
        weight: lastSet?.weight ?? null,
        reps: lastSet?.reps ?? null,
        rpe: null,
        isCompleted: false,
        isPersonalRecord: false,
      };

      store.addSet(workoutExerciseId, newSet);
      await db.insert(sets).values({
        id: newSet.id,
        workoutExerciseId,
        setNumber: newSet.setNumber,
        type: newSet.type,
        weight: newSet.weight,
        reps: newSet.reps,
      });
    },
    [store]
  );

  // Remove a set
  const handleRemoveSet = useCallback(
    async (workoutExerciseId: string, setId: string) => {
      store.removeSet(workoutExerciseId, setId);
      await db.delete(sets).where(eq(sets.id, setId));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [store]
  );

  // Reorder exercises (drag-and-drop)
  const handleReorderExercises = useCallback(
    async (from: number, to: number) => {
      const current = useActiveWorkoutStore.getState().exercises;
      if (from < 0 || to < 0 || from >= current.length || to >= current.length) return;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      const renumbered = next.map((e, i) => ({ ...e, sortOrder: i }));
      useActiveWorkoutStore.getState().reorderExercises(renumbered);
      // Persist new sort orders
      try {
        for (const ex of renumbered) {
          await db
            .update(workoutExercises)
            .set({ sortOrder: ex.sortOrder })
            .where(eq(workoutExercises.id, ex.id));
        }
      } catch {}
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    []
  );

  // Remove exercise (with confirmation)
  const handleRemoveExercise = useCallback(
    (workoutExerciseId: string, exerciseName: string) => {
      Alert.alert(
        'Remove Exercise',
        `Remove ${exerciseName} from this workout?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              // Delete sets then exercise from DB
              await db
                .delete(sets)
                .where(eq(sets.workoutExerciseId, workoutExerciseId));
              await db
                .delete(workoutExercises)
                .where(eq(workoutExercises.id, workoutExerciseId));
              store.removeExercise(workoutExerciseId);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            },
          },
        ]
      );
    },
    [store]
  );

  // Compute summary and finish
  const handleFinish = useCallback(async () => {
    if (!store.workoutId) return;

    const allSets = store.exercises.flatMap((e) => e.sets);
    const completedSets = allSets.filter((s) => s.isCompleted);

    if (completedSets.length === 0) {
      Alert.alert(
        'No Sets Completed',
        'Complete at least one set before finishing, or discard the workout.',
        [{ text: 'OK' }]
      );
      return;
    }

    const vol = calcTotalVolume(
      allSets.map((s) => ({
        weight: s.weight,
        reps: s.reps,
        isCompleted: s.isCompleted ? 1 : 0,
      }))
    );

    const totalReps = completedSets.reduce((sum, s) => sum + (s.reps || 0), 0);
    const totalPRs = allSets.filter((s) => s.isPersonalRecord).length;

    // Get muscle groups
    const muscleGroups: string[] = [];
    for (const ex of store.exercises) {
      try {
        const result = await db
          .select({ primaryMuscle: exercisesTable.primaryMuscle })
          .from(exercisesTable)
          .where(eq(exercisesTable.id, ex.exerciseId))
          .limit(1);
        if (result[0] && !muscleGroups.includes(result[0].primaryMuscle)) {
          muscleGroups.push(result[0].primaryMuscle);
        }
      } catch {}
    }

    // Build exercise summaries
    const exerciseSummaries = store.exercises.map((ex) => {
      const completed = ex.sets.filter((s) => s.isCompleted);
      const bestSet = completed.reduce(
        (best, s) => {
          if (s.weight && s.reps) {
            const vol = s.weight * s.reps;
            if (!best || vol > best.weight * best.reps) {
              return { weight: s.weight, reps: s.reps };
            }
          }
          return best;
        },
        null as { weight: number; reps: number } | null
      );

      return {
        name: ex.exerciseName,
        primaryMuscle: '',
        setsCompleted: completed.length,
        totalSets: ex.sets.length,
        bestSet,
        prsHit: ex.sets.filter((s) => s.isPersonalRecord).length,
      };
    });

    setSummaryData({
      workoutName: store.workoutName,
      duration: elapsed,
      totalVolume: vol,
      totalSets: completedSets.length,
      totalReps,
      totalPRs,
      exercises: exerciseSummaries,
      muscleGroups,
    });
    setShowSummary(true);

    // Persist
    await db
      .update(workouts)
      .set({
        completedAt: new Date().toISOString(),
        durationSeconds: elapsed,
        totalVolume: vol,
        name: store.workoutName,
      })
      .where(eq(workouts.id, store.workoutId));

    // Advance program day if this was a program workout
    if (programContextRef.current) {
      const ctx = programContextRef.current;
      try {
        // Get program's total days from programDays table
        const instanceData = await db
          .select()
          .from(programInstances)
          .where(eq(programInstances.id, ctx.instanceId))
          .limit(1);

        if (instanceData.length > 0) {
          const inst = instanceData[0];
          const progData = await db
            .select({ daysPerWeek: programsTable.daysPerWeek })
            .from(programsTable)
            .where(eq(programsTable.id, inst.programId))
            .limit(1);

          const totalDays = progData[0]?.daysPerWeek || ctx.totalDays;
          const nextDay = ctx.dayNumber >= totalDays ? 1 : ctx.dayNumber + 1;
          const nextWeek =
            ctx.dayNumber >= totalDays
              ? (inst.currentWeek || 1) + 1
              : inst.currentWeek || 1;

          await db
            .update(programInstances)
            .set({ currentDay: nextDay, currentWeek: nextWeek })
            .where(eq(programInstances.id, ctx.instanceId));
        }
      } catch {}
    }
  }, [store, elapsed]);

  // After summary dismissed
  const handleSummaryClose = useCallback(() => {
    setShowSummary(false);
    store.endWorkout();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  }, [store, router]);

  // Discard workout
  const handleDiscard = () => {
    Alert.alert('Discard Workout', 'Are you sure? All data will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          if (store.workoutId) {
            for (const ex of store.exercises) {
              await db
                .delete(sets)
                .where(eq(sets.workoutExerciseId, ex.id));
              await db
                .delete(workoutExercises)
                .where(eq(workoutExercises.id, ex.id));
            }
            await db.delete(workouts).where(eq(workouts.id, store.workoutId!));
          }
          store.endWorkout();
          router.back();
        },
      },
    ]);
  };

  // Computed stats
  const liveStats = useMemo(() => {
    const allSets = store.exercises.flatMap((e) => e.sets);
    const completed = allSets.filter((s) => s.isCompleted);
    const vol = calcTotalVolume(
      allSets.map((s) => ({
        weight: s.weight,
        reps: s.reps,
        isCompleted: s.isCompleted ? 1 : 0,
      }))
    );
    return {
      completedSets: completed.length,
      totalSets: allSets.length,
      volume: vol,
    };
  }, [store.exercises]);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <HapticPressable onPress={handleDiscard}>
          <Text style={styles.discardText}>Discard</Text>
        </HapticPressable>

        <HapticPressable style={styles.timerContainer} scaleOnPress={false}>
          <Ionicons name="time-outline" size={16} color={colors.primary} />
          <Text style={styles.timerText}>{formatDuration(elapsed)}</Text>
        </HapticPressable>

        <Button title="Finish" onPress={handleFinish} size="sm" />
      </View>

      {/* Workout Name */}
      <View style={styles.nameRow}>
        <TextInput
          style={styles.workoutName}
          value={store.workoutName}
          onChangeText={store.setWorkoutName}
          placeholder="Workout Name"
          placeholderTextColor={colors.textMuted}
        />
      </View>

      {/* Live Stats Bar */}
      <View style={styles.liveStats}>
        <View style={styles.liveStatItem}>
          <Text style={styles.liveStatValue}>
            {liveStats.completedSets}/{liveStats.totalSets}
          </Text>
          <Text style={styles.liveStatLabel}>Sets</Text>
        </View>
        <View style={styles.liveStatDivider} />
        <View style={styles.liveStatItem}>
          <Text style={styles.liveStatValue}>
            {liveStats.volume > 0
              ? formatVolume(liveStats.volume, unit)
              : `0 ${unit}`}
          </Text>
          <Text style={styles.liveStatLabel}>Volume</Text>
        </View>
        <View style={styles.liveStatDivider} />
        <View style={styles.liveStatItem}>
          <Text style={styles.liveStatValue}>
            {store.exercises.length}
          </Text>
          <Text style={styles.liveStatLabel}>Exercises</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={100}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Empty State */}
          {store.exercises.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons
                name="barbell-outline"
                size={64}
                color={colors.textMuted}
              />
              <Text style={styles.emptyTitle}>Ready to lift?</Text>
              <Text style={styles.emptyDesc}>
                Add your first exercise to get started. Your previous weights
                and reps will be loaded automatically.
              </Text>
              <Button
                title="Add Exercise"
                onPress={() => router.push('/exercise/browse')}
                size="lg"
                style={styles.emptyButton}
              />
            </View>
          )}

          {/* Exercise List */}
          {store.exercises.map((exercise, exIndex) => {
            const prevSets = previousData[exercise.exerciseId] || [];
            const completedCount = exercise.sets.filter((s) => s.isCompleted).length;

            return (
              <DraggableExerciseCard
                key={exercise.id}
                index={exIndex}
                total={store.exercises.length}
                title={exercise.exerciseName}
                subtitle={`${completedCount}/${exercise.sets.length} sets`}
                collapsed={draggingIdx !== null}
                onDragStart={() => setDraggingIdx(exIndex)}
                onDragEnd={(from, to) => {
                  setDraggingIdx(null);
                  if (from !== to) handleReorderExercises(from, to);
                }}
                onDelete={() =>
                  handleRemoveExercise(exercise.id, exercise.exerciseName)
                }
              >
                <Card style={styles.exerciseCard} padding="md">
                  {/* Exercise Header */}
                  <View style={styles.exerciseHeader}>
                    <HapticPressable
                      onPress={() =>
                        router.push(`/exercise/${exercise.exerciseId}`)
                      }
                      style={styles.exerciseNameButton}
                      scaleOnPress={false}
                    >
                      <Text style={styles.exerciseName}>
                        {exercise.exerciseName}
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={14}
                        color={colors.primaryLight}
                      />
                    </HapticPressable>
                  </View>

                  {/* Set Headers */}
                  <View style={styles.setHeaders}>
                    <Text style={[styles.setHeaderText, { width: 36 }]}>
                      SET
                    </Text>
                    <Text style={[styles.setHeaderText, { width: 50 }]}>
                      PREV
                    </Text>
                    <Text style={[styles.setHeaderText, { flex: 1 }]}>
                      {unit.toUpperCase()}
                    </Text>
                    <Text style={[styles.setHeaderText, { flex: 1 }]}>
                      REPS
                    </Text>
                    <View style={{ width: 36 }} />
                  </View>

                  {/* Sets */}
                  {exercise.sets.map((s, setIndex) => (
                    <SwipeableSetRow
                      key={s.id}
                      setNumber={s.setNumber}
                      type={s.type}
                      weight={s.weight}
                      reps={s.reps}
                      isCompleted={s.isCompleted}
                      isPersonalRecord={s.isPersonalRecord}
                      previousWeight={prevSets[setIndex]?.weight}
                      previousReps={prevSets[setIndex]?.reps}
                      unit={unit}
                      onUpdateWeight={(v) =>
                        handleUpdateSet(exercise.id, s.id, 'weight', v)
                      }
                      onUpdateReps={(v) =>
                        handleUpdateSet(exercise.id, s.id, 'reps', v)
                      }
                      onComplete={() =>
                        handleCompleteSet(exercise.id, s.id)
                      }
                      onDelete={() =>
                        handleRemoveSet(exercise.id, s.id)
                      }
                      onChangeType={(type) =>
                        handleChangeType(exercise.id, s.id, type)
                      }
                    />
                  ))}

                  {/* Per-exercise Rest Time */}
                  {(() => {
                    const restSecs = exercise.restSeconds ?? defaultRest;
                    const m = Math.floor(restSecs / 60);
                    const s = restSecs % 60;
                    const label = m > 0
                      ? `${m}:${String(s).padStart(2, '0')}`
                      : `${s}s`;
                    return (
                      <View style={styles.exerciseRestRow}>
                        <Ionicons name="timer-outline" size={13} color={colors.textMuted} />
                        <Text style={styles.exerciseRestLabel}>Rest</Text>
                        <HapticPressable
                          onPress={() => handleAdjustExerciseRest(exercise.id, -15)}
                          style={styles.exerciseRestBtn}
                        >
                          <Text style={styles.exerciseRestBtnText}>-15s</Text>
                        </HapticPressable>
                        <Text style={styles.exerciseRestTime}>{label}</Text>
                        <HapticPressable
                          onPress={() => handleAdjustExerciseRest(exercise.id, +15)}
                          style={styles.exerciseRestBtn}
                        >
                          <Text style={styles.exerciseRestBtnText}>+15s</Text>
                        </HapticPressable>
                      </View>
                    );
                  })()}

                  {/* Add Set */}
                  <HapticPressable
                    onPress={() => handleAddSet(exercise.id)}
                    style={styles.addSetButton}
                  >
                    <Ionicons name="add" size={16} color={colors.primary} />
                    <Text style={styles.addSetText}>Add Set</Text>
                  </HapticPressable>
                </Card>
              </DraggableExerciseCard>
            );
          })}

          {/* Add Exercise Button */}
          {store.exercises.length > 0 && (
            <Button
              title="Add Exercise"
              onPress={() => router.push('/exercise/browse')}
              variant="secondary"
              fullWidth
              size="lg"
              style={styles.addExerciseButton}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Rest Timer */}
      {store.restTimerEndTime && <RestTimer />}

      {/* Workout Summary Modal */}
      {summaryData && (
        <WorkoutSummary
          visible={showSummary}
          onClose={handleSummaryClose}
          {...summaryData}
          unit={unit}
        />
      )}
    </SafeAreaView>
  );
}

// ── Rest Timer Component ──

function RestTimer() {
  const { restTimerEndTime, restTimerDuration, startRestTimer, clearRestTimer } =
    useActiveWorkoutStore();
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      if (restTimerEndTime) {
        const r = Math.max(
          0,
          Math.ceil((restTimerEndTime - Date.now()) / 1000)
        );
        setRemaining(r);
        if (r <= 0) {
          clearRestTimer();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
      }
    }, 100);
    return () => clearInterval(interval);
  }, [restTimerEndTime, clearRestTimer]);

  if (!restTimerEndTime || !restTimerDuration) return null;

  const progress = 1 - remaining / restTimerDuration;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  const adjustTimer = (delta: number) => {
    const newRemaining = Math.max(0, remaining + delta);
    if (newRemaining === 0) {
      clearRestTimer();
    } else {
      // Recalculate end time
      const newEndTime = Date.now() + newRemaining * 1000;
      const newDuration = restTimerDuration + delta;
      useActiveWorkoutStore.setState({
        restTimerEndTime: newEndTime,
        restTimerDuration: Math.max(newDuration, newRemaining),
      });
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <Animated.View
      entering={SlideInDown.duration(300)}
      style={styles.restTimer}
    >
      {/* Progress bar */}
      <View style={styles.restProgress}>
        <View
          style={[styles.restProgressBar, { width: `${progress * 100}%` }]}
        />
      </View>

      <View style={styles.restContent}>
        {/* -15s button */}
        <HapticPressable
          onPress={() => adjustTimer(-15)}
          style={styles.restAdjust}
        >
          <Text style={styles.restAdjustText}>-15</Text>
        </HapticPressable>

        {/* Timer display */}
        <View style={styles.restCenter}>
          <Ionicons name="timer-outline" size={18} color={colors.primary} />
          <Text style={styles.restTimeText}>
            {minutes > 0
              ? `${minutes}:${String(seconds).padStart(2, '0')}`
              : `${seconds}s`}
          </Text>
        </View>

        {/* +15s button */}
        <HapticPressable
          onPress={() => adjustTimer(15)}
          style={styles.restAdjust}
        >
          <Text style={styles.restAdjustText}>+15</Text>
        </HapticPressable>

        {/* Skip button */}
        <HapticPressable onPress={clearRestTimer} style={styles.restSkip}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </HapticPressable>
      </View>
    </Animated.View>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  discardText: {
    color: colors.danger,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  timerText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    fontVariant: ['tabular-nums'],
  },

  // Name
  nameRow: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  workoutName: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    padding: 0,
  },

  // Live Stats
  liveStats: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  liveStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  liveStatValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums'],
  },
  liveStatLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  liveStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },

  // Scroll
  scrollView: { flex: 1 },
  scrollContent: { padding: spacing.md, paddingBottom: 140 },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    marginTop: spacing.md,
  },
  emptyDesc: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  emptyButton: {
    marginTop: spacing.lg,
  },

  // Exercise Card
  exerciseCard: { marginBottom: spacing.md },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  exerciseNameButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  exerciseName: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },

  // Set Headers
  setHeaders: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  setHeaderText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Per-exercise Rest Row
  exerciseRestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    marginTop: spacing.xs,
  },
  exerciseRestLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    flex: 1,
  },
  exerciseRestBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceLight,
  },
  exerciseRestBtnText: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  exerciseRestTime: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    fontVariant: ['tabular-nums'],
    minWidth: 36,
    textAlign: 'center',
  },

  // Add Set
  addSetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  addSetText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },

  // Add Exercise
  addExerciseButton: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },

  // Rest Timer
  restTimer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  restProgress: {
    height: 3,
    backgroundColor: colors.surfaceLight,
  },
  restProgressBar: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  restContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  restAdjust: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceLight,
  },
  restAdjustText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums'],
  },
  restCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  restTimeText: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    fontVariant: ['tabular-nums'],
  },
  restSkip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
