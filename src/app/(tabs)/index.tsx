import { useEffect, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontWeight, radius } from '@/ui/theme';
import { Card } from '@/ui/components/Card';
import { Button } from '@/ui/components/Button';
import { HapticPressable } from '@/ui/components/HapticPressable';
import { Badge } from '@/ui/components/Badge';
import { db } from '@/db/client';
import { workouts, sets, workoutExercises, personalRecords } from '@/db/schema';
import { desc, eq, sql, and, gte } from 'drizzle-orm';
import { formatVolume, formatDuration, formatDate } from '@/utils/formatting';
import { useAppStore } from '@/stores/appStore';

export default function DashboardScreen() {
  const router = useRouter();
  const unit = useAppStore((s) => s.unit);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    workoutsThisWeek: 0,
    totalVolumeThisWeek: 0,
    currentStreak: 0,
    recentPRs: [] as Array<{ exerciseName: string; type: string; value: number; achievedAt: string }>,
    lastWorkout: null as { name: string; date: string; duration: number; volume: number } | null,
  });

  const loadStats = async () => {
    try {
      // Get start of current week (Monday)
      const now = new Date();
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(now);
      monday.setDate(now.getDate() + mondayOffset);
      monday.setHours(0, 0, 0, 0);
      const weekStart = monday.toISOString();

      // Workouts this week
      const weekWorkouts = await db
        .select()
        .from(workouts)
        .where(
          and(
            gte(workouts.startedAt, weekStart),
            sql`${workouts.completedAt} IS NOT NULL`
          )
        );

      const weekVolume = weekWorkouts.reduce(
        (sum, w) => sum + (w.totalVolume || 0),
        0
      );

      // Last workout
      const lastWorkoutResult = await db
        .select()
        .from(workouts)
        .where(sql`${workouts.completedAt} IS NOT NULL`)
        .orderBy(desc(workouts.startedAt))
        .limit(1);

      const lastWorkout = lastWorkoutResult[0]
        ? {
            name: lastWorkoutResult[0].name,
            date: lastWorkoutResult[0].startedAt,
            duration: lastWorkoutResult[0].durationSeconds || 0,
            volume: lastWorkoutResult[0].totalVolume || 0,
          }
        : null;

      // Recent PRs (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const recentPRsResult = await db
        .select({
          type: personalRecords.type,
          value: personalRecords.value,
          achievedAt: personalRecords.achievedAt,
          exerciseId: personalRecords.exerciseId,
        })
        .from(personalRecords)
        .where(gte(personalRecords.achievedAt, sevenDaysAgo.toISOString()))
        .orderBy(desc(personalRecords.achievedAt))
        .limit(5);

      setStats({
        workoutsThisWeek: weekWorkouts.length,
        totalVolumeThisWeek: weekVolume,
        currentStreak: weekWorkouts.length > 0 ? 1 : 0, // Simplified for now
        recentPRs: recentPRsResult.map((pr) => ({
          exerciseName: pr.exerciseId, // Will resolve to name later
          type: pr.type,
          value: pr.value,
          achievedAt: pr.achievedAt,
        })),
        lastWorkout,
      });
    } catch {
      // DB might not be ready yet
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>HugeLog</Text>
            <Text style={styles.subtitle}>Let's crush it today</Text>
          </View>
          <HapticPressable
            onPress={() => router.push('/analytics')}
            style={styles.analyticsButton}
          >
            <Ionicons name="stats-chart" size={22} color={colors.primary} />
          </HapticPressable>
        </View>

        {/* Quick Start */}
        <Card style={styles.quickStart} padding="lg">
          <View style={styles.quickStartHeader}>
            <Ionicons name="flash" size={24} color={colors.warning} />
            <Text style={styles.quickStartTitle}>Quick Start</Text>
          </View>
          <Text style={styles.quickStartDesc}>
            Start an empty workout and add exercises as you go
          </Text>
          <Button
            title="Start Workout"
            onPress={() => router.push('/workout/active')}
            fullWidth
            size="lg"
            style={styles.startButton}
          />
        </Card>

        {/* Weekly Stats */}
        <Text style={styles.sectionTitle}>This Week</Text>
        <View style={styles.statsRow}>
          <Card style={styles.statCard} padding="md">
            <Text style={styles.statValue}>{stats.workoutsThisWeek}</Text>
            <Text style={styles.statLabel}>Workouts</Text>
          </Card>
          <Card style={styles.statCard} padding="md">
            <Text style={styles.statValue}>
              {stats.totalVolumeThisWeek > 0
                ? formatVolume(stats.totalVolumeThisWeek, unit)
                : '0'}
            </Text>
            <Text style={styles.statLabel}>Volume</Text>
          </Card>
          <Card style={styles.statCard} padding="md">
            <View style={styles.streakContainer}>
              <Text style={styles.statValue}>{stats.currentStreak}</Text>
              {stats.currentStreak > 0 && (
                <Ionicons name="flame" size={16} color={colors.warning} />
              )}
            </View>
            <Text style={styles.statLabel}>Streak</Text>
          </Card>
        </View>

        {/* Last Workout */}
        {stats.lastWorkout && (
          <>
            <Text style={styles.sectionTitle}>Last Workout</Text>
            <Card padding="md">
              <Text style={styles.lastWorkoutName}>{stats.lastWorkout.name}</Text>
              <View style={styles.lastWorkoutMeta}>
                <Text style={styles.metaText}>
                  {formatDate(stats.lastWorkout.date)}
                </Text>
                <Text style={styles.metaDot}>&middot;</Text>
                <Text style={styles.metaText}>
                  {formatDuration(stats.lastWorkout.duration)}
                </Text>
                <Text style={styles.metaDot}>&middot;</Text>
                <Text style={styles.metaText}>
                  {formatVolume(stats.lastWorkout.volume, unit)}
                </Text>
              </View>
            </Card>
          </>
        )}

        {/* Recent PRs */}
        {stats.recentPRs.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Recent PRs</Text>
            {stats.recentPRs.map((pr, i) => (
              <Card key={i} style={styles.prCard} padding="sm">
                <View style={styles.prRow}>
                  <Badge label="PR" variant="success" />
                  <Text style={styles.prText}>
                    {pr.type} &middot; {pr.value} {unit}
                  </Text>
                </View>
              </Card>
            ))}
          </>
        )}

        {/* Empty state if no workouts */}
        {!stats.lastWorkout && (
          <View style={styles.emptySection}>
            <Ionicons name="barbell-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              No workouts yet. Start your first one!
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  greeting: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    marginTop: 2,
  },
  analyticsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickStart: { marginBottom: spacing.lg },
  quickStartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  quickStartTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  quickStartDesc: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
  },
  startButton: { marginTop: spacing.xs },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
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
    marginTop: 2,
  },
  streakContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  lastWorkoutName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  lastWorkoutMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  metaText: { color: colors.textSecondary, fontSize: fontSize.sm },
  metaDot: { color: colors.textMuted, marginHorizontal: spacing.xs },
  prCard: { marginBottom: spacing.xs },
  prRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  prText: {
    color: colors.text,
    fontSize: fontSize.sm,
  },
  emptySection: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
