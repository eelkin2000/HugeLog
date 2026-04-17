import { useState, useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontWeight, radius } from '@/ui/theme';
import { Card } from '@/ui/components/Card';
import { Button } from '@/ui/components/Button';
import { HapticPressable } from '@/ui/components/HapticPressable';
import { Badge } from '@/ui/components/Badge';
import { EmptyState } from '@/ui/components/EmptyState';
import { db } from '@/db/client';
import {
  programs,
  programInstances,
  programDays,
  programExercises,
  workouts,
} from '@/db/schema';
import { desc, eq, and, sql } from 'drizzle-orm';

interface ProgramItem {
  id: string;
  name: string;
  description: string | null;
  daysPerWeek: number;
  isActive: boolean;
  currentDay: number;
  instanceId: string | null;
  totalWorkouts: number;
  exerciseCount: number;
}

export default function ProgramsScreen() {
  const router = useRouter();
  const [programList, setProgramList] = useState<ProgramItem[]>([]);

  const loadPrograms = useCallback(async () => {
    try {
      const result = await db
        .select()
        .from(programs)
        .orderBy(desc(programs.createdAt));

      const items: ProgramItem[] = [];
      for (const prog of result) {
        // Check for active instance
        const instances = await db
          .select()
          .from(programInstances)
          .where(
            and(
              eq(programInstances.programId, prog.id),
              eq(programInstances.isActive, 1)
            )
          )
          .limit(1);

        let totalWorkouts = 0;
        if (instances.length > 0) {
          const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(workouts)
            .where(
              and(
                eq(workouts.programInstanceId, instances[0].id),
                sql`${workouts.completedAt} IS NOT NULL`
              )
            );
          totalWorkouts = countResult[0]?.count || 0;
        }

        // Count total exercises across all days
        const daysList = await db
          .select({ id: programDays.id })
          .from(programDays)
          .where(eq(programDays.programId, prog.id));

        let exerciseCount = 0;
        for (const day of daysList) {
          const exCount = await db
            .select({ count: sql<number>`count(*)` })
            .from(programExercises)
            .where(eq(programExercises.programDayId, day.id));
          exerciseCount += exCount[0]?.count || 0;
        }

        items.push({
          id: prog.id,
          name: prog.name,
          description: prog.description,
          daysPerWeek: prog.daysPerWeek,
          isActive: instances.length > 0,
          currentDay: instances[0]?.currentDay || 1,
          instanceId: instances[0]?.id || null,
          totalWorkouts,
          exerciseCount,
        });
      }

      setProgramList(items);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPrograms();
    }, [loadPrograms])
  );

  const handleDeleteProgram = (prog: ProgramItem) => {
    Alert.alert(
      'Delete Program',
      `Delete "${prog.name}"? Completed workouts will be kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Deactivate instances
            const instances = await db
              .select()
              .from(programInstances)
              .where(eq(programInstances.programId, prog.id));
            for (const inst of instances) {
              await db
                .update(programInstances)
                .set({ isActive: 0 })
                .where(eq(programInstances.id, inst.id));
            }

            // Delete exercises for each day
            const daysList = await db
              .select()
              .from(programDays)
              .where(eq(programDays.programId, prog.id));
            for (const day of daysList) {
              await db
                .delete(programExercises)
                .where(eq(programExercises.programDayId, day.id));
            }

            // Delete days and program
            await db
              .delete(programDays)
              .where(eq(programDays.programId, prog.id));
            await db.delete(programs).where(eq(programs.id, prog.id));

            loadPrograms();
          },
        },
      ]
    );
  };

  const activeProgram = programList.find((p) => p.isActive);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Programs</Text>
          <Button
            title="New"
            onPress={() => router.push('/program/create')}
            variant="secondary"
            size="sm"
          />
        </View>

        {/* Active Program Banner */}
        {activeProgram && (
          <HapticPressable
            onPress={() => router.push(`/program/${activeProgram.id}`)}
          >
            <Card style={styles.activeCard} variant="elevated" padding="lg">
              <View style={styles.activeHeader}>
                <Badge label="ACTIVE" variant="success" />
                <Text style={styles.activeWorkouts}>
                  {activeProgram.totalWorkouts} workout
                  {activeProgram.totalWorkouts !== 1 ? 's' : ''} completed
                </Text>
              </View>
              <Text style={styles.activeName}>{activeProgram.name}</Text>
              <Text style={styles.activeProgress}>
                Day {activeProgram.currentDay} of {activeProgram.daysPerWeek}
              </Text>
              <Button
                title="View Program"
                onPress={() => router.push(`/program/${activeProgram.id}`)}
                fullWidth
                style={styles.viewButton}
              />
            </Card>
          </HapticPressable>
        )}

        {/* Program List */}
        {programList.length === 0 ? (
          <EmptyState
            icon="clipboard-outline"
            title="No programs yet"
            description="Create a program to organize your workouts into a structured routine"
            actionLabel="Create Program"
            onAction={() => router.push('/program/create')}
          />
        ) : (
          <>
            <Text style={styles.sectionTitle}>All Programs</Text>
            {programList.map((prog) => (
              <HapticPressable
                key={prog.id}
                onPress={() => router.push(`/program/${prog.id}`)}
              >
                <Card style={styles.programCard} padding="md">
                  <View style={styles.programHeader}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.programTitleRow}>
                        <Text style={styles.programName}>{prog.name}</Text>
                        {prog.isActive && (
                          <Badge label="ACTIVE" variant="success" />
                        )}
                      </View>
                      {prog.description && (
                        <Text style={styles.programDesc} numberOfLines={1}>
                          {prog.description}
                        </Text>
                      )}
                    </View>
                    <HapticPressable
                      onPress={() => handleDeleteProgram(prog)}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={18}
                        color={colors.textMuted}
                      />
                    </HapticPressable>
                  </View>
                  <View style={styles.programMeta}>
                    <View style={styles.metaItem}>
                      <Ionicons
                        name="repeat-outline"
                        size={14}
                        color={colors.textMuted}
                      />
                      <Text style={styles.metaText}>
                        {prog.daysPerWeek} day{prog.daysPerWeek !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons
                        name="barbell-outline"
                        size={14}
                        color={colors.textMuted}
                      />
                      <Text style={styles.metaText}>
                        {prog.exerciseCount} exercise{prog.exerciseCount !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    {prog.isActive && (
                      <View style={styles.metaItem}>
                        <Ionicons
                          name="checkmark-circle-outline"
                          size={14}
                          color={colors.success}
                        />
                        <Text style={[styles.metaText, { color: colors.success }]}>
                          {prog.totalWorkouts} done
                        </Text>
                      </View>
                    )}
                  </View>
                </Card>
              </HapticPressable>
            ))}
          </>
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
  title: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
  },

  // Active banner
  activeCard: {
    marginBottom: spacing.lg,
    borderColor: colors.success,
    borderWidth: 1,
  },
  activeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  activeWorkouts: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  activeName: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  activeProgress: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    marginTop: spacing.xs,
  },
  viewButton: { marginTop: spacing.md },

  // Section
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
  },

  // Program cards
  programCard: { marginBottom: spacing.sm },
  programHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  programTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  programName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  programDesc: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  programMeta: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
});
