import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  FlatList,
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { generateId as uuid } from '@/utils/id';
import { colors, spacing, fontSize, fontWeight, radius } from '@/ui/theme';
import { Card } from '@/ui/components/Card';
import { Button } from '@/ui/components/Button';
import { HapticPressable } from '@/ui/components/HapticPressable';
import { db } from '@/db/client';
import { programDays, programExercises, exercises } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  MUSCLE_GROUP_LABELS,
  type MuscleGroup,
} from '@/utils/constants';

interface DayExercise {
  id: string;
  exerciseId: string;
  name: string;
  primaryMuscle: string;
  targetSets: number | null;
  targetReps: string | null;
  sortOrder: number;
}

interface ExerciseItem {
  id: string;
  name: string;
  category: string;
  primaryMuscle: string;
}

const MUSCLE_FILTERS: MuscleGroup[] = [
  'chest', 'upper_back', 'lats', 'front_delts', 'side_delts', 'rear_delts',
  'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'abs',
];

export default function EditDayScreen() {
  const { dayId, dayName } = useLocalSearchParams<{
    dayId: string;
    dayName: string;
  }>();
  const router = useRouter();
  const [dayExercises, setDayExercises] = useState<DayExercise[]>([]);
  const [showBrowser, setShowBrowser] = useState(false);
  const [allExercises, setAllExercises] = useState<ExerciseItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup | null>(null);

  const loadDayExercises = useCallback(async () => {
    if (!dayId) return;
    try {
      const result = await db
        .select({
          id: programExercises.id,
          exerciseId: programExercises.exerciseId,
          name: exercises.name,
          primaryMuscle: exercises.primaryMuscle,
          targetSets: programExercises.targetSets,
          targetReps: programExercises.targetReps,
          sortOrder: programExercises.sortOrder,
        })
        .from(programExercises)
        .innerJoin(exercises, eq(programExercises.exerciseId, exercises.id))
        .where(eq(programExercises.programDayId, dayId))
        .orderBy(programExercises.sortOrder);

      setDayExercises(result);
    } catch {}
  }, [dayId]);

  const loadAllExercises = useCallback(async () => {
    try {
      const result = await db
        .select({
          id: exercises.id,
          name: exercises.name,
          category: exercises.category,
          primaryMuscle: exercises.primaryMuscle,
        })
        .from(exercises)
        .where(eq(exercises.isArchived, 0))
        .orderBy(exercises.name);
      setAllExercises(result);
    } catch {}
  }, []);

  useEffect(() => {
    loadDayExercises();
    loadAllExercises();
  }, [loadDayExercises, loadAllExercises]);

  const filteredExercises = useMemo(() => {
    let list = allExercises;
    // Exclude already added exercises
    const addedIds = new Set(dayExercises.map((e) => e.exerciseId));
    list = list.filter((e) => !addedIds.has(e.id));

    if (selectedMuscle) {
      list = list.filter((e) => e.primaryMuscle === selectedMuscle);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.primaryMuscle.toLowerCase().includes(q)
      );
    }
    return list;
  }, [allExercises, dayExercises, search, selectedMuscle]);

  const handleAddExercise = async (exercise: ExerciseItem) => {
    if (!dayId) return;
    const peId = uuid();
    const sortOrder = dayExercises.length;

    await db.insert(programExercises).values({
      id: peId,
      programDayId: dayId,
      exerciseId: exercise.id,
      sortOrder,
      targetSets: 3,
      targetReps: '8-12',
    });

    setDayExercises((prev) => [
      ...prev,
      {
        id: peId,
        exerciseId: exercise.id,
        name: exercise.name,
        primaryMuscle: exercise.primaryMuscle,
        targetSets: 3,
        targetReps: '8-12',
        sortOrder,
      },
    ]);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleRemoveExercise = async (peId: string) => {
    await db.delete(programExercises).where(eq(programExercises.id, peId));
    setDayExercises((prev) => prev.filter((e) => e.id !== peId));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleUpdateSets = async (peId: string, val: string) => {
    const num = parseInt(val) || null;
    await db
      .update(programExercises)
      .set({ targetSets: num })
      .where(eq(programExercises.id, peId));
    setDayExercises((prev) =>
      prev.map((e) => (e.id === peId ? { ...e, targetSets: num } : e))
    );
  };

  const handleUpdateReps = async (peId: string, val: string) => {
    const reps = val.trim() || null;
    await db
      .update(programExercises)
      .set({ targetReps: reps })
      .where(eq(programExercises.id, peId));
    setDayExercises((prev) =>
      prev.map((e) => (e.id === peId ? { ...e, targetReps: reps } : e))
    );
  };

  if (showBrowser) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <HapticPressable onPress={() => { setShowBrowser(false); setSearch(''); setSelectedMuscle(null); }}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </HapticPressable>
          <Text style={styles.headerTitle}>Add Exercise</Text>
          <View style={{ width: 24 }} />
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
            autoFocus
          />
          {search.length > 0 && (
            <HapticPressable onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </HapticPressable>
          )}
        </View>

        {/* Muscle Filters */}
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
                >
                  {MUSCLE_GROUP_LABELS[item]}
                </Text>
              </View>
            </HapticPressable>
          )}
        />

        <FlatList
          data={filteredExercises}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <HapticPressable onPress={() => handleAddExercise(item)}>
              <View style={styles.exerciseRow}>
                <View style={styles.exerciseInfo}>
                  <Text style={styles.exerciseName}>{item.name}</Text>
                  <Text style={styles.exerciseMeta}>
                    {MUSCLE_GROUP_LABELS[item.primaryMuscle as MuscleGroup] ||
                      item.primaryMuscle}
                  </Text>
                </View>
                <View style={styles.addIcon}>
                  <Ionicons name="add" size={20} color={colors.text} />
                </View>
              </View>
            </HapticPressable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No exercises found</Text>
            </View>
          }
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <HapticPressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </HapticPressable>
        <Text style={styles.headerTitle}>{dayName || 'Edit Day'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={dayExercises}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <Text style={styles.sectionLabel}>
            {dayExercises.length} exercise{dayExercises.length !== 1 ? 's' : ''}
          </Text>
        }
        renderItem={({ item, index }) => (
          <Card style={styles.exerciseCard} padding="md">
            <View style={styles.exerciseCardHeader}>
              <View style={styles.orderBadge}>
                <Text style={styles.orderText}>{index + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.exerciseCardName}>{item.name}</Text>
                <Text style={styles.exerciseCardMuscle}>
                  {MUSCLE_GROUP_LABELS[item.primaryMuscle as MuscleGroup] ||
                    item.primaryMuscle}
                </Text>
              </View>
              <HapticPressable onPress={() => handleRemoveExercise(item.id)}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </HapticPressable>
            </View>

            {/* Sets x Reps inputs */}
            <View style={styles.prescriptionRow}>
              <View style={styles.prescriptionItem}>
                <Text style={styles.prescriptionLabel}>Sets</Text>
                <TextInput
                  style={styles.prescriptionInput}
                  value={item.targetSets?.toString() || ''}
                  onChangeText={(val) => handleUpdateSets(item.id, val)}
                  keyboardType="number-pad"
                  placeholder="3"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <Text style={styles.prescriptionX}>x</Text>
              <View style={styles.prescriptionItem}>
                <Text style={styles.prescriptionLabel}>Reps</Text>
                <TextInput
                  style={styles.prescriptionInput}
                  value={item.targetReps || ''}
                  onChangeText={(val) => handleUpdateReps(item.id, val)}
                  placeholder="8-12"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>
          </Card>
        )}
        ListFooterComponent={
          <HapticPressable onPress={() => setShowBrowser(true)}>
            <View style={styles.addExerciseButton}>
              <Ionicons
                name="add-circle-outline"
                size={22}
                color={colors.primary}
              />
              <Text style={styles.addExerciseText}>Add Exercise</Text>
            </View>
          </HapticPressable>
        }
        ListEmptyComponent={
          <View style={styles.emptyDay}>
            <Ionicons
              name="barbell-outline"
              size={48}
              color={colors.textMuted}
            />
            <Text style={styles.emptyDayTitle}>No exercises yet</Text>
            <Text style={styles.emptyDaySubtitle}>
              Add exercises to define this workout day
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
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },

  // Exercise card in day editor
  exerciseCard: { marginBottom: spacing.sm },
  exerciseCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  orderBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  exerciseCardName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  exerciseCardMuscle: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    marginTop: 1,
  },

  // Prescription row
  prescriptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  prescriptionItem: { flex: 1 },
  prescriptionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginBottom: 2,
  },
  prescriptionInput: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    color: colors.text,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  prescriptionX: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    marginTop: spacing.md,
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

  // Empty day
  emptyDay: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyDayTitle: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    marginTop: spacing.md,
  },
  emptyDaySubtitle: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },

  // Exercise browser styles
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
  filterContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.xs,
  },
  filterChipActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  filterText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  filterTextActive: {
    color: colors.primary,
    fontWeight: fontWeight.semibold,
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
  addIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
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
  },
});
