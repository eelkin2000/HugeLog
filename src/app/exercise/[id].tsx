import { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontWeight, radius } from '@/ui/theme';
import { Card } from '@/ui/components/Card';
import { Badge } from '@/ui/components/Badge';
import { HapticPressable } from '@/ui/components/HapticPressable';
import { db } from '@/db/client';
import { exercises, sets, workoutExercises, workouts, personalRecords } from '@/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { MUSCLE_GROUP_LABELS, CATEGORY_LABELS, type MuscleGroup, type ExerciseCategory } from '@/utils/constants';
import { useAppStore } from '@/stores/appStore';
import { formatWeight, formatDate } from '@/utils/formatting';
import { estimateOneRM } from '@/utils/calculations';
import { ProgressionChartGroup, type ProgressionDataPoint } from '@/ui/components/ProgressionChart';

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
  sets: Array<{ weight: number; reps: number }>;
}

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const unit = useAppStore((s) => s.unit);
  const chartSettings = useAppStore((s) => s.chartSettings);
  const [exercise, setExercise] = useState<ExerciseDetail | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [prs, setPRs] = useState<Array<{ type: string; value: number }>>([]);

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
        setExercise({
          ...e,
          secondaryMuscles: e.secondaryMuscles
            ? JSON.parse(e.secondaryMuscles)
            : [],
        });
      }
    } catch {}
  };

  const loadHistory = async () => {
    if (!id) return;
    try {
      const result = await db
        .select({
          date: workouts.startedAt,
          weight: sets.weight,
          reps: sets.reps,
        })
        .from(sets)
        .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
        .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
        .where(
          and(
            eq(workoutExercises.exerciseId, id),
            eq(sets.isCompleted, 1),
            sql`${workouts.completedAt} IS NOT NULL`
          )
        )
        .orderBy(desc(workouts.startedAt))
        .limit(100);

      // Group by workout date
      const grouped = new Map<string, Array<{ weight: number; reps: number }>>();
      for (const r of result) {
        const dateKey = r.date.split('T')[0];
        if (!grouped.has(dateKey)) grouped.set(dateKey, []);
        if (r.weight != null && r.reps != null) {
          grouped.get(dateKey)!.push({ weight: r.weight, reps: r.reps });
        }
      }

      setHistory(
        Array.from(grouped.entries()).map(([date, s]) => ({ date, sets: s }))
      );
    } catch {}
  };

  const loadPRs = async () => {
    if (!id) return;
    try {
      const result = await db
        .select({ type: personalRecords.type, value: personalRecords.value })
        .from(personalRecords)
        .where(eq(personalRecords.exerciseId, id))
        .orderBy(desc(personalRecords.achievedAt));

      // Get latest of each type
      const latest = new Map<string, number>();
      for (const r of result) {
        if (!latest.has(r.type)) latest.set(r.type, r.value);
      }
      setPRs(Array.from(latest.entries()).map(([type, value]) => ({ type, value })));
    } catch {}
  };

  if (!exercise) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Calculate best estimated 1RM from history
  let bestE1RM = 0;
  for (const h of history) {
    for (const s of h.sets) {
      const e1rm = estimateOneRM(s.weight, s.reps);
      if (e1rm > bestE1RM) bestE1RM = e1rm;
    }
  }

  // Build chart data (history is sorted desc, charts need asc)
  const chartHistory = [...history].reverse();

  const formatLabel = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const weightData: ProgressionDataPoint[] = chartHistory.map((h) => ({
    date: h.date,
    label: formatLabel(h.date),
    value: Math.max(...h.sets.map((s) => s.weight)),
  }));

  const e1rmData: ProgressionDataPoint[] = chartHistory.map((h) => ({
    date: h.date,
    label: formatLabel(h.date),
    value: Math.max(...h.sets.map((s) => estimateOneRM(s.weight, s.reps))),
  }));

  const volumeData: ProgressionDataPoint[] = chartHistory.map((h) => ({
    date: h.date,
    label: formatLabel(h.date),
    value: h.sets.reduce((sum, s) => sum + s.weight * s.reps, 0),
  }));

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <HapticPressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </HapticPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{exercise.name}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Info */}
        <View style={styles.badges}>
          <Badge
            label={MUSCLE_GROUP_LABELS[exercise.primaryMuscle as MuscleGroup] || exercise.primaryMuscle}
            variant="primary"
          />
          <Badge
            label={CATEGORY_LABELS[exercise.category as ExerciseCategory] || exercise.category}
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

        {/* Instructions */}
        {exercise.instructions && (
          <Card style={styles.section} padding="md">
            <Text style={styles.sectionTitle}>Instructions</Text>
            <Text style={styles.instructions}>{exercise.instructions}</Text>
          </Card>
        )}

        {/* PRs */}
        {(prs.length > 0 || bestE1RM > 0) && (
          <Card style={styles.section} padding="md">
            <Text style={styles.sectionTitle}>Personal Records</Text>
            {bestE1RM > 0 && (
              <View style={styles.prRow}>
                <Text style={styles.prLabel}>Est. 1RM</Text>
                <Text style={styles.prValue}>{formatWeight(bestE1RM, unit)}</Text>
              </View>
            )}
            {prs.map((pr) => (
              <View key={pr.type} style={styles.prRow}>
                <Text style={styles.prLabel}>{pr.type}</Text>
                <Text style={styles.prValue}>
                  {pr.type === 'reps' ? `${pr.value} reps` : formatWeight(pr.value, unit)}
                </Text>
              </View>
            ))}
          </Card>
        )}

        {/* Progression Charts */}
        {history.length >= 2 && (
          <View style={{ marginTop: spacing.lg }}>
            <Text style={styles.sectionTitle}>Progression</Text>
            <ProgressionChartGroup
              weightData={weightData}
              e1rmData={e1rmData}
              volumeData={volumeData}
              unit={unit}
              axisConfig={chartSettings}
            />
          </View>
        )}

        {/* History */}
        <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>
          History ({history.length} sessions)
        </Text>
        {history.length === 0 ? (
          <Text style={styles.noHistory}>No history yet for this exercise</Text>
        ) : (
          history.slice(0, 10).map((h) => (
            <Card key={h.date} style={styles.historyCard} padding="sm">
              <Text style={styles.historyDate}>{formatDate(h.date)}</Text>
              <View style={styles.historySets}>
                {h.sets.map((s, i) => (
                  <Text key={i} style={styles.historySet}>
                    {s.weight} {unit} x {s.reps}
                  </Text>
                ))}
              </View>
            </Card>
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
    marginBottom: spacing.lg,
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
  noHistory: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  historyCard: { marginBottom: spacing.xs },
  historyDate: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.xs,
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
