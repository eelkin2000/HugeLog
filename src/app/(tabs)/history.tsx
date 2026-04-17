import { useEffect, useState, useCallback, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  RefreshControl,
  Alert,
  Animated as RNAnimated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { colors, spacing, fontSize, fontWeight, radius } from '@/ui/theme';
import { Card } from '@/ui/components/Card';
import { HapticPressable } from '@/ui/components/HapticPressable';
import { EmptyState } from '@/ui/components/EmptyState';
import { db } from '@/db/client';
import { workouts, workoutExercises, sets } from '@/db/schema';
import { desc, sql, and, gte, lt, eq, inArray } from 'drizzle-orm';
import { formatDate, formatDuration, formatVolume } from '@/utils/formatting';
import { useAppStore } from '@/stores/appStore';

interface WorkoutSummary {
  id: string;
  name: string;
  startedAt: string;
  durationSeconds: number;
  totalVolume: number;
}

// ── Swipeable workout row ─────────────────────────────────────────

interface SwipeableWorkoutCardProps {
  workout: WorkoutSummary;
  unit: string;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function SwipeableWorkoutCard({
  workout: w,
  unit,
  onPress,
  onEdit,
  onDelete,
}: SwipeableWorkoutCardProps) {
  const swipeableRef = useRef<Swipeable>(null);

  const renderRightActions = (
    _progress: RNAnimated.AnimatedInterpolation<number>,
    dragX: RNAnimated.AnimatedInterpolation<number>
  ) => {
    const translateX = dragX.interpolate({
      inputRange: [-160, 0],
      outputRange: [0, 160],
      extrapolate: 'clamp',
    });

    return (
      <RNAnimated.View
        style={[styles.swipeActions, { transform: [{ translateX }] }]}
      >
        <HapticPressable
          hapticType="light"
          onPress={() => {
            swipeableRef.current?.close();
            onEdit();
          }}
          style={styles.editAction}
        >
          <Ionicons name="pencil" size={18} color={colors.text} />
          <Text style={styles.actionText}>Edit</Text>
        </HapticPressable>

        <HapticPressable
          hapticType="heavy"
          onPress={() => {
            swipeableRef.current?.close();
            onDelete();
          }}
          style={styles.deleteAction}
        >
          <Ionicons name="trash-outline" size={18} color={colors.text} />
          <Text style={styles.actionText}>Delete</Text>
        </HapticPressable>
      </RNAnimated.View>
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootRight={false}
      friction={2}
    >
      <HapticPressable onPress={onPress}>
        <Card style={styles.workoutCard} padding="md">
          <Text style={styles.workoutName}>{w.name}</Text>
          <View style={styles.workoutMeta}>
            <Text style={styles.metaText}>{formatDate(w.startedAt)}</Text>
            <Text style={styles.metaDot}>&middot;</Text>
            <Text style={styles.metaText}>{formatDuration(w.durationSeconds)}</Text>
            <Text style={styles.metaDot}>&middot;</Text>
            <Text style={styles.metaText}>{formatVolume(w.totalVolume, unit)}</Text>
          </View>
        </Card>
      </HapticPressable>
    </Swipeable>
  );
}

// ── Screen ────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const router = useRouter();
  const unit = useAppStore((s) => s.unit);
  const [workoutList, setWorkoutList] = useState<WorkoutSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [monthWorkouts, setMonthWorkouts] = useState<Map<string, string>>(new Map());

  const loadMonthData = useCallback(async (monthDate: Date) => {
    try {
      const y = monthDate.getFullYear();
      const m = monthDate.getMonth();
      const monthStart = new Date(y, m, 1).toISOString();
      const monthEnd = new Date(y, m + 1, 1).toISOString();

      const result = await db
        .select()
        .from(workouts)
        .where(
          and(
            sql`${workouts.completedAt} IS NOT NULL`,
            gte(workouts.startedAt, monthStart),
            lt(workouts.startedAt, monthEnd)
          )
        )
        .orderBy(desc(workouts.startedAt));

      setWorkoutList(
        result.map((w) => ({
          id: w.id,
          name: w.name,
          startedAt: w.startedAt,
          durationSeconds: w.durationSeconds || 0,
          totalVolume: w.totalVolume || 0,
        }))
      );

      const map = new Map<string, string>();
      for (const w of result) {
        const dateKey = w.startedAt.split('T')[0];
        if (!map.has(dateKey)) map.set(dateKey, w.id);
      }
      setMonthWorkouts(map);
    } catch {}
  }, []);

  useEffect(() => {
    loadMonthData(selectedMonth);
  }, [selectedMonth, loadMonthData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMonthData(selectedMonth);
    setRefreshing(false);
  };

  const handleDelete = useCallback(
    (w: WorkoutSummary) => {
      Alert.alert(
        'Delete Workout',
        `Delete "${w.name}"? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                const weRows = await db
                  .select({ id: workoutExercises.id })
                  .from(workoutExercises)
                  .where(eq(workoutExercises.workoutId, w.id));

                if (weRows.length > 0) {
                  await db.delete(sets).where(
                    inArray(sets.workoutExerciseId, weRows.map((r) => r.id))
                  );
                }
                await db.delete(workoutExercises).where(eq(workoutExercises.workoutId, w.id));
                await db.delete(workouts).where(eq(workouts.id, w.id));
                await loadMonthData(selectedMonth);
              } catch {}
            },
          },
        ]
      );
    },
    [selectedMonth, loadMonthData]
  );

  // Calendar helpers
  const monthName = selectedMonth.toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  const year = selectedMonth.getFullYear();
  const month = selectedMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let i = 1; i <= daysInMonth; i++) calendarDays.push(i);

  const prevMonth = () => {
    const d = new Date(selectedMonth);
    d.setMonth(d.getMonth() - 1);
    setSelectedMonth(d);
  };

  const nextMonth = () => {
    const d = new Date(selectedMonth);
    d.setMonth(d.getMonth() + 1);
    setSelectedMonth(d);
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
        <Text style={styles.title}>History</Text>

        {/* Calendar */}
        <Card style={styles.calendar} padding="md">
          <View style={styles.calendarHeader}>
            <HapticPressable onPress={prevMonth}>
              <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
            </HapticPressable>
            <Text style={styles.monthText}>{monthName}</Text>
            <HapticPressable onPress={nextMonth}>
              <Ionicons name="chevron-forward" size={24} color={colors.textSecondary} />
            </HapticPressable>
          </View>

          <View style={styles.dayLabels}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <Text key={d} style={styles.dayLabel}>{d}</Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {calendarDays.map((day, i) => {
              if (day === null) {
                return <View key={`empty-${i}`} style={styles.dayCell} />;
              }

              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const hasWorkout = monthWorkouts.has(dateStr);
              const isToday = new Date().toISOString().split('T')[0] === dateStr;

              if (hasWorkout) {
                return (
                  <HapticPressable
                    key={day}
                    onPress={() => {
                      const workoutId = monthWorkouts.get(dateStr);
                      if (workoutId) router.push(`/workout/${workoutId}`);
                    }}
                    style={{ width: '14.28%' }}
                  >
                    <View style={[styles.dayCell, { width: '100%' }]}>
                      <View style={[styles.dayNumber, isToday && styles.todayNumber, styles.workoutDay]}>
                        <Text style={[styles.dayText, isToday && styles.todayText, styles.workoutDayText]}>
                          {day}
                        </Text>
                      </View>
                      <View style={styles.dot} />
                    </View>
                  </HapticPressable>
                );
              }

              return (
                <View key={day} style={styles.dayCell}>
                  <View style={[styles.dayNumber, isToday && styles.todayNumber]}>
                    <Text style={[styles.dayText, isToday && styles.todayText]}>{day}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </Card>

        {/* Workout List */}
        <Text style={styles.sectionTitle}>Workouts in {monthName}</Text>

        {workoutList.length === 0 ? (
          <EmptyState
            icon="barbell-outline"
            title="No workouts yet"
            description="Complete your first workout to see it here"
          />
        ) : (
          workoutList.map((w) => (
            <SwipeableWorkoutCard
              key={w.id}
              workout={w}
              unit={unit}
              onPress={() => router.push(`/workout/${w.id}`)}
              onEdit={() => router.push(`/workout/${w.id}?edit=1`)}
              onDelete={() => handleDelete(w)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  title: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.md,
  },

  // Calendar
  calendar: { marginBottom: spacing.lg },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  monthText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  dayLabels: { flexDirection: 'row', marginBottom: spacing.xs },
  dayLabel: { flex: 1, textAlign: 'center', color: colors.textMuted, fontSize: fontSize.xs },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', alignItems: 'center', paddingVertical: spacing.xs },
  dayNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: { color: colors.textSecondary, fontSize: fontSize.sm },
  todayNumber: { borderWidth: 1, borderColor: colors.primary },
  todayText: { color: colors.primary, fontWeight: fontWeight.semibold },
  workoutDay: { backgroundColor: colors.primaryMuted },
  workoutDayText: { color: colors.primary, fontWeight: fontWeight.semibold },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
    marginTop: 2,
  },

  // Workout list
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  workoutCard: { marginBottom: spacing.sm },
  workoutName: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  workoutMeta: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs },
  metaText: { color: colors.textSecondary, fontSize: fontSize.sm },
  metaDot: { color: colors.textMuted, marginHorizontal: spacing.xs },

  // Swipe actions
  swipeActions: {
    flexDirection: 'row',
    width: 160,
    marginBottom: spacing.sm,
  },
  editAction: {
    flex: 1,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: radius.sm,
    marginRight: 2,
  },
  deleteAction: {
    flex: 1,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: radius.sm,
    marginLeft: 2,
  },
  actionText: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
});
