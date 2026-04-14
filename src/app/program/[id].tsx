import { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
} from '@/db/schema';
import { eq, and } from 'drizzle-orm';

interface ProgramDetail {
  id: string;
  name: string;
  description: string | null;
  numWeeks: number;
  daysPerWeek: number;
  difficulty: string | null;
}

interface DayWithExercises {
  id: string;
  weekNumber: number;
  dayNumber: number;
  name: string;
  exercises: Array<{
    name: string;
    targetSets: number | null;
    targetReps: string | null;
  }>;
}

export default function ProgramDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [program, setProgram] = useState<ProgramDetail | null>(null);
  const [days, setDays] = useState<DayWithExercises[]>([]);
  const [selectedWeek, setSelectedWeek] = useState(1);

  useEffect(() => {
    loadProgram();
  }, [id]);

  const loadProgram = async () => {
    if (!id) return;
    try {
      const result = await db.select().from(programs).where(eq(programs.id, id)).limit(1);
      if (result[0]) setProgram(result[0]);

      const daysResult = await db
        .select()
        .from(programDays)
        .where(eq(programDays.programId, id))
        .orderBy(programDays.weekNumber, programDays.dayNumber);

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
    } catch {}
  };

  const handleStartProgram = async () => {
    if (!program) return;

    const instanceId = uuid();
    await db.insert(programInstances).values({
      id: instanceId,
      programId: program.id,
      startedAt: new Date().toISOString(),
      currentWeek: 1,
      currentDay: 1,
      isActive: 1,
    });

    Alert.alert('Program Started!', `${program.name} is now your active program.`);
    router.back();
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

  const weeks = Array.from({ length: program.numWeeks }, (_, i) => i + 1);
  const weekDays = days.filter((d) => d.weekNumber === selectedWeek);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <HapticPressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </HapticPressable>
        <Text style={styles.headerTitle}>{program.name}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Info */}
        <View style={styles.infoRow}>
          {program.difficulty && (
            <Badge label={program.difficulty} variant="warning" />
          )}
          <Text style={styles.infoText}>
            {program.numWeeks} weeks · {program.daysPerWeek} days/week
          </Text>
        </View>

        {program.description && (
          <Text style={styles.description}>{program.description}</Text>
        )}

        <Button
          title="Start Program"
          onPress={handleStartProgram}
          fullWidth
          size="lg"
          style={styles.startButton}
        />

        {/* Week Selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.weekSelector}
        >
          {weeks.map((w) => (
            <HapticPressable
              key={w}
              onPress={() => setSelectedWeek(w)}
            >
              <View
                style={[
                  styles.weekChip,
                  selectedWeek === w && styles.weekChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.weekChipText,
                    selectedWeek === w && styles.weekChipTextActive,
                  ]}
                >
                  Week {w}
                </Text>
              </View>
            </HapticPressable>
          ))}
        </ScrollView>

        {/* Days */}
        {weekDays.map((day) => (
          <Card key={day.id} style={styles.dayCard} padding="md">
            <Text style={styles.dayName}>{day.name}</Text>
            <Text style={styles.dayLabel}>
              Day {day.dayNumber}
            </Text>
            {day.exercises.map((ex, i) => (
              <View key={i} style={styles.exerciseRow}>
                <Text style={styles.exerciseName}>{ex.name}</Text>
                <Text style={styles.exerciseTarget}>
                  {ex.targetSets && `${ex.targetSets}x`}
                  {ex.targetReps || ''}
                </Text>
              </View>
            ))}
          </Card>
        ))}
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
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  infoText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  description: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  startButton: { marginBottom: spacing.lg },
  weekSelector: {
    gap: spacing.xs,
    paddingBottom: spacing.md,
  },
  weekChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.xs,
  },
  weekChipActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  weekChipText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  weekChipTextActive: {
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  dayCard: { marginBottom: spacing.sm },
  dayName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  dayLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginBottom: spacing.sm,
  },
  exerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  exerciseName: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    flex: 1,
  },
  exerciseTarget: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontVariant: ['tabular-nums'],
  },
});
