import { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontWeight, radius } from '@/ui/theme';
import { Card } from '@/ui/components/Card';
import { Badge } from '@/ui/components/Badge';
import { HapticPressable } from '@/ui/components/HapticPressable';
import { ProgressionChartGroup, type ProgressionDataPoint } from '@/ui/components/ProgressionChart';
import { db } from '@/db/client';
import { workouts, sets, workoutExercises, exercises, personalRecords } from '@/db/schema';
import { desc, sql, eq, gte, and } from 'drizzle-orm';
import { useAppStore } from '@/stores/appStore';
import { formatVolume, formatNumber, formatDate } from '@/utils/formatting';
import { estimateOneRM } from '@/utils/calculations';
import { MUSCLE_GROUP_LABELS, type MuscleGroup } from '@/utils/constants';

interface MuscleVolumeData {
  muscle: string;
  volume: number;
}

interface PRRecord {
  exerciseName: string;
  type: string;
  value: number;
  achievedAt: string;
}

interface ExerciseOption {
  id: string;
  name: string;
  sessionCount: number;
}

export default function AnalyticsScreen() {
  const router = useRouter();
  const unit = useAppStore((s) => s.unit);
  const chartSettings = useAppStore((s) => s.chartSettings);
  const [totalWorkouts, setTotalWorkouts] = useState(0);
  const [totalVolume, setTotalVolume] = useState(0);
  const [muscleVolumes, setMuscleVolumes] = useState<MuscleVolumeData[]>([]);
  const [recentPRs, setRecentPRs] = useState<PRRecord[]>([]);
  const [weeklyVolumes, setWeeklyVolumes] = useState<Array<{ week: string; volume: number }>>([]);
  const [exerciseOptions, setExerciseOptions] = useState<ExerciseOption[]>([]);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [weightData, setWeightData] = useState<ProgressionDataPoint[]>([]);
  const [e1rmData, setE1rmData] = useState<ProgressionDataPoint[]>([]);
  const [volumeData, setVolumeData] = useState<ProgressionDataPoint[]>([]);

  useEffect(() => {
    loadAnalytics();
    loadExerciseOptions();
  }, []);

  useEffect(() => {
    if (selectedExerciseId) loadExerciseProgression(selectedExerciseId);
  }, [selectedExerciseId]);

  const loadAnalytics = async () => {
    try {
      // Total workouts & volume
      const totals = await db
        .select({
          count: sql<number>`count(*)`,
          vol: sql<number>`coalesce(sum(${workouts.totalVolume}), 0)`,
        })
        .from(workouts)
        .where(sql`${workouts.completedAt} IS NOT NULL`);

      setTotalWorkouts(totals[0]?.count || 0);
      setTotalVolume(totals[0]?.vol || 0);

      // Muscle group volumes (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const muscleData = await db
        .select({
          muscle: exercises.primaryMuscle,
          vol: sql<number>`coalesce(sum(${sets.weight} * ${sets.reps}), 0)`,
        })
        .from(sets)
        .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
        .innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
        .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
        .where(
          and(
            eq(sets.isCompleted, 1),
            gte(workouts.startedAt, thirtyDaysAgo.toISOString()),
            sql`${workouts.completedAt} IS NOT NULL`
          )
        )
        .groupBy(exercises.primaryMuscle)
        .orderBy(sql`vol DESC`);

      setMuscleVolumes(
        muscleData.map((d) => ({ muscle: d.muscle, volume: d.vol }))
      );

      // Recent PRs
      const prs = await db
        .select({
          exerciseName: exercises.name,
          type: personalRecords.type,
          value: personalRecords.value,
          achievedAt: personalRecords.achievedAt,
        })
        .from(personalRecords)
        .innerJoin(exercises, eq(personalRecords.exerciseId, exercises.id))
        .orderBy(desc(personalRecords.achievedAt))
        .limit(10);

      setRecentPRs(prs);
    } catch {}
  };

  const loadExerciseOptions = async () => {
    try {
      const result = await db
        .select({
          id: exercises.id,
          name: exercises.name,
          count: sql<number>`count(DISTINCT ${workouts.id})`,
        })
        .from(workoutExercises)
        .innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
        .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
        .where(sql`${workouts.completedAt} IS NOT NULL`)
        .groupBy(exercises.id, exercises.name)
        .having(sql`count(DISTINCT ${workouts.id}) >= 2`)
        .orderBy(sql`count(DISTINCT ${workouts.id}) DESC`);

      const options = result.map((r) => ({ id: r.id, name: r.name, sessionCount: r.count }));
      setExerciseOptions(options);
      if (options.length > 0 && !selectedExerciseId) {
        setSelectedExerciseId(options[0].id);
      }
    } catch {}
  };

  const loadExerciseProgression = async (exerciseId: string) => {
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
            eq(workoutExercises.exerciseId, exerciseId),
            eq(sets.isCompleted, 1),
            sql`${workouts.completedAt} IS NOT NULL`
          )
        )
        .orderBy(workouts.startedAt);

      // Group by workout date
      const grouped = new Map<string, Array<{ weight: number; reps: number }>>();
      for (const r of result) {
        if (r.weight == null || r.reps == null) continue;
        const dateKey = r.date.split('T')[0];
        if (!grouped.has(dateKey)) grouped.set(dateKey, []);
        grouped.get(dateKey)!.push({ weight: r.weight, reps: r.reps });
      }

      const formatLabel = (dateStr: string) => {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      };

      const dates = Array.from(grouped.keys()).sort();

      setWeightData(dates.map((date) => ({
        date,
        label: formatLabel(date),
        value: Math.max(...grouped.get(date)!.map((s) => s.weight)),
      })));

      setE1rmData(dates.map((date) => ({
        date,
        label: formatLabel(date),
        value: Math.max(...grouped.get(date)!.map((s) => estimateOneRM(s.weight, s.reps))),
      })));

      setVolumeData(dates.map((date) => ({
        date,
        label: formatLabel(date),
        value: grouped.get(date)!.reduce((sum, s) => sum + s.weight * s.reps, 0),
      })));
    } catch {}
  };

  const selectedExercise = exerciseOptions.find((e) => e.id === selectedExerciseId);

  const maxMuscleVolume = Math.max(...muscleVolumes.map((m) => m.volume), 1);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <HapticPressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </HapticPressable>
        <Text style={styles.headerTitle}>Analytics</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Summary Cards */}
        <View style={styles.summaryRow}>
          <Card style={styles.summaryCard} padding="md">
            <Text style={styles.summaryValue}>{formatNumber(totalWorkouts)}</Text>
            <Text style={styles.summaryLabel}>Total Workouts</Text>
          </Card>
          <Card style={styles.summaryCard} padding="md">
            <Text style={styles.summaryValue}>
              {totalVolume > 0 ? formatVolume(totalVolume, unit) : '0'}
            </Text>
            <Text style={styles.summaryLabel}>Total Volume</Text>
          </Card>
        </View>

        {/* Muscle Volume Distribution */}
        <Text style={styles.sectionTitle}>
          Muscle Volume (Last 30 Days)
        </Text>
        <Card padding="md">
          {muscleVolumes.length === 0 ? (
            <Text style={styles.emptyText}>No data yet</Text>
          ) : (
            muscleVolumes.map((m) => (
              <View key={m.muscle} style={styles.barRow}>
                <Text style={styles.barLabel}>
                  {MUSCLE_GROUP_LABELS[m.muscle as MuscleGroup] || m.muscle}
                </Text>
                <View style={styles.barContainer}>
                  <View
                    style={[
                      styles.bar,
                      { width: `${(m.volume / maxMuscleVolume) * 100}%` },
                    ]}
                  />
                </View>
                <Text style={styles.barValue}>
                  {formatNumber(Math.round(m.volume))}
                </Text>
              </View>
            ))
          )}
        </Card>

        {/* Exercise Progression */}
        <Text style={styles.sectionTitle}>Exercise Progression</Text>
        {exerciseOptions.length === 0 ? (
          <Card padding="md">
            <Text style={styles.emptyText}>
              Complete at least 2 sessions of an exercise to see progression
            </Text>
          </Card>
        ) : (
          <>
            {/* Exercise picker */}
            <HapticPressable
              onPress={() => setShowExercisePicker(!showExercisePicker)}
              style={styles.exercisePicker}
            >
              <Text style={styles.exercisePickerText} numberOfLines={1}>
                {selectedExercise?.name || 'Select exercise'}
              </Text>
              <Ionicons
                name={showExercisePicker ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.textSecondary}
              />
            </HapticPressable>

            {showExercisePicker && (
              <Card style={styles.exerciseList} padding="sm">
                <ScrollView
                  style={{ maxHeight: 200 }}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                >
                  {exerciseOptions.map((ex) => (
                    <HapticPressable
                      key={ex.id}
                      onPress={() => {
                        setSelectedExerciseId(ex.id);
                        setShowExercisePicker(false);
                      }}
                      style={[
                        styles.exerciseOption,
                        ex.id === selectedExerciseId && styles.exerciseOptionActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.exerciseOptionText,
                          ex.id === selectedExerciseId && styles.exerciseOptionTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {ex.name}
                      </Text>
                      <Text style={styles.exerciseSessionCount}>
                        {ex.sessionCount} sessions
                      </Text>
                    </HapticPressable>
                  ))}
                </ScrollView>
              </Card>
            )}

            <View style={{ marginTop: spacing.md }}>
              <ProgressionChartGroup
                weightData={weightData}
                e1rmData={e1rmData}
                volumeData={volumeData}
                unit={unit}
                axisConfig={chartSettings}
              />
            </View>
          </>
        )}

        {/* Personal Records */}
        <Text style={styles.sectionTitle}>Recent Personal Records</Text>
        {recentPRs.length === 0 ? (
          <Card padding="md">
            <Text style={styles.emptyText}>
              No PRs yet - keep training!
            </Text>
          </Card>
        ) : (
          recentPRs.map((pr, i) => (
            <Card key={i} style={styles.prCard} padding="sm">
              <View style={styles.prRow}>
                <View style={styles.prInfo}>
                  <Text style={styles.prExercise}>{pr.exerciseName}</Text>
                  <Text style={styles.prMeta}>
                    {pr.type} · {formatDate(pr.achievedAt)}
                  </Text>
                </View>
                <View style={styles.prValueContainer}>
                  <Badge label="PR" variant="success" />
                  <Text style={styles.prValue}>
                    {pr.type === 'reps'
                      ? `${pr.value} reps`
                      : `${pr.value} ${unit}`}
                  </Text>
                </View>
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
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  summaryCard: { flex: 1, alignItems: 'center' },
  summaryValue: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    fontVariant: ['tabular-nums'],
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  barLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    width: 80,
  },
  barContainer: {
    flex: 1,
    height: 12,
    backgroundColor: colors.surfaceLight,
    borderRadius: 6,
    marginHorizontal: spacing.sm,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 6,
  },
  barValue: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontVariant: ['tabular-nums'],
    width: 50,
    textAlign: 'right',
  },
  exercisePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.xs,
  },
  exercisePickerText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    flex: 1,
  },
  exerciseList: {
    marginBottom: spacing.xs,
  },
  exerciseOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  exerciseOptionActive: {
    backgroundColor: colors.primaryMuted,
  },
  exerciseOptionText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    flex: 1,
  },
  exerciseOptionTextActive: {
    color: colors.primary,
    fontWeight: fontWeight.medium,
  },
  exerciseSessionCount: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginLeft: spacing.sm,
  },
  prCard: { marginBottom: spacing.xs },
  prRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  prInfo: { flex: 1 },
  prExercise: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  prMeta: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textTransform: 'capitalize',
    marginTop: 2,
  },
  prValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  prValue: {
    color: colors.success,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    fontVariant: ['tabular-nums'],
  },
});
