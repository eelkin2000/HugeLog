import { useEffect, useState, useMemo } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontWeight, radius } from '@/ui/theme';
import { Card } from '@/ui/components/Card';
import { Badge } from '@/ui/components/Badge';
import { HapticPressable } from '@/ui/components/HapticPressable';
import { MuscleMapSvg } from '@/ui/components/MuscleMapSvg';
import { db } from '@/db/client';
import {
  exercises,
  sets,
  workoutExercises,
  workouts,
  personalRecords,
} from '@/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import {
  MUSCLE_GROUP_LABELS,
  CATEGORY_LABELS,
  type MuscleGroup,
  type ExerciseCategory,
} from '@/utils/constants';
import { useAppStore } from '@/stores/appStore';
import { formatWeight, formatDate, ordinalSuffix } from '@/utils/formatting';
import { estimateOneRM } from '@/utils/calculations';
import {
  ProgressionChartGroup,
  type ProgressionDataPoint,
} from '@/ui/components/ProgressionChart';

interface ExerciseDetail {
  id: string;
  name: string;
  category: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: string | null;
  instructions: string | null;
}

interface HistoryEntry {
  date: string;
  workoutId: string;
  sets: Array<{ weight: number; reps: number }>;
  muscleOrder: number; // 1 = first of its muscle group, 2 = second, etc.
}

const PR_TYPE_LABELS: Record<string, string> = {
  weight: 'Best Weight',
  reps: 'Most Reps',
  volume: 'Best Volume',
  estimated_1rm: 'Estimated 1RM',
};

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const unit = useAppStore((s) => s.unit);
  const chartSettings = useAppStore((s) => s.chartSettings);
  const [exercise, setExercise] = useState<ExerciseDetail | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [prs, setPRs] = useState<Array<{ type: string; value: number }>>([]);
  const [muscleOrderFilter, setMuscleOrderFilter] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState<'muscles' | 'instructions'>('muscles');

  useEffect(() => {
    loadExercise();
    loadHistory();
    loadPRs();
  }, [id]);

  const loadExercise = async () => {
    if (!id) return;
    try {
      const result = await db
        .select()
        .from(exercises)
        .where(eq(exercises.id, id))
        .limit(1);

      if (result[0]) {
        const e = result[0];
        const detail: ExerciseDetail = {
          ...e,
          secondaryMuscles: e.secondaryMuscles
            ? JSON.parse(e.secondaryMuscles)
            : [],
        };
        setExercise(detail);
      }
    } catch {}
  };

  const loadHistory = async () => {
    if (!id) return;
    try {
      const result = await db
        .select({
          date: workouts.startedAt,
          workoutId: workouts.id,
          weight: sets.weight,
          reps: sets.reps,
        })
        .from(sets)
        .innerJoin(
          workoutExercises,
          eq(sets.workoutExerciseId, workoutExercises.id)
        )
        .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
        .where(
          and(
            eq(workoutExercises.exerciseId, id),
            eq(sets.isCompleted, 1),
            sql`${workouts.completedAt} IS NOT NULL`
          )
        )
        .orderBy(desc(workouts.startedAt));

      // Get exercise's primary muscle for order computation
      const exInfo = await db
        .select({ primaryMuscle: exercises.primaryMuscle })
        .from(exercises)
        .where(eq(exercises.id, id))
        .limit(1);
      const targetMuscle = exInfo[0]?.primaryMuscle;

      // Compute muscle-group-relative order per workout
      // Get the sort_order and workout_id for this exercise
      const orderData = await db
        .select({
          workoutId: workoutExercises.workoutId,
          sortOrder: workoutExercises.sortOrder,
        })
        .from(workoutExercises)
        .where(eq(workoutExercises.exerciseId, id));

      const muscleOrderByWorkout = new Map<string, number>();

      if (targetMuscle) {
        for (const row of orderData) {
          // Count same-muscle exercises with lower sort_order in this workout
          const priorResult = await db
            .select({ count: sql<number>`COUNT(*)` })
            .from(workoutExercises)
            .innerJoin(
              exercises,
              eq(workoutExercises.exerciseId, exercises.id)
            )
            .where(
              and(
                eq(workoutExercises.workoutId, row.workoutId),
                eq(exercises.primaryMuscle, targetMuscle),
                sql`${workoutExercises.sortOrder} < ${row.sortOrder}`
              )
            );
          muscleOrderByWorkout.set(
            row.workoutId,
            (priorResult[0]?.count ?? 0) + 1
          );
        }
      }

      // Group by workout date
      const grouped = new Map<
        string,
        {
          workoutId: string;
          sets: Array<{ weight: number; reps: number }>;
          muscleOrder: number;
        }
      >();
      for (const r of result) {
        const dateKey = r.date.split('T')[0];
        if (!grouped.has(dateKey)) {
          grouped.set(dateKey, {
            workoutId: r.workoutId,
            sets: [],
            muscleOrder: muscleOrderByWorkout.get(r.workoutId) ?? 1,
          });
        }
        if (r.weight != null && r.reps != null) {
          grouped.get(dateKey)!.sets.push({ weight: r.weight, reps: r.reps });
        }
      }

      setHistory(
        Array.from(grouped.entries()).map(([date, data]) => ({
          date,
          workoutId: data.workoutId,
          sets: data.sets,
          muscleOrder: data.muscleOrder,
        }))
      );
    } catch {}
  };

  const loadPRs = async () => {
    if (!id) return;
    try {
      const result = await db
        .select({
          type: personalRecords.type,
          value: personalRecords.value,
        })
        .from(personalRecords)
        .where(eq(personalRecords.exerciseId, id))
        .orderBy(desc(personalRecords.achievedAt));

      const latest = new Map<string, number>();
      for (const r of result) {
        if (!latest.has(r.type)) latest.set(r.type, r.value);
      }
      setPRs(
        Array.from(latest.entries()).map(([type, value]) => ({ type, value }))
      );
    } catch {}
  };

  // ─── Derived data ───

  // Available muscle orders for filter chips
  const availableOrders = useMemo(() => {
    const orders = [...new Set(history.map((h) => h.muscleOrder))].sort();
    return orders;
  }, [history]);

  // Filtered history
  const filteredHistory = useMemo(() => {
    if (muscleOrderFilter === null) return history;
    return history.filter((h) => h.muscleOrder === muscleOrderFilter);
  }, [history, muscleOrderFilter]);

  // Best E1RM from filtered history
  const bestE1RM = useMemo(() => {
    let best = 0;
    for (const h of filteredHistory) {
      for (const s of h.sets) {
        const e1rm = estimateOneRM(s.weight, s.reps);
        if (e1rm > best) best = e1rm;
      }
    }
    return best;
  }, [filteredHistory]);

  // Chart data (filtered, ascending order)
  const chartHistory = useMemo(
    () => [...filteredHistory].reverse(),
    [filteredHistory]
  );

  const formatLabel = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const weightData: ProgressionDataPoint[] = chartHistory.map((h) => ({
    date: h.date,
    label: formatLabel(h.date),
    value: Math.max(...h.sets.map((s) => s.weight)),
    workoutId: h.workoutId,
  }));

  const e1rmData: ProgressionDataPoint[] = chartHistory.map((h) => ({
    date: h.date,
    label: formatLabel(h.date),
    value: Math.max(
      ...h.sets.map((s) => estimateOneRM(s.weight, s.reps))
    ),
    workoutId: h.workoutId,
  }));

  const volumeData: ProgressionDataPoint[] = chartHistory.map((h) => ({
    date: h.date,
    label: formatLabel(h.date),
    value: h.sets.reduce((sum, s) => sum + s.weight * s.reps, 0),
    workoutId: h.workoutId,
  }));

  if (!exercise) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const showOrderFilter = availableOrders.length > 1;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <HapticPressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </HapticPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {exercise.name}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Badges */}
        <View style={styles.badges}>
          <Badge
            label={
              MUSCLE_GROUP_LABELS[exercise.primaryMuscle as MuscleGroup] ||
              exercise.primaryMuscle
            }
            variant="primary"
          />
          <Badge
            label={
              CATEGORY_LABELS[exercise.category as ExerciseCategory] ||
              exercise.category
            }
            variant="muted"
          />
          {exercise.secondaryMuscles.map((m: string) => (
            <Badge
              key={m}
              label={MUSCLE_GROUP_LABELS[m as MuscleGroup] || m}
              variant="muted"
            />
          ))}
        </View>

        {/* Muscles / Instructions Tabs */}
        <Card style={styles.muscleMapCard} padding="md">
          <View style={styles.tabRow}>
            <HapticPressable
              onPress={() => setDetailTab('muscles')}
              style={[styles.tab, detailTab === 'muscles' && styles.tabActive]}
            >
              <Text style={[styles.tabText, detailTab === 'muscles' && styles.tabTextActive]}>
                Muscles Worked
              </Text>
            </HapticPressable>
            <HapticPressable
              onPress={() => setDetailTab('instructions')}
              style={[styles.tab, detailTab === 'instructions' && styles.tabActive]}
            >
              <Text style={[styles.tabText, detailTab === 'instructions' && styles.tabTextActive]}>
                Instructions
              </Text>
            </HapticPressable>
          </View>

          {detailTab === 'muscles' ? (
            <View style={{ alignItems: 'center', marginTop: spacing.sm }}>
              <MuscleMapSvg
                primaryMuscles={[exercise.primaryMuscle]}
                secondaryMuscles={exercise.secondaryMuscles}
                width={280}
                height={200}
              />
            </View>
          ) : (
            <View style={{ marginTop: spacing.sm }}>
              {exercise.instructions ? (
                <Text style={styles.instructions}>{exercise.instructions}</Text>
              ) : (
                <Text style={styles.noInstructions}>No instructions available for this exercise.</Text>
              )}
            </View>
          )}
        </Card>

        {/* PRs (always unfiltered) */}
        {(prs.length > 0 || bestE1RM > 0) && (
          <Card style={styles.section} padding="md">
            <Text style={styles.sectionTitle}>Personal Records</Text>
            {prs.map((pr) => (
              <View key={pr.type} style={styles.prRow}>
                <Text style={styles.prLabel}>
                  {PR_TYPE_LABELS[pr.type] ?? pr.type}
                </Text>
                <Text style={styles.prValue}>
                  {pr.type === 'reps'
                    ? `${pr.value} reps`
                    : formatWeight(pr.value, unit)}
                </Text>
              </View>
            ))}
            {bestE1RM > 0 &&
              !prs.some((p) => p.type === 'estimated_1rm') && (
                <View style={styles.prRow}>
                  <Text style={styles.prLabel}>Estimated 1RM</Text>
                  <Text style={styles.prValue}>
                    {formatWeight(bestE1RM, unit)}
                  </Text>
                </View>
              )}
          </Card>
        )}

        {/* Exercise Order Filter */}
        {showOrderFilter && (
          <View style={styles.filterSection}>
            <View style={styles.filterHeader}>
              <Ionicons
                name="funnel-outline"
                size={16}
                color={colors.textSecondary}
              />
              <Text style={styles.filterLabel}>Exercise Order</Text>
            </View>
            <Text style={styles.filterHint}>
              Filter by when this exercise appeared among{' '}
              {MUSCLE_GROUP_LABELS[exercise.primaryMuscle as MuscleGroup] ||
                exercise.primaryMuscle}{' '}
              exercises in your workout
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChips}
            >
              <HapticPressable
                onPress={() => setMuscleOrderFilter(null)}
              >
                <View
                  style={[
                    styles.filterChip,
                    muscleOrderFilter === null && styles.filterChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      muscleOrderFilter === null &&
                        styles.filterChipTextActive,
                    ]}
                  >
                    All
                  </Text>
                </View>
              </HapticPressable>
              {availableOrders.map((n) => (
                <HapticPressable
                  key={n}
                  onPress={() => setMuscleOrderFilter(n)}
                >
                  <View
                    style={[
                      styles.filterChip,
                      muscleOrderFilter === n && styles.filterChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        muscleOrderFilter === n &&
                          styles.filterChipTextActive,
                      ]}
                    >
                      {ordinalSuffix(n)}
                    </Text>
                  </View>
                </HapticPressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Progression Charts */}
        {filteredHistory.length >= 2 && (
          <View style={{ marginTop: spacing.lg }}>
            <Text style={styles.sectionTitle}>Progression</Text>
            <ProgressionChartGroup
              weightData={weightData}
              e1rmData={e1rmData}
              volumeData={volumeData}
              unit={unit}
              axisConfig={chartSettings}
              onDataPointPress={(workoutId) =>
                router.push(`/workout/${workoutId}`)
              }
            />
          </View>
        )}

        {/* History */}
        <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>
          History ({filteredHistory.length} session
          {filteredHistory.length !== 1 ? 's' : ''})
          {muscleOrderFilter !== null && (
            <Text style={styles.filterIndicator}>
              {' '}
              · {ordinalSuffix(muscleOrderFilter)} exercise
            </Text>
          )}
        </Text>
        {filteredHistory.length === 0 ? (
          <Text style={styles.noHistory}>
            {muscleOrderFilter !== null
              ? 'No sessions match this filter'
              : 'No history yet for this exercise'}
          </Text>
        ) : (
          filteredHistory.slice(0, 20).map((h) => (
            <HapticPressable
              key={h.date}
              onPress={() => router.push(`/workout/${h.workoutId}`)}
            >
              <Card style={styles.historyCard} padding="sm">
                <View style={styles.historyHeader}>
                  <Text style={styles.historyDate}>
                    {formatDate(h.date)}
                  </Text>
                  {showOrderFilter && (
                    <Badge
                      label={`${ordinalSuffix(h.muscleOrder)} exercise`}
                      variant={h.muscleOrder === 1 ? 'success' : 'muted'}
                    />
                  )}
                </View>
                <View style={styles.historySets}>
                  {h.sets.map((s, i) => (
                    <Text key={i} style={styles.historySet}>
                      {s.weight} {unit} x {s.reps}
                    </Text>
                  ))}
                </View>
              </Card>
            </HapticPressable>
          ))
        )}
      </ScrollView>
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
  },
  headerTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    flex: 1,
  },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },

  // Muscle map / Instructions tabs
  muscleMapCard: {
    marginBottom: spacing.md,
  },
  tabRow: {
    flexDirection: 'row',
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceLight,
    padding: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.sm - 2,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  tabTextActive: {
    color: colors.text,
    fontWeight: fontWeight.semibold,
  },
  noInstructions: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: spacing.md,
  },

  section: { marginBottom: spacing.md },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  instructions: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: 22,
  },
  prRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  prLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    textTransform: 'capitalize',
  },
  prValue: {
    color: colors.success,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    fontVariant: ['tabular-nums'],
  },

  // Exercise order filter
  filterSection: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  filterLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  filterHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginBottom: spacing.sm,
    lineHeight: 16,
  },
  filterChips: {
    gap: spacing.xs,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  filterChipText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  filterChipTextActive: {
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  filterIndicator: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },

  // History
  noHistory: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  historyCard: { marginBottom: spacing.xs },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  historyDate: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  historySets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  historySet: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontVariant: ['tabular-nums'],
  },
});
