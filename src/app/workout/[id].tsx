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
import { workouts, workoutExercises, sets, exercises } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { useAppStore } from '@/stores/appStore';
import { formatDate, formatDuration, formatWeight, formatVolume } from '@/utils/formatting';
import { estimateOneRM } from '@/utils/calculations';

interface SetDetail {
  setNumber: number;
  type: string;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  isPersonalRecord: number | null;
}

interface ExerciseGroup {
  exerciseId: string;
  exerciseName: string;
  category: string;
  primaryMuscle: string;
  notes: string | null;
  restSeconds: number | null;
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

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const unit = useAppStore((s) => s.unit);
  const [workout, setWorkout] = useState<WorkoutDetail | null>(null);
  const [exerciseGroups, setExerciseGroups] = useState<ExerciseGroup[]>([]);

  useEffect(() => {
    if (id) {
      loadWorkout();
      loadExercises();
    }
  }, [id]);

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

      // Group by workout exercise
      const groupMap = new Map<string, ExerciseGroup>();
      for (const r of result) {
        if (!groupMap.has(r.weId)) {
          groupMap.set(r.weId, {
            exerciseId: r.exerciseId,
            exerciseName: r.exerciseName,
            category: r.category,
            primaryMuscle: r.primaryMuscle,
            notes: r.weNotes,
            restSeconds: r.restSeconds,
            sets: [],
          });
        }
        groupMap.get(r.weId)!.sets.push({
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

  if (!workout) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Compute summary stats
  const totalSets = exerciseGroups.reduce(
    (sum, g) => sum + g.sets.filter((s) => s.type !== 'warmup').length,
    0
  );
  const totalPRs = exerciseGroups.reduce(
    (sum, g) => sum + g.sets.filter((s) => s.isPersonalRecord).length,
    0
  );
  const muscles = [...new Set(exerciseGroups.map((g) => g.primaryMuscle))];

  // Format the date nicely
  const startDate = new Date(workout.startedAt);
  const dayOfWeek = startDate.toLocaleDateString('en-US', { weekday: 'long' });
  const fullDate = startDate.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const startTime = startDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <HapticPressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </HapticPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {workout.name}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Date & Time */}
        <Text style={styles.dateText}>{dayOfWeek}, {fullDate}</Text>
        <Text style={styles.timeText}>{startTime}</Text>

        {/* Summary Row */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              {workout.durationSeconds ? formatDuration(workout.durationSeconds) : '--'}
            </Text>
            <Text style={styles.summaryLabel}>Duration</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              {workout.totalVolume ? formatVolume(workout.totalVolume, unit) : '--'}
            </Text>
            <Text style={styles.summaryLabel}>Volume</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{totalSets}</Text>
            <Text style={styles.summaryLabel}>Working Sets</Text>
          </View>
          {totalPRs > 0 && (
            <>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: colors.success }]}>
                  {totalPRs}
                </Text>
                <Text style={styles.summaryLabel}>PRs</Text>
              </View>
            </>
          )}
        </View>

        {/* Muscle tags */}
        {muscles.length > 0 && (
          <View style={styles.muscleTags}>
            {muscles.map((m) => (
              <Badge key={m} label={m} variant="primary" />
            ))}
          </View>
        )}

        {/* Notes */}
        {workout.notes && (
          <Card style={styles.notesCard} padding="md">
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesText}>{workout.notes}</Text>
          </Card>
        )}

        {/* Exercises */}
        {exerciseGroups.map((group, gIdx) => {
          const groupVolume = group.sets.reduce(
            (sum, s) =>
              s.type !== 'warmup' && s.weight && s.reps
                ? sum + s.weight * s.reps
                : sum,
            0
          );
          const bestSet = group.sets.reduce(
            (best, s) => {
              if (s.type === 'warmup' || !s.weight || !s.reps) return best;
              const e1rm = estimateOneRM(s.weight, s.reps);
              return e1rm > best.e1rm ? { e1rm, weight: s.weight, reps: s.reps } : best;
            },
            { e1rm: 0, weight: 0, reps: 0 }
          );

          return (
            <HapticPressable
              key={gIdx}
              onPress={() => router.push(`/exercise/${group.exerciseId}`)}
            >
              <Card style={styles.exerciseCard} padding="md">
                {/* Exercise header */}
                <View style={styles.exerciseHeader}>
                  <View style={styles.exerciseInfo}>
                    <Text style={styles.exerciseName}>{group.exerciseName}</Text>
                    <Text style={styles.exerciseMeta}>
                      {group.sets.filter((s) => s.type !== 'warmup').length} sets
                      {groupVolume > 0 && ` · ${formatVolume(groupVolume, unit)}`}
                      {bestSet.e1rm > 0 && ` · e1RM ${formatWeight(bestSet.e1rm, unit)}`}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </View>

                {/* Notes */}
                {group.notes && (
                  <Text style={styles.exerciseNotes}>{group.notes}</Text>
                )}

                {/* Set table */}
                <View style={styles.setTable}>
                  {/* Header row */}
                  <View style={styles.setRow}>
                    <Text style={[styles.setCell, styles.setCellHeader, styles.setCellSet]}>
                      Set
                    </Text>
                    <Text style={[styles.setCell, styles.setCellHeader, styles.setCellWeight]}>
                      Weight
                    </Text>
                    <Text style={[styles.setCell, styles.setCellHeader, styles.setCellReps]}>
                      Reps
                    </Text>
                    <Text style={[styles.setCell, styles.setCellHeader, styles.setCellRpe]}>
                      RPE
                    </Text>
                  </View>

                  {group.sets.map((s, sIdx) => (
                    <View
                      key={sIdx}
                      style={[
                        styles.setRow,
                        s.isPersonalRecord ? styles.prRow : undefined,
                      ]}
                    >
                      <View style={[styles.setCell, styles.setCellSet]}>
                        {s.type === 'warmup' ? (
                          <Badge label="W" variant="muted" />
                        ) : (
                          <Text style={styles.setCellText}>{s.setNumber}</Text>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.setCell,
                          styles.setCellWeight,
                          styles.setCellText,
                        ]}
                      >
                        {s.weight != null ? `${s.weight} ${unit}` : '—'}
                      </Text>
                      <Text
                        style={[
                          styles.setCell,
                          styles.setCellReps,
                          styles.setCellText,
                        ]}
                      >
                        {s.reps != null ? s.reps : '—'}
                      </Text>
                      <View style={[styles.setCell, styles.setCellRpe, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                        <Text style={styles.setCellText}>
                          {s.rpe != null ? s.rpe : '—'}
                        </Text>
                        {!!s.isPersonalRecord && (
                          <Badge label="PR" variant="success" />
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              </Card>
            </HapticPressable>
          );
        })}
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
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
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

  setTable: {
    marginTop: spacing.xs,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  prRow: {
    backgroundColor: colors.successMuted,
  },
  setCell: {
    justifyContent: 'center',
  },
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
  setCellReps: { flex: 1, textAlign: 'center' },
  setCellRpe: { flex: 1, alignItems: 'flex-end', paddingRight: spacing.xs },
});
