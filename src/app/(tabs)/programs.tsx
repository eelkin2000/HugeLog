import { useEffect, useState, useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontWeight, radius } from '@/ui/theme';
import { Card } from '@/ui/components/Card';
import { Button } from '@/ui/components/Button';
import { HapticPressable } from '@/ui/components/HapticPressable';
import { Badge } from '@/ui/components/Badge';
import { EmptyState } from '@/ui/components/EmptyState';
import { db } from '@/db/client';
import { programs, programInstances } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';

interface ProgramItem {
  id: string;
  name: string;
  description: string | null;
  numWeeks: number;
  daysPerWeek: number;
  difficulty: string | null;
  isBuiltIn: number | null;
}

export default function ProgramsScreen() {
  const router = useRouter();
  const [programList, setProgramList] = useState<ProgramItem[]>([]);
  const [activeProgram, setActiveProgram] = useState<{
    programId: string;
    programName: string;
    currentWeek: number;
    currentDay: number;
  } | null>(null);

  const loadPrograms = useCallback(async () => {
    try {
      const result = await db.select().from(programs).orderBy(desc(programs.createdAt));
      setProgramList(result);

      // Check for active program instance
      const activeResult = await db
        .select()
        .from(programInstances)
        .where(eq(programInstances.isActive, 1))
        .limit(1);

      if (activeResult.length > 0) {
        const instance = activeResult[0];
        const prog = result.find((p) => p.id === instance.programId);
        if (prog) {
          setActiveProgram({
            programId: prog.id,
            programName: prog.name,
            currentWeek: instance.currentWeek || 1,
            currentDay: instance.currentDay || 1,
          });
        }
      }
    } catch {
      // DB not ready
    }
  }, []);

  useEffect(() => {
    loadPrograms();
  }, [loadPrograms]);

  const getDifficultyVariant = (d: string | null) => {
    switch (d) {
      case 'beginner': return 'success' as const;
      case 'intermediate': return 'warning' as const;
      case 'advanced': return 'danger' as const;
      default: return 'muted' as const;
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Programs</Text>
          <Button
            title="Create"
            onPress={() => router.push('/program/create')}
            variant="secondary"
            size="sm"
          />
        </View>

        {/* Active Program Banner */}
        {activeProgram && (
          <HapticPressable
            onPress={() => router.push(`/program/${activeProgram.programId}`)}
          >
            <Card style={styles.activeCard} variant="elevated" padding="lg">
              <View style={styles.activeHeader}>
                <Badge label="ACTIVE" variant="success" />
              </View>
              <Text style={styles.activeName}>{activeProgram.programName}</Text>
              <Text style={styles.activeProgress}>
                Week {activeProgram.currentWeek} &middot; Day{' '}
                {activeProgram.currentDay}
              </Text>
              <Button
                title="Continue Workout"
                onPress={() => router.push('/workout/active')}
                fullWidth
                style={styles.continueButton}
              />
            </Card>
          </HapticPressable>
        )}

        {/* Program List */}
        <Text style={styles.sectionTitle}>
          {programList.some((p) => p.isBuiltIn) ? 'Built-in Programs' : 'All Programs'}
        </Text>

        {programList.length === 0 ? (
          <EmptyState
            icon="clipboard-outline"
            title="No programs yet"
            description="Create a custom program or browse built-in ones"
            actionLabel="Create Program"
            onAction={() => router.push('/program/create')}
          />
        ) : (
          programList.map((prog) => (
            <HapticPressable
              key={prog.id}
              onPress={() => router.push(`/program/${prog.id}`)}
            >
              <Card style={styles.programCard} padding="md">
                <View style={styles.programHeader}>
                  <Text style={styles.programName}>{prog.name}</Text>
                  {prog.difficulty && (
                    <Badge
                      label={prog.difficulty}
                      variant={getDifficultyVariant(prog.difficulty)}
                    />
                  )}
                </View>
                {prog.description && (
                  <Text style={styles.programDesc} numberOfLines={2}>
                    {prog.description}
                  </Text>
                )}
                <View style={styles.programMeta}>
                  <View style={styles.metaItem}>
                    <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
                    <Text style={styles.metaText}>{prog.numWeeks} weeks</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="repeat-outline" size={14} color={colors.textMuted} />
                    <Text style={styles.metaText}>{prog.daysPerWeek} days/week</Text>
                  </View>
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
  activeCard: {
    marginBottom: spacing.lg,
    borderColor: colors.success,
    borderWidth: 1,
  },
  activeHeader: { marginBottom: spacing.sm },
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
  continueButton: { marginTop: spacing.md },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  programCard: { marginBottom: spacing.sm },
  programHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  programName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    flex: 1,
  },
  programDesc: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
    lineHeight: 20,
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
