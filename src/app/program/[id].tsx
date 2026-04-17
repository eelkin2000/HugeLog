import { useEffect, useState, useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { generateId as uuid } from '@/utils/id';
import { colors, spacing, fontSize, fontWeight, radius } from '@/ui/theme';
import { Card } from '@/ui/components/Card';
import { Button } from '@/ui/components/Button';
import { Badge } from '@/ui/components/Badge';
import { HapticPressable } from '@/ui/components/HapticPressable';
import { db } from '@/db/client';
import {
  programs,
  programDays,
  programExercises,
  programInstances,
  exercises,
  workouts,
} from '@/db/schema';
import { eq, and, sql, desc } from 'drizzle-orm';

interface ProgramDetail {
  id: string;
  name: string;
  description: string | null;
  daysPerWeek: number;
}

interface DayWithExercises {
  id: string;
  dayNumber: number;
  name: string;
  exercises: Array<{
    name: string;
    targetSets: number | null;
    targetReps: string | null;
  }>;
}

interface ActiveInstance {
  id: string;
  currentWeek: number;
  currentDay: number;
  startedAt: string;
}

interface CompletedWorkout {
  date: string;
  programDay: number | null;
  dayName: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);
  return days;
}

function formatMonthYear(year: number, month: number) {
  const date = new Date(year, month, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function ProgramDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [program, setProgram] = useState<ProgramDetail | null>(null);
  const [days, setDays] = useState<DayWithExercises[]>([]);
  const [activeInstance, setActiveInstance] = useState<ActiveInstance | null>(null);
  const [completedWorkouts, setCompletedWorkouts] = useState<CompletedWorkout[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      // Load program
      const result = await db
        .select()
        .from(programs)
        .where(eq(programs.id, id))
        .limit(1);
      if (result[0]) setProgram(result[0]);

      // Load days with exercises
      const daysResult = await db
        .select()
        .from(programDays)
        .where(eq(programDays.programId, id))
        .orderBy(programDays.dayNumber);

      const daysWithExercises: DayWithExercises[] = [];
      for (const day of daysResult) {
        const exResult = await db
          .select({
            name: exercises.name,
            targetSets: programExercises.targetSets,
            targetReps: programExercises.targetReps,
          })
          .from(programExercises)
          .innerJoin(exercises, eq(programExercises.exerciseId, exercises.id))
          .where(eq(programExercises.programDayId, day.id))
          .orderBy(programExercises.sortOrder);

        daysWithExercises.push({ ...day, exercises: exResult });
      }
      setDays(daysWithExercises);

      // Load active instance
      const instanceResult = await db
        .select()
        .from(programInstances)
        .where(
          and(
            eq(programInstances.programId, id),
            eq(programInstances.isActive, 1)
          )
        )
        .limit(1);

      if (instanceResult.length > 0) {
        const inst = instanceResult[0];
        setActiveInstance({
          id: inst.id,
          currentWeek: inst.currentWeek || 1,
          currentDay: inst.currentDay || 1,
          startedAt: inst.startedAt,
        });

        // Load completed workouts for this instance
        const completedResult = await db
          .select({
            completedAt: workouts.completedAt,
            programDay: workouts.programDay,
            name: workouts.name,
          })
          .from(workouts)
          .where(
            and(
              eq(workouts.programInstanceId, inst.id),
              sql`${workouts.completedAt} IS NOT NULL`
            )
          )
          .orderBy(desc(workouts.completedAt));

        setCompletedWorkouts(
          completedResult.map((w) => ({
            date: w.completedAt!.split('T')[0],
            programDay: w.programDay,
            dayName: w.name,
          }))
        );
      } else {
        setActiveInstance(null);
        setCompletedWorkouts([]);
      }
    } catch {}
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleStartProgram = async () => {
    if (!program) return;

    // Deactivate any existing active instances for this program
    const existingActive = await db
      .select()
      .from(programInstances)
      .where(
        and(
          eq(programInstances.programId, program.id),
          eq(programInstances.isActive, 1)
        )
      );
    for (const inst of existingActive) {
      await db
        .update(programInstances)
        .set({ isActive: 0, completedAt: new Date().toISOString() })
        .where(eq(programInstances.id, inst.id));
    }

    const instanceId = uuid();
    await db.insert(programInstances).values({
      id: instanceId,
      programId: program.id,
      startedAt: new Date().toISOString(),
      currentWeek: 1,
      currentDay: 1,
      isActive: 1,
    });

    await loadData();
  };

  const handleStopProgram = () => {
    Alert.alert(
      'Stop Program',
      'Are you sure you want to stop this program? Your workout history will be kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop',
          style: 'destructive',
          onPress: async () => {
            if (activeInstance) {
              await db
                .update(programInstances)
                .set({ isActive: 0, completedAt: new Date().toISOString() })
                .where(eq(programInstances.id, activeInstance.id));
              setActiveInstance(null);
              setCompletedWorkouts([]);
            }
          },
        },
      ]
    );
  };

  const handleDeleteProgram = () => {
    Alert.alert(
      'Delete Program',
      'This will permanently delete this program and all its workout days. Completed workouts will be kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!id) return;
            // Deactivate instances
            const instances = await db
              .select()
              .from(programInstances)
              .where(eq(programInstances.programId, id));
            for (const inst of instances) {
              await db
                .update(programInstances)
                .set({ isActive: 0 })
                .where(eq(programInstances.id, inst.id));
            }

            // Delete program exercises for each day
            const daysList = await db
              .select()
              .from(programDays)
              .where(eq(programDays.programId, id));
            for (const day of daysList) {
              await db
                .delete(programExercises)
                .where(eq(programExercises.programDayId, day.id));
            }

            // Delete days
            await db.delete(programDays).where(eq(programDays.programId, id));
            // Delete program
            await db.delete(programs).where(eq(programs.id, id));

            router.back();
          },
        },
      ]
    );
  };

  const handleStartWorkout = (day: DayWithExercises) => {
    if (!activeInstance) return;
    // Navigate to active workout with program context
    router.push({
      pathname: '/workout/active',
      params: {
        programInstanceId: activeInstance.id,
        programDayId: day.id,
        programDayName: day.name,
        programDayNumber: day.dayNumber,
        programWeek: activeInstance.currentWeek,
      },
    });
  };

  const prevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear((y) => y - 1);
    } else {
      setCalendarMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear((y) => y + 1);
    } else {
      setCalendarMonth((m) => m + 1);
    }
  };

  if (!program) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.textSecondary }}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const calendarDays = getCalendarDays(calendarYear, calendarMonth);
  const completedDatesSet = new Set(completedWorkouts.map((w) => w.date));
  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <HapticPressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </HapticPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {program.name}
        </Text>
        <HapticPressable onPress={handleDeleteProgram}>
          <Ionicons name="trash-outline" size={22} color={colors.danger} />
        </HapticPressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Description */}
        {program.description && (
          <Text style={styles.description}>{program.description}</Text>
        )}

        {/* Active status / Start button */}
        {activeInstance ? (
          <Card style={styles.activeCard} variant="elevated" padding="md">
            <View style={styles.activeRow}>
              <Badge label="ACTIVE" variant="success" />
              <Text style={styles.activeInfo}>
                Week {activeInstance.currentWeek} · {completedWorkouts.length} workouts done
              </Text>
            </View>
            <View style={styles.activeActions}>
              <Button
                title="Stop Program"
                onPress={handleStopProgram}
                variant="ghost"
                size="sm"
              />
            </View>
          </Card>
        ) : (
          <Button
            title="Start Program"
            onPress={handleStartProgram}
            fullWidth
            size="lg"
            style={styles.startButton}
          />
        )}

        {/* Calendar - only when active */}
        {activeInstance && (
          <Card style={styles.calendarCard} padding="md">
            <View style={styles.calendarHeader}>
              <HapticPressable onPress={prevMonth}>
                <Ionicons name="chevron-back" size={22} color={colors.text} />
              </HapticPressable>
              <Text style={styles.calendarTitle}>
                {formatMonthYear(calendarYear, calendarMonth)}
              </Text>
              <HapticPressable onPress={nextMonth}>
                <Ionicons name="chevron-forward" size={22} color={colors.text} />
              </HapticPressable>
            </View>

            {/* Weekday headers */}
            <View style={styles.calendarWeekdays}>
              {WEEKDAYS.map((d) => (
                <Text key={d} style={styles.calendarWeekday}>
                  {d}
                </Text>
              ))}
            </View>

            {/* Days grid */}
            <View style={styles.calendarGrid}>
              {calendarDays.map((day, idx) => {
                if (day === null) {
                  return <View key={`empty-${idx}`} style={styles.calendarCell} />;
                }
                const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isCompleted = completedDatesSet.has(dateStr);
                const isToday = dateStr === todayStr;

                return (
                  <View
                    key={dateStr}
                    style={[
                      styles.calendarCell,
                      isCompleted && styles.calendarCellCompleted,
                      isToday && !isCompleted && styles.calendarCellToday,
                    ]}
                  >
                    <Text
                      style={[
                        styles.calendarDayText,
                        isCompleted && styles.calendarDayTextCompleted,
                        isToday && styles.calendarDayTextToday,
                      ]}
                    >
                      {day}
                    </Text>
                    {isCompleted && (
                      <Ionicons
                        name="checkmark"
                        size={10}
                        color={colors.success}
                        style={styles.calendarCheck}
                      />
                    )}
                  </View>
                );
              })}
            </View>
          </Card>
        )}

        {/* Workout Days */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Workout Days</Text>
          <Text style={styles.sectionSubtitle}>
            {days.length} day{days.length !== 1 ? 's' : ''} in rotation
          </Text>
        </View>

        {days.length === 0 ? (
          <View style={styles.emptyDays}>
            <Ionicons name="calendar-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>No workout days defined yet</Text>
          </View>
        ) : (
          days.map((day) => {
            const isNextDay =
              activeInstance && day.dayNumber === activeInstance.currentDay;

            return (
              <Card
                key={day.id}
                style={[styles.dayCard, isNextDay && styles.dayCardNext]}
                padding="md"
              >
                <View style={styles.dayHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.dayTitleRow}>
                      <Text style={styles.dayName}>{day.name}</Text>
                      {isNextDay && <Badge label="NEXT" variant="warning" />}
                    </View>
                    <Text style={styles.dayExerciseCount}>
                      {day.exercises.length} exercise
                      {day.exercises.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  <HapticPressable
                    onPress={() =>
                      router.push({
                        pathname: '/program/edit-day',
                        params: { dayId: day.id, dayName: day.name },
                      })
                    }
                  >
                    <Ionicons
                      name="create-outline"
                      size={20}
                      color={colors.textSecondary}
                    />
                  </HapticPressable>
                </View>

                {/* Exercise list preview */}
                {day.exercises.length > 0 && (
                  <View style={styles.exercisePreview}>
                    {day.exercises.map((ex, i) => (
                      <View key={i} style={styles.exercisePreviewRow}>
                        <Text style={styles.exercisePreviewName} numberOfLines={1}>
                          {ex.name}
                        </Text>
                        <Text style={styles.exercisePreviewTarget}>
                          {ex.targetSets && `${ex.targetSets}x`}
                          {ex.targetReps || ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Start workout button - only for active programs */}
                {activeInstance && day.exercises.length > 0 && (
                  <Button
                    title={isNextDay ? 'Start This Workout' : 'Start Workout'}
                    onPress={() => handleStartWorkout(day)}
                    variant={isNextDay ? 'primary' : 'secondary'}
                    fullWidth
                    size="sm"
                    style={styles.startWorkoutButton}
                  />
                )}
              </Card>
            );
          })
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
  description: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    lineHeight: 22,
    marginBottom: spacing.md,
  },

  // Active card
  activeCard: {
    marginBottom: spacing.md,
    borderColor: colors.success,
    borderWidth: 1,
  },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  activeInfo: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    flex: 1,
  },
  activeActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.sm,
  },
  startButton: { marginBottom: spacing.md },

  // Calendar
  calendarCard: { marginBottom: spacing.lg },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  calendarTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  calendarWeekdays: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  calendarWeekday: {
    flex: 1,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  calendarCellCompleted: {
    backgroundColor: colors.successMuted,
    borderRadius: radius.sm,
  },
  calendarCellToday: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
  },
  calendarDayText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  calendarDayTextCompleted: {
    color: colors.success,
    fontWeight: fontWeight.semibold,
  },
  calendarDayTextToday: {
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  calendarCheck: {
    position: 'absolute',
    bottom: 2,
  },

  // Section
  sectionHeader: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  sectionSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },

  // Day cards
  dayCard: { marginBottom: spacing.sm },
  dayCardNext: {
    borderColor: colors.warning,
    borderWidth: 1,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  dayTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dayName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  dayExerciseCount: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },

  // Exercise preview
  exercisePreview: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  exercisePreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  exercisePreviewName: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    flex: 1,
    marginRight: spacing.sm,
  },
  exercisePreviewTarget: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontVariant: ['tabular-nums'],
  },

  startWorkoutButton: { marginTop: spacing.sm },

  // Empty
  emptyDays: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    marginTop: spacing.md,
  },
});
