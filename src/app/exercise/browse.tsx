import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  FlatList,
  View,
  Text,
  TextInput,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { generateId as uuid } from '@/utils/id';
import { colors, spacing, fontSize, fontWeight, radius } from '@/ui/theme';
import { HapticPressable } from '@/ui/components/HapticPressable';
import { db } from '@/db/client';
import { exercises, sets, workoutExercises, workouts } from '@/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import {
  MUSCLE_GROUP_LABELS,
  CATEGORY_LABELS,
  type MuscleGroup,
  type ExerciseCategory,
} from '@/utils/constants';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';

interface ExerciseItem {
  id: string;
  name: string;
  category: string;
  primaryMuscle: string;
  equipment: string | null;
}

const MUSCLE_FILTERS: MuscleGroup[] = [
  'chest',
  'upper_back',
  'lats',
  'front_delts',
  'side_delts',
  'rear_delts',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'abs',
];

export default function ExerciseBrowseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    returnTo?: string;
    workoutId?: string;
  }>();
  const isActive = useActiveWorkoutStore((s) => s.isActive);
  const workoutId = useActiveWorkoutStore((s) => s.workoutId);
  const isEditMode = params.returnTo === 'editWorkout' && !!params.workoutId;
  const isAddMode = isActive || isEditMode;
  const [allExercises, setAllExercises] = useState<ExerciseItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup | null>(
    null
  );
  // Maps exerciseId -> workoutExerciseId (so we can undo an add)
  const [addedMap, setAddedMap] = useState<Map<string, string>>(new Map());
  const [busyId, setBusyId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadExercises();
    }, [])
  );

  const loadExercises = async () => {
    try {
      const result = await db
        .select({
          id: exercises.id,
          name: exercises.name,
          category: exercises.category,
          primaryMuscle: exercises.primaryMuscle,
          equipment: exercises.equipment,
        })
        .from(exercises)
        .where(eq(exercises.isArchived, 0))
        .orderBy(exercises.name);

      setAllExercises(result);
    } catch {}
  };

  const filtered = useMemo(() => {
    let list = allExercises;

    if (selectedMuscle) {
      list = list.filter((e) => e.primaryMuscle === selectedMuscle);
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.primaryMuscle.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q)
      );
    }

    return list;
  }, [allExercises, search, selectedMuscle]);

  const handleUndoAdd = async (exerciseId: string) => {
    const weId = addedMap.get(exerciseId);
    if (!weId) return;
    if (busyId === exerciseId) return;
    setBusyId(exerciseId);
    try {
      // Active workout: remove from store
      if (isActive) {
        const store = useActiveWorkoutStore.getState();
        store.removeExercise(weId);
      }
      // Remove from DB (both active and edit modes)
      await db.delete(sets).where(eq(sets.workoutExerciseId, weId));
      await db.delete(workoutExercises).where(eq(workoutExercises.id, weId));

      setAddedMap((prev) => {
        const next = new Map(prev);
        next.delete(exerciseId);
        return next;
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } finally {
      setBusyId(null);
    }
  };

  const handleSelect = async (exercise: ExerciseItem) => {
    // Browse-only mode: navigate to detail
    if (!isAddMode) {
      router.push(`/exercise/${exercise.id}`);
      return;
    }

    // Already added? Toggle off.
    if (addedMap.has(exercise.id)) {
      await handleUndoAdd(exercise.id);
      return;
    }

    // Prevent double-tap
    if (busyId === exercise.id) return;
    setBusyId(exercise.id);

    let createdWeId: string | null = null;

    try {
      // Adding exercise to a completed workout being edited
      if (isEditMode && params.workoutId) {
        const editWorkoutId = params.workoutId;
        const weId = uuid();
        createdWeId = weId;

        const existingExercises = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(workoutExercises)
          .where(eq(workoutExercises.workoutId, editWorkoutId));
        const sortOrder = (existingExercises[0]?.count ?? 0) + addedMap.size;

        let previousSets: Array<{ weight: number | null; reps: number | null }> = [];
        try {
          const lastSets = await db
            .select({ weight: sets.weight, reps: sets.reps })
            .from(sets)
            .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
            .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
            .where(
              and(
                eq(workoutExercises.exerciseId, exercise.id),
                eq(sets.isCompleted, 1),
                sql`${workouts.completedAt} IS NOT NULL`,
                sql`${workouts.id} != ${editWorkoutId}`
              )
            )
            .orderBy(desc(workouts.startedAt), sets.setNumber)
            .limit(10);
          if (lastSets.length > 0) previousSets = lastSets;
        } catch {}

        const defaultSets = previousSets.length > 0
          ? previousSets.map((ps, i) => ({
              id: uuid(), setNumber: i + 1, type: 'working' as const,
              weight: ps.weight, reps: ps.reps,
            }))
          : [1, 2, 3].map((n) => ({
              id: uuid(), setNumber: n, type: 'working' as const,
              weight: null, reps: null,
            }));

        await db.insert(workoutExercises).values({
          id: weId,
          workoutId: editWorkoutId,
          exerciseId: exercise.id,
          sortOrder,
        });

        for (const s of defaultSets) {
          await db.insert(sets).values({
            id: s.id,
            workoutExerciseId: weId,
            setNumber: s.setNumber,
            type: s.type,
            weight: s.weight,
            reps: s.reps,
            isCompleted: 1,
          });
        }
      }

      // Adding exercise to an active workout
      if (isActive && workoutId) {
        const store = useActiveWorkoutStore.getState();
        const weId = uuid();
        createdWeId = weId;

        let previousSets: Array<{ weight: number | null; reps: number | null }> = [];
        try {
          const lastSets = await db
            .select({ weight: sets.weight, reps: sets.reps })
            .from(sets)
            .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
            .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
            .where(
              and(
                eq(workoutExercises.exerciseId, exercise.id),
                eq(sets.isCompleted, 1),
                sql`${workouts.completedAt} IS NOT NULL`,
                sql`${workouts.id} != ${workoutId}`
              )
            )
            .orderBy(desc(workouts.startedAt), sets.setNumber)
            .limit(10);
          if (lastSets.length > 0) previousSets = lastSets;
        } catch {}

        const defaultSets = previousSets.length > 0
          ? previousSets.map((ps, i) => ({
              id: uuid(), setNumber: i + 1, type: 'working' as const,
              weight: ps.weight, reps: ps.reps, rpe: null,
              isCompleted: false, isPersonalRecord: false,
            }))
          : [1, 2, 3].map((n) => ({
              id: uuid(), setNumber: n, type: 'working' as const,
              weight: null, reps: null, rpe: null,
              isCompleted: false, isPersonalRecord: false,
            }));

        store.addExercise({
          id: weId,
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          sortOrder: store.exercises.length,
          sets: defaultSets,
          restSeconds: null,
          notes: '',
        });

        await db.insert(workoutExercises).values({
          id: weId,
          workoutId,
          exerciseId: exercise.id,
          sortOrder: store.exercises.length - 1,
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

      if (createdWeId) {
        const finalWeId = createdWeId;
        setAddedMap((prev) => {
          const next = new Map(prev);
          next.set(exercise.id, finalWeId);
          return next;
        });
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } finally {
      setBusyId(null);
    }
  };

  const renderItem = ({ item }: { item: ExerciseItem }) => {
    const wasAdded = addedMap.has(item.id);
    return (
      <HapticPressable onPress={() => handleSelect(item)}>
        <View style={styles.exerciseRow}>
          <View style={styles.exerciseInfo}>
            <Text style={styles.exerciseName}>{item.name}</Text>
            <Text style={styles.exerciseMeta}>
              {MUSCLE_GROUP_LABELS[item.primaryMuscle as MuscleGroup] ||
                item.primaryMuscle}
              {item.equipment && ` · ${item.equipment}`}
            </Text>
          </View>
          {isAddMode ? (
            wasAdded ? (
              <View style={styles.addedIcon}>
                <Ionicons name="checkmark" size={18} color={colors.text} />
              </View>
            ) : (
              <View style={styles.addIcon}>
                <Ionicons name="add" size={20} color={colors.text} />
              </View>
            )
          ) : (
            <Ionicons
              name="chevron-forward"
              size={20}
              color={colors.textMuted}
            />
          )}
        </View>
      </HapticPressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <HapticPressable onPress={() => router.back()}>
          <Ionicons name="close" size={28} color={colors.text} />
        </HapticPressable>
        <Text style={styles.title}>
          {isAddMode
            ? addedMap.size > 0
              ? `Add Exercise (${addedMap.size})`
              : 'Add Exercise'
            : 'Exercises'}
        </Text>
        {isAddMode && addedMap.size > 0 ? (
          <HapticPressable onPress={() => router.back()}>
            <Text style={styles.doneText}>Done</Text>
          </HapticPressable>
        ) : (
          <HapticPressable onPress={() => router.push('/exercise/create')}>
            <Ionicons name="add-circle-outline" size={28} color={colors.primary} />
          </HapticPressable>
        )}
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search exercises..."
          placeholderTextColor={colors.textMuted}
          autoFocus={isActive}
        />
        {search.length > 0 && (
          <HapticPressable onPress={() => setSearch('')}>
            <Ionicons
              name="close-circle"
              size={18}
              color={colors.textMuted}
            />
          </HapticPressable>
        )}
      </View>

      {/* Muscle Group Filters */}
      <View style={styles.filterWrapper}>
        <FlatList
          horizontal
          data={MUSCLE_FILTERS}
          keyExtractor={(item) => item}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContainer}
          renderItem={({ item }) => (
            <HapticPressable
              onPress={() =>
                setSelectedMuscle(selectedMuscle === item ? null : item)
              }
            >
              <View
                style={[
                  styles.filterChip,
                  selectedMuscle === item && styles.filterChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    selectedMuscle === item && styles.filterTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {MUSCLE_GROUP_LABELS[item]}
                </Text>
              </View>
            </HapticPressable>
          )}
        />
      </View>

      {/* Results count */}
      <View style={styles.resultsBar}>
        <Text style={styles.resultsText}>
          {filtered.length} exercise{filtered.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Exercise List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons
              name="search-outline"
              size={48}
              color={colors.textMuted}
            />
            <Text style={styles.emptyText}>No exercises found</Text>
            <Text style={styles.emptySubtext}>
              Try a different search or filter
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: spacing.md,
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    paddingVertical: spacing.sm + 2,
  },
  filterWrapper: {
    minHeight: 56,
    maxHeight: 56,
  },
  filterContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChipActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  filterText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    includeFontPadding: false,
    lineHeight: fontSize.sm + 4,
  },
  filterTextActive: {
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  resultsBar: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  resultsText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  exerciseInfo: { flex: 1 },
  exerciseName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  exerciseMeta: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  doneText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  addIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addedIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    marginTop: spacing.md,
  },
  emptySubtext: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
});
