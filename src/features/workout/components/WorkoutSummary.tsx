import { View, Text, StyleSheet, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontWeight, radius } from '@/ui/theme';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { Badge } from '@/ui/components/Badge';
import { formatDuration, formatVolume, formatNumber } from '@/utils/formatting';
import { MUSCLE_GROUP_LABELS, type MuscleGroup, type WeightUnit } from '@/utils/constants';

interface ExerciseSummary {
  name: string;
  primaryMuscle: string;
  setsCompleted: number;
  totalSets: number;
  bestSet: { weight: number; reps: number } | null;
  prsHit: number;
}

interface WorkoutSummaryProps {
  visible: boolean;
  onClose: () => void;
  workoutName: string;
  duration: number;
  totalVolume: number;
  totalSets: number;
  totalReps: number;
  totalPRs: number;
  exercises: ExerciseSummary[];
  muscleGroups: string[];
  unit: WeightUnit;
}

export function WorkoutSummary({
  visible,
  onClose,
  workoutName,
  duration,
  totalVolume,
  totalSets,
  totalReps,
  totalPRs,
  exercises,
  muscleGroups,
  unit,
}: WorkoutSummaryProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          {/* Trophy / Celebration */}
          <View style={styles.celebration}>
            <View style={styles.trophyCircle}>
              <Ionicons name="trophy" size={48} color={colors.warning} />
            </View>
            <Text style={styles.congratsText}>Workout Complete!</Text>
            <Text style={styles.workoutName}>{workoutName}</Text>
          </View>

          {/* Main Stats Grid */}
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Ionicons name="time-outline" size={22} color={colors.primary} />
              <Text style={styles.statValue}>{formatDuration(duration)}</Text>
              <Text style={styles.statLabel}>Duration</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="barbell-outline" size={22} color={colors.secondary} />
              <Text style={styles.statValue}>
                {formatVolume(totalVolume, unit)}
              </Text>
              <Text style={styles.statLabel}>Volume</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="layers-outline" size={22} color={colors.success} />
              <Text style={styles.statValue}>{totalSets}</Text>
              <Text style={styles.statLabel}>Sets</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="repeat-outline" size={22} color={colors.warning} />
              <Text style={styles.statValue}>{formatNumber(totalReps)}</Text>
              <Text style={styles.statLabel}>Reps</Text>
            </View>
          </View>

          {/* PRs */}
          {totalPRs > 0 && (
            <Card style={styles.prCard} padding="md" variant="elevated">
              <View style={styles.prHeader}>
                <Ionicons name="trophy" size={20} color={colors.warning} />
                <Text style={styles.prTitle}>
                  {totalPRs} Personal Record{totalPRs > 1 ? 's' : ''}!
                </Text>
              </View>
              {exercises
                .filter((e) => e.prsHit > 0)
                .map((e, i) => (
                  <View key={i} style={styles.prExercise}>
                    <Badge label="PR" variant="success" />
                    <Text style={styles.prExerciseName}>{e.name}</Text>
                  </View>
                ))}
            </Card>
          )}

          {/* Muscle Groups Worked */}
          {muscleGroups.length > 0 && (
            <View style={styles.muscleSection}>
              <Text style={styles.sectionTitle}>Muscles Worked</Text>
              <View style={styles.muscleChips}>
                {muscleGroups.map((m) => (
                  <Badge
                    key={m}
                    label={MUSCLE_GROUP_LABELS[m as MuscleGroup] || m}
                    variant="primary"
                    style={styles.muscleChip}
                  />
                ))}
              </View>
            </View>
          )}

          {/* Exercise Breakdown */}
          <Text style={styles.sectionTitle}>Exercises</Text>
          {exercises.map((ex, i) => (
            <View key={i} style={styles.exerciseRow}>
              <View style={styles.exerciseInfo}>
                <Text style={styles.exerciseName}>{ex.name}</Text>
                <Text style={styles.exerciseMeta}>
                  {ex.setsCompleted}/{ex.totalSets} sets
                  {ex.bestSet &&
                    ` · Best: ${ex.bestSet.weight}${unit} x ${ex.bestSet.reps}`}
                </Text>
              </View>
              {ex.prsHit > 0 && (
                <Ionicons name="trophy" size={16} color={colors.warning} />
              )}
            </View>
          ))}
        </ScrollView>

        {/* Done Button */}
        <View style={styles.footer}>
          <Button
            title="Done"
            onPress={onClose}
            fullWidth
            size="lg"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  celebration: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    paddingTop: spacing.lg,
  },
  trophyCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.warningMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  congratsText: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
  },
  workoutName: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    marginTop: spacing.xs,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statItem: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  statValue: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
  },
  prCard: {
    marginBottom: spacing.lg,
    borderColor: colors.warning,
    borderWidth: 1,
  },
  prHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  prTitle: {
    color: colors.warning,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  prExercise: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  prExerciseName: {
    color: colors.text,
    fontSize: fontSize.sm,
  },
  muscleSection: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  muscleChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  muscleChip: {
    marginBottom: spacing.xs,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  exerciseInfo: { flex: 1 },
  exerciseName: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  exerciseMeta: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
