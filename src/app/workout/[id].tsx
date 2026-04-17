import { useEffect, useState, useCallback, useRef } from 'react';
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
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { generateId as uuid } from '@/utils/id';
import { colors, spacing, fontSize, fontWeight, radius } from '@/ui/theme';
import { Card } from '@/ui/components/Card';
import { Badge } from '@/ui/components/Badge';
import { Button } from '@/ui/components/Button';
import { HapticPressable } from '@/ui/components/HapticPressable';
import { NumericInput } from '@/ui/components/NumericInput';
import { DraggableExerciseCard } from '@/features/workout/components/DraggableExerciseCard';
import { db } from '@/db/client';
import { workouts, workoutExercises, sets, exercises } from '@/db/schema';
import { eq, asc, sql } from 'drizzle-orm';
import { useAppStore } from '@/stores/appStore';
import { formatDuration, formatWeight, formatVolume } from '@/utils/formatting';
import { estimateOneRM } from '@/utils/calculations';

interface SetDetail {
  id: string;
  setNumber: number;
  type: string;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  isPersonalRecord: number | null;
}

interface ExerciseGroup {
  weId: string;
  exerciseId: string;
  exerciseName: string;
  category: string;
  primaryMuscle: string;
  notes: string | null;
  restSeconds: number | null;
  sortOrder: number;
  sets: SetDetail[];
}

interface WorkoutDetail {
  id: string;
  name: string;
  startedAt: string;
  completedAt: string | null;
  durationSeconds: number | null;
  totalVolume: number | null;
  notes: string | null;
}

type EditedSets = Record<
  string,
  { weight: number | null; reps: number | null; type: string }
>;

const SET_TYPE_ORDER = ['working', 'warmup', 'dropset', 'failure'] as const;

export default function WorkoutDetailScreen() {
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
  const router = useRouter();
  const unit = useAppStore((s) => s.unit);
  const [workout, setWorkout] = useState<WorkoutDetail | null>(null);
  const [exerciseGroups, setExerciseGroups] = useState<ExerciseGroup[]>([]);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editedSets, setEditedSets] = useState<EditedSets>({});
  const [editExercises, setEditExercises] = useState<ExerciseGroup[]>([]);
  const [editDurationMinutes, setEditDurationMinutes] = useState<number | null>(null);
  const [deletedSetIds, setDeletedSetIds] = useState<string[]>([]);
  const [deletedWeIds, setDeletedWeIds] = useState<string[]>([]);
  const [addedSets, setAddedSets] = useState<
    Array<{ id: string; weId: string; setNumber: number; type: string; weight: number | null; reps: number | null }>
  >([]);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const autoEditTriggered = useRef(false);

  useEffect(() => {
    if (id) {
      loadWorkout();
      loadExercises();
    }
  }, [id]);

  // Reload when returning from exercise browse (after adding exercise in edit mode)
  const wasEditing = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (wasEditing.current && id) {
        // Returning from browse after adding exercise - reload and re-enter edit
        loadWorkout();
        loadExercises().then(() => {
          // Will re-enter edit via the effect below
        });
      }
    }, [id])
  );

  // Re-enter edit mode after data refreshes from adding exercise
  useEffect(() => {
    if (wasEditing.current && exerciseGroups.length > 0 && workout) {
      wasEditing.current = false;
      enterEdit();
    }
  }, [exerciseGroups, workout]);

  const loadWorkout = async () => {
    try {
      const result = await db
        .select()
        .from(workouts)
        .where(eq(workouts.id, id!))
        .limit(1);

      if (result[0]) {
        const w = result[0];
        setWorkout({
          id: w.id,
          name: w.name,
          startedAt: w.startedAt,
          completedAt: w.completedAt,
          durationSeconds: w.durationSeconds,
          totalVolume: w.totalVolume,
          notes: w.notes,
        });
      }
    } catch {}
  };

  const loadExercises = async () => {
    try {
      const result = await db
        .select({
          weId: workoutExercises.id,
          exerciseId: workoutExercises.exerciseId,
          sortOrder: workoutExercises.sortOrder,
          weNotes: workoutExercises.notes,
          restSeconds: workoutExercises.restSeconds,
          exerciseName: exercises.name,
          category: exercises.category,
          primaryMuscle: exercises.primaryMuscle,
          setId: sets.id,
          setNumber: sets.setNumber,
          setType: sets.type,
          weight: sets.weight,
          reps: sets.reps,
          rpe: sets.rpe,
          isPersonalRecord: sets.isPersonalRecord,
        })
        .from(workoutExercises)
        .innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
        .innerJoin(sets, eq(sets.workoutExerciseId, workoutExercises.id))
        .where(eq(workoutExercises.workoutId, id!))
        .orderBy(asc(workoutExercises.sortOrder), asc(sets.setNumber));

      const groupMap = new Map<string, ExerciseGroup>();
      for (const r of result) {
        if (!groupMap.has(r.weId)) {
          groupMap.set(r.weId, {
            weId: r.weId,
            exerciseId: r.exerciseId,
            exerciseName: r.exerciseName,
            category: r.category,
            primaryMuscle: r.primaryMuscle,
            notes: r.weNotes,
            restSeconds: r.restSeconds,
            sortOrder: r.sortOrder,
            sets: [],
          });
        }
        groupMap.get(r.weId)!.sets.push({
          id: r.setId,
          setNumber: r.setNumber,
          type: r.setType,
          weight: r.weight,
          reps: r.reps,
          rpe: r.rpe,
          isPersonalRecord: r.isPersonalRecord,
        });
      }

      setExerciseGroups(Array.from(groupMap.values()));
    } catch {}
  };

  // Auto-enter edit mode when navigated with ?edit=1
  useEffect(() => {
    if (
      edit === '1' &&
      workout &&
      exerciseGroups.length > 0 &&
      !autoEditTriggered.current
    ) {
      autoEditTriggered.current = true;
      enterEdit();
    }
  }, [edit, workout, exerciseGroups]);

  const enterEdit = useCallback(() => {
    setEditName(workout?.name ?? '');
    setEditDurationMinutes(
      workout?.durationSeconds ? Math.round(workout.durationSeconds / 60) : null
    );
    const initial: EditedSets = {};
    for (const g of exerciseGroups) {
      for (const s of g.sets) {
        initial[s.id] = { weight: s.weight, reps: s.reps, type: s.type };
      }
    }
    setEditedSets(initial);
    setEditExercises(JSON.parse(JSON.stringify(exerciseGroups)));
    setDeletedSetIds([]);
    setDeletedWeIds([]);
    setAddedSets([]);
    setIsEditing(true);
  }, [workout, exerciseGroups]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditedSets({});
    setEditExercises([]);
    setDeletedSetIds([]);
    setDeletedWeIds([]);
    setAddedSets([]);
  }, []);

  // ─── Edit operations ───

  const editUpdateSet = (
    setId: string,
    field: 'weight' | 'reps',
    value: number | null
  ) => {
    setEditedSets((prev) => ({
      ...prev,
      [setId]: { ...prev[setId], [field]: value },
    }));
  };

  const editCycleSetType = (setId: string) => {
    setEditedSets((prev) => {
      const current = prev[setId]?.type || 'working';
      const idx = SET_TYPE_ORDER.indexOf(current as any);
      const next = SET_TYPE_ORDER[(idx + 1) % SET_TYPE_ORDER.length];
      return { ...prev, [setId]: { ...prev[setId], type: next } };
    });
    // Also update in editExercises for display
    setEditExercises((prev) =>
      prev.map((g) => ({
        ...g,
        sets: g.sets.map((s) => {
          if (s.id === setId) {
            const idx = SET_TYPE_ORDER.indexOf(s.type as any);
            return {
              ...s,
              type: SET_TYPE_ORDER[(idx + 1) % SET_TYPE_ORDER.length],
            };
          }
          return s;
        }),
      }))
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const editDeleteSet = (weId: string, setId: string) => {
    setDeletedSetIds((prev) => [...prev, setId]);
    setEditExercises((prev) =>
      prev.map((g) =>
        g.weId === weId
          ? {
              ...g,
              sets: g.sets
                .filter((s) => s.id !== setId)
                .map((s, i) => ({ ...s, setNumber: i + 1 })),
            }
          : g
      )
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const editAddSet = (weId: string) => {
    const group = editExercises.find((g) => g.weId === weId);
    if (!group) return;
    const lastSet = group.sets[group.sets.length - 1];
    const newSetId = uuid();
    const newSet: SetDetail = {
      id: newSetId,
      setNumber: group.sets.length + 1,
      type: 'working',
      weight: lastSet?.weight ?? null,
      reps: lastSet?.reps ?? null,
      rpe: null,
      isPersonalRecord: null,
    };
    setEditExercises((prev) =>
      prev.map((g) =>
        g.weId === weId ? { ...g, sets: [...g.sets, newSet] } : g
      )
    );
    setEditedSets((prev) => ({
      ...prev,
      [newSetId]: {
        weight: newSet.weight,
        reps: newSet.reps,
        type: newSet.type,
      },
    }));
    setAddedSets((prev) => [
      ...prev,
      {
        id: newSetId,
        weId,
        setNumber: newSet.setNumber,
        type: newSet.type,
        weight: newSet.weight,
        reps: newSet.reps,
      },
    ]);
  };

  const editDeleteExercise = (weId: string, name: string) => {
    Alert.alert('Remove Exercise', `Remove ${name} from this workout?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          // Track sets to delete
          const group = editExercises.find((g) => g.weId === weId);
          if (group) {
            setDeletedSetIds((prev) => [
              ...prev,
              ...group.sets.map((s) => s.id),
            ]);
          }
          setDeletedWeIds((prev) => [...prev, weId]);
          setEditExercises((prev) =>
            prev
              .filter((g) => g.weId !== weId)
              .map((g, i) => ({ ...g, sortOrder: i }))
          );
          // Remove from added sets if any
          setAddedSets((prev) => prev.filter((s) => s.weId !== weId));
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        },
      },
    ]);
  };

  const editMoveExercise = (fromIndex: number, toIndex: number) => {
    setEditExercises((prev) => {
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex >= prev.length) return prev;
      const newArr = [...prev];
      const [moved] = newArr.splice(fromIndex, 1);
      newArr.splice(toIndex, 0, moved);
      return newArr.map((g, i) => ({ ...g, sortOrder: i }));
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const editAddExercise = () => {
    // Mark that we're editing so on return we re-enter edit mode
    wasEditing.current = true;
    setIsEditing(false); // Temporarily exit edit to allow clean reload
    router.push({
      pathname: '/exercise/browse',
      params: { returnTo: 'editWorkout', workoutId: id },
    });
  };

  // ─── Save ───

  const saveEdit = useCallback(async () => {
    if (!workout) return;
    try {
      const name = editName.trim() || workout.name;
      const durationSeconds = editDurationMinutes
        ? editDurationMinutes * 60
        : workout.durationSeconds;

      // Delete removed sets
      for (const setId of deletedSetIds) {
        await db.delete(sets).where(eq(sets.id, setId));
      }

      // Delete removed exercises
      for (const weId of deletedWeIds) {
        await db
          .delete(sets)
          .where(eq(sets.workoutExerciseId, weId));
        await db
          .delete(workoutExercises)
          .where(eq(workoutExercises.id, weId));
      }

      // Insert new sets
      for (const ns of addedSets) {
        // Skip if the parent exercise was deleted
        if (deletedWeIds.includes(ns.weId)) continue;
        const edited = editedSets[ns.id];
        await db.insert(sets).values({
          id: ns.id,
          workoutExerciseId: ns.weId,
          setNumber: ns.setNumber,
          type: edited?.type || ns.type,
          weight: edited?.weight ?? ns.weight,
          reps: edited?.reps ?? ns.reps,
        });
      }

      // Update existing sets (weight, reps, type)
      for (const [setId, vals] of Object.entries(editedSets)) {
        if (deletedSetIds.includes(setId)) continue;
        if (addedSets.some((s) => s.id === setId)) continue;
        await db
          .update(sets)
          .set({ weight: vals.weight, reps: vals.reps, type: vals.type })
          .where(eq(sets.id, setId));
      }

      // Update exercise sort orders
      for (const ex of editExercises) {
        if (deletedWeIds.includes(ex.weId)) continue;
        await db
          .update(workoutExercises)
          .set({ sortOrder: ex.sortOrder })
          .where(eq(workoutExercises.id, ex.weId));

        // Update set numbers for renumbered sets
        for (const s of ex.sets) {
          if (deletedSetIds.includes(s.id)) continue;
          await db
            .update(sets)
            .set({ setNumber: s.setNumber })
            .where(eq(sets.id, s.id));
        }
      }

      // Recalculate total volume
      const newVol = editExercises
        .filter((g) => !deletedWeIds.includes(g.weId))
        .flatMap((g) => g.sets)
        .filter((s) => !deletedSetIds.includes(s.id))
        .reduce((sum, s) => {
          const edited = editedSets[s.id];
          const w = edited?.weight ?? s.weight;
          const r = edited?.reps ?? s.reps;
          const t = edited?.type ?? s.type;
          return t !== 'warmup' && w && r ? sum + w * r : sum;
        }, 0);

      await db
        .update(workouts)
        .set({
          name,
          totalVolume: newVol,
          durationSeconds,
        })
        .where(eq(workouts.id, workout.id));

      setIsEditing(false);
      setEditedSets({});
      setEditExercises([]);
      setDeletedSetIds([]);
      setDeletedWeIds([]);
      setAddedSets([]);
      await loadWorkout();
      await loadExercises();
    } catch {}
  }, [
    workout,
    editName,
    editDurationMinutes,
    editedSets,
    editExercises,
    deletedSetIds,
    deletedWeIds,
    addedSets,
  ]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete Workout',
      'This will permanently delete this workout and all its data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (!workout) return;
              for (const g of exerciseGroups) {
                await db
                  .delete(sets)
                  .where(eq(sets.workoutExerciseId, g.weId));
                await db
                  .delete(workoutExercises)
                  .where(eq(workoutExercises.id, g.weId));
              }
              await db.delete(workouts).where(eq(workouts.id, workout.id));
              router.back();
            } catch {}
          },
        },
      ]
    );
  }, [workout, exerciseGroups, router]);

  const showMenu = useCallback(() => {
    Alert.alert(workout?.name ?? 'Workout', '', [
      { text: 'Edit Workout', onPress: enterEdit },
      {
        text: 'Delete Workout',
        style: 'destructive',
        onPress: handleDelete,
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [workout, enterEdit, handleDelete]);

  if (!workout) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Summary stats
  const displayGroups = isEditing ? editExercises : exerciseGroups;
  const totalSets = displayGroups.reduce(
    (sum, g) =>
      sum +
      g.sets.filter(
        (s) =>
          (isEditing
            ? editedSets[s.id]?.type ?? s.type
            : s.type) !== 'warmup'
      ).length,
    0
  );
  const totalPRs = displayGroups.reduce(
    (sum, g) => sum + g.sets.filter((s) => s.isPersonalRecord).length,
    0
  );
  const muscles = [
    ...new Set(displayGroups.map((g) => g.primaryMuscle)),
  ];

  const startDate = new Date(workout.startedAt);
  const dayOfWeek = startDate.toLocaleDateString('en-US', {
    weekday: 'long',
  });
  const fullDate = startDate.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const startTime = startDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const displayDuration = isEditing
    ? editDurationMinutes
      ? editDurationMinutes * 60
      : workout.durationSeconds
    : workout.durationSeconds;

  const SET_TYPE_LABELS: Record<string, string> = {
    warmup: 'W',
    working: '',
    dropset: 'D',
    failure: 'F',
  };
  const SET_TYPE_COLORS: Record<string, string> = {
    warmup: colors.warning,
    working: colors.textSecondary,
    dropset: colors.secondary,
    failure: colors.danger,
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <HapticPressable
          onPress={isEditing ? cancelEdit : () => router.back()}
        >
          {isEditing ? (
            <Text style={styles.cancelText}>Cancel</Text>
          ) : (
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          )}
        </HapticPressable>

        {isEditing ? (
          <TextInput
            style={styles.headerNameInput}
            value={editName}
            onChangeText={setEditName}
            placeholder="Workout Name"
            placeholderTextColor={colors.textMuted}
            selectTextOnFocus
          />
        ) : (
          <Text style={styles.headerTitle} numberOfLines={1}>
            {workout.name}
          </Text>
        )}

        {isEditing ? (
          <HapticPressable onPress={saveEdit}>
            <Text style={styles.saveText}>Save</Text>
          </HapticPressable>
        ) : (
          <HapticPressable onPress={showMenu}>
            <Ionicons
              name="ellipsis-horizontal"
              size={24}
              color={colors.text}
            />
          </HapticPressable>
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Date & Time */}
          <Text style={styles.dateText}>
            {dayOfWeek}, {fullDate}
          </Text>
          <Text style={styles.timeText}>{startTime}</Text>

          {/* Summary Row */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              {isEditing ? (
                <View style={styles.durationEditRow}>
                  <NumericInput
                    value={editDurationMinutes}
                    onChangeValue={setEditDurationMinutes}
                    step={1}
                    min={1}
                    max={600}
                    compact
                  />
                  <Text style={styles.durationUnit}>min</Text>
                </View>
              ) : (
                <Text style={styles.summaryValue}>
                  {displayDuration
                    ? formatDuration(displayDuration)
                    : '--'}
                </Text>
              )}
              <Text style={styles.summaryLabel}>Duration</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>
                {workout.totalVolume
                  ? formatVolume(workout.totalVolume, unit)
                  : '--'}
              </Text>
              <Text style={styles.summaryLabel}>Volume</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{totalSets}</Text>
              <Text style={styles.summaryLabel}>Working Sets</Text>
            </View>
            {totalPRs > 0 && !isEditing && (
              <>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                  <Text
                    style={[
                      styles.summaryValue,
                      { color: colors.success },
                    ]}
                  >
                    {totalPRs}
                  </Text>
                  <Text style={styles.summaryLabel}>PRs</Text>
                </View>
              </>
            )}
          </View>

          {/* Muscle tags */}
          {muscles.length > 0 && !isEditing && (
            <View style={styles.muscleTags}>
              {muscles.map((m) => (
                <Badge key={m} label={m} variant="primary" />
              ))}
            </View>
          )}

          {/* Notes */}
          {workout.notes && !isEditing && (
            <Card style={styles.notesCard} padding="md">
              <Text style={styles.notesLabel}>Notes</Text>
              <Text style={styles.notesText}>{workout.notes}</Text>
            </Card>
          )}

          {/* Exercises */}
          {displayGroups.map((group, gIdx) => {
            const groupVolume = group.sets.reduce((sum, s) => {
              const edited = editedSets[s.id];
              const w = isEditing
                ? edited?.weight ?? s.weight
                : s.weight;
              const r = isEditing
                ? edited?.reps ?? s.reps
                : s.reps;
              const t = isEditing
                ? edited?.type ?? s.type
                : s.type;
              return t !== 'warmup' && w && r ? sum + w * r : sum;
            }, 0);

            const bestSet = group.sets.reduce(
              (best, s) => {
                const edited = editedSets[s.id];
                const t = isEditing
                  ? edited?.type ?? s.type
                  : s.type;
                if (t === 'warmup') return best;
                const w = isEditing
                  ? edited?.weight ?? s.weight
                  : s.weight;
                const r = isEditing
                  ? edited?.reps ?? s.reps
                  : s.reps;
                if (!w || !r) return best;
                const e1rm = estimateOneRM(w, r);
                return e1rm > best.e1rm
                  ? { e1rm, weight: w, reps: r }
                  : best;
              },
              { e1rm: 0, weight: 0, reps: 0 }
            );

            const cardContent = (
              <Card style={styles.exerciseCard} padding="md">
                {/* Exercise header */}
                <View style={styles.exerciseHeader}>
                  <HapticPressable
                    onPress={
                      isEditing
                        ? undefined
                        : () =>
                            router.push(
                              `/exercise/${group.exerciseId}`
                            )
                    }
                    disabled={isEditing}
                    style={styles.exerciseInfo}
                  >
                    <Text style={styles.exerciseName}>
                      {group.exerciseName}
                    </Text>
                    <Text style={styles.exerciseMeta}>
                      {group.sets.filter(
                        (s) =>
                          (isEditing
                            ? editedSets[s.id]?.type ?? s.type
                            : s.type) !== 'warmup'
                      ).length}{' '}
                      sets
                      {groupVolume > 0 &&
                        ` · ${formatVolume(groupVolume, unit)}`}
                      {!isEditing &&
                        bestSet.e1rm > 0 &&
                        ` · e1RM ${formatWeight(bestSet.e1rm, unit)}`}
                    </Text>
                  </HapticPressable>

                  {!isEditing && (
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={colors.textMuted}
                    />
                  )}
                </View>

                {group.notes && !isEditing && (
                  <Text style={styles.exerciseNotes}>{group.notes}</Text>
                )}

                {/* Set table */}
                <View style={styles.setTable}>
                  {/* Header row */}
                  <View style={styles.setRow}>
                    <Text
                      style={[styles.setCellHeader, styles.setCellSet]}
                    >
                      Set
                    </Text>
                    <Text
                      style={[
                        styles.setCellHeader,
                        styles.setCellWeight,
                      ]}
                    >
                      {unit.toUpperCase()}
                    </Text>
                    <Text
                      style={[styles.setCellHeader, styles.setCellReps]}
                    >
                      Reps
                    </Text>
                    {!isEditing && (
                      <Text
                        style={[
                          styles.setCellHeader,
                          styles.setCellRpe,
                        ]}
                      >
                        RPE
                      </Text>
                    )}
                    {isEditing && (
                      <View style={styles.setCellAction} />
                    )}
                  </View>

                  {/* Set rows */}
                  {group.sets.map((s, sIdx) => {
                    const edited = editedSets[s.id];
                    const editW = edited?.weight ?? s.weight;
                    const editR = edited?.reps ?? s.reps;
                    const displayType = isEditing
                      ? edited?.type ?? s.type
                      : s.type;
                    const typeLabel =
                      SET_TYPE_LABELS[displayType] || String(s.setNumber);
                    const typeColor =
                      SET_TYPE_COLORS[displayType] || colors.textSecondary;

                    return (
                      <View
                        key={s.id}
                        style={[
                          styles.setRow,
                          !isEditing &&
                            !!s.isPersonalRecord &&
                            styles.prRow,
                        ]}
                      >
                        {/* Set number / type */}
                        <View style={styles.setCellSet}>
                          {isEditing ? (
                            <HapticPressable
                              onPress={() => editCycleSetType(s.id)}
                            >
                              <View style={styles.setTypeBadge}>
                                <Text
                                  style={[
                                    styles.setTypeText,
                                    { color: typeColor },
                                  ]}
                                >
                                  {displayType === 'working'
                                    ? String(s.setNumber)
                                    : typeLabel}
                                </Text>
                              </View>
                            </HapticPressable>
                          ) : displayType === 'warmup' ? (
                            <Badge label="W" variant="muted" />
                          ) : (
                            <Text style={styles.setCellText}>
                              {s.setNumber}
                            </Text>
                          )}
                        </View>

                        {/* Weight */}
                        {isEditing ? (
                          <View style={styles.setCellWeight}>
                            <NumericInput
                              value={editW}
                              onChangeValue={(v) =>
                                editUpdateSet(s.id, 'weight', v)
                              }
                              step={5}
                              compact
                            />
                          </View>
                        ) : (
                          <Text
                            style={[
                              styles.setCellWeight,
                              styles.setCellText,
                            ]}
                          >
                            {s.weight != null
                              ? `${s.weight} ${unit}`
                              : '—'}
                          </Text>
                        )}

                        {/* Reps */}
                        {isEditing ? (
                          <View style={styles.setCellReps}>
                            <NumericInput
                              value={editR}
                              onChangeValue={(v) =>
                                editUpdateSet(s.id, 'reps', v)
                              }
                              step={1}
                              min={0}
                              compact
                            />
                          </View>
                        ) : (
                          <Text
                            style={[
                              styles.setCellReps,
                              styles.setCellText,
                            ]}
                          >
                            {s.reps != null ? s.reps : '—'}
                          </Text>
                        )}

                        {/* RPE / Actions */}
                        {isEditing ? (
                          <View style={styles.setCellAction}>
                            <HapticPressable
                              onPress={() =>
                                editDeleteSet(group.weId, s.id)
                              }
                            >
                              <Ionicons
                                name="close-circle"
                                size={22}
                                color={colors.danger}
                              />
                            </HapticPressable>
                          </View>
                        ) : (
                          <View
                            style={[
                              styles.setCellRpe,
                              styles.rpeCell,
                            ]}
                          >
                            <Text style={styles.setCellText}>
                              {s.rpe != null ? s.rpe : '—'}
                            </Text>
                            {!!s.isPersonalRecord && (
                              <Badge label="PR" variant="success" />
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}

                  {/* Add Set button (edit mode) */}
                  {isEditing && (
                    <HapticPressable
                      onPress={() => editAddSet(group.weId)}
                    >
                      <View style={styles.addSetButton}>
                        <Ionicons
                          name="add"
                          size={16}
                          color={colors.primary}
                        />
                        <Text style={styles.addSetText}>Add Set</Text>
                      </View>
                    </HapticPressable>
                  )}
                </View>
              </Card>
            );

            if (isEditing) {
              const setCount = group.sets.filter(
                (s) =>
                  (editedSets[s.id]?.type ?? s.type) !== 'warmup'
              ).length;
              return (
                <DraggableExerciseCard
                  key={group.weId}
                  index={gIdx}
                  total={displayGroups.length}
                  title={group.exerciseName}
                  subtitle={`${setCount} sets`}
                  collapsed={draggingIdx !== null}
                  onDragStart={() => setDraggingIdx(gIdx)}
                  onDragEnd={(from, to) => {
                    setDraggingIdx(null);
                    if (from !== to) editMoveExercise(from, to);
                  }}
                  onDelete={() =>
                    editDeleteExercise(group.weId, group.exerciseName)
                  }
                >
                  {cardContent}
                </DraggableExerciseCard>
              );
            }
            return <View key={group.weId}>{cardContent}</View>;
          })}

          {/* Add Exercise button (edit mode) */}
          {isEditing && (
            <HapticPressable onPress={editAddExercise}>
              <View style={styles.addExerciseButton}>
                <Ionicons
                  name="add-circle-outline"
                  size={22}
                  color={colors.primary}
                />
                <Text style={styles.addExerciseText}>
                  Add Exercise
                </Text>
              </View>
            </HapticPressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: colors.textSecondary, fontSize: fontSize.md },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    flex: 1,
  },
  headerNameInput: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    flex: 1,
    padding: 0,
  },
  cancelText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
  saveText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },

  content: { padding: spacing.md, paddingBottom: spacing.xxl },

  dateText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  timeText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
    marginBottom: spacing.md,
  },

  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    fontVariant: ['tabular-nums'],
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },

  // Duration edit
  durationEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  durationUnit: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },

  muscleTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },

  notesCard: { marginBottom: spacing.md },
  notesLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  notesText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },

  exerciseCard: { marginBottom: spacing.sm },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  exerciseInfo: { flex: 1 },
  exerciseName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  exerciseMeta: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  exerciseNotes: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontStyle: 'italic',
    marginBottom: spacing.sm,
  },

  setTable: { marginTop: spacing.xs },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  prRow: { backgroundColor: colors.successMuted },

  setCellHeader: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  setCellText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontVariant: ['tabular-nums'],
  },

  setCellSet: { width: 40, alignItems: 'center' },
  setCellWeight: { flex: 2, paddingLeft: spacing.sm },
  setCellReps: { flex: 1, paddingLeft: spacing.xs },
  setCellRpe: {
    flex: 1,
    alignItems: 'flex-end',
    paddingRight: spacing.xs,
  },
  setCellAction: { width: 36, alignItems: 'center' },
  rpeCell: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  // Set type badge (edit mode)
  setTypeBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setTypeText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },

  // Add set button
  addSetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
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

  // Add exercise button
  addExerciseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderStyle: 'dashed',
    marginTop: spacing.sm,
  },
  addExerciseText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },

});
