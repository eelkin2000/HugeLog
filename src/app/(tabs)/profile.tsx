import { useState, useEffect } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontWeight, radius } from '@/ui/theme';
import { Card } from '@/ui/components/Card';
import { Button } from '@/ui/components/Button';
import { HapticPressable } from '@/ui/components/HapticPressable';
import { useAppStore } from '@/stores/appStore';
import { db } from '@/db/client';
import { workouts, sets, workoutExercises } from '@/db/schema';
import { sql } from 'drizzle-orm';
import { formatNumber, formatVolume, formatDuration } from '@/utils/formatting';

export default function ProfileScreen() {
  const router = useRouter();
  const { unit, setUnit, chartSettings, setChartSettings } = useAppStore();
  const [showSettings, setShowSettings] = useState(false);
  const [allTimeStats, setAllTimeStats] = useState({
    totalWorkouts: 0,
    totalVolume: 0,
    totalSets: 0,
    totalDuration: 0,
  });

  useEffect(() => {
    loadAllTimeStats();
  }, []);

  const loadAllTimeStats = async () => {
    try {
      const workoutResult = await db
        .select({
          count: sql<number>`count(*)`,
          totalVol: sql<number>`coalesce(sum(${workouts.totalVolume}), 0)`,
          totalDur: sql<number>`coalesce(sum(${workouts.durationSeconds}), 0)`,
        })
        .from(workouts)
        .where(sql`${workouts.completedAt} IS NOT NULL`);

      const setsResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(sets)
        .where(sql`${sets.isCompleted} = 1`);

      setAllTimeStats({
        totalWorkouts: workoutResult[0]?.count || 0,
        totalVolume: workoutResult[0]?.totalVol || 0,
        totalSets: setsResult[0]?.count || 0,
        totalDuration: workoutResult[0]?.totalDur || 0,
      });
    } catch {
      // DB not ready
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Profile</Text>

        {/* All-Time Stats */}
        <Text style={styles.sectionTitle}>All-Time Stats</Text>
        <View style={styles.statsGrid}>
          <Card style={styles.statCard} padding="md">
            <Ionicons name="barbell" size={24} color={colors.primary} />
            <Text style={styles.statValue}>
              {formatNumber(allTimeStats.totalWorkouts)}
            </Text>
            <Text style={styles.statLabel}>Workouts</Text>
          </Card>
          <Card style={styles.statCard} padding="md">
            <Ionicons name="trending-up" size={24} color={colors.secondary} />
            <Text style={styles.statValue}>
              {allTimeStats.totalVolume > 0
                ? formatVolume(allTimeStats.totalVolume, unit)
                : '0'}
            </Text>
            <Text style={styles.statLabel}>Total Volume</Text>
          </Card>
          <Card style={styles.statCard} padding="md">
            <Ionicons name="layers" size={24} color={colors.success} />
            <Text style={styles.statValue}>
              {formatNumber(allTimeStats.totalSets)}
            </Text>
            <Text style={styles.statLabel}>Total Sets</Text>
          </Card>
          <Card style={styles.statCard} padding="md">
            <Ionicons name="time" size={24} color={colors.warning} />
            <Text style={styles.statValue}>
              {allTimeStats.totalDuration > 0
                ? formatDuration(allTimeStats.totalDuration)
                : '0m'}
            </Text>
            <Text style={styles.statLabel}>Time Trained</Text>
          </Card>
        </View>

        {/* Analytics */}
        <HapticPressable onPress={() => router.push('/analytics')}>
          <Card style={styles.menuItem} padding="md">
            <View style={styles.menuRow}>
              <Ionicons name="stats-chart" size={22} color={colors.primary} />
              <Text style={styles.menuText}>Analytics Dashboard</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </View>
          </Card>
        </HapticPressable>

        {/* Settings toggle */}
        <HapticPressable onPress={() => setShowSettings((v) => !v)}>
          <Card style={styles.menuItem} padding="md">
            <View style={styles.menuRow}>
              <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
              <Text style={styles.menuText}>Settings</Text>
              <Ionicons
                name={showSettings ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={colors.textMuted}
              />
            </View>
          </Card>
        </HapticPressable>

        {showSettings && (
          <>
            <Text style={styles.sectionTitle}>General</Text>
            <Card padding="md">
              {/* Units */}
              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Weight Unit</Text>
                <View style={styles.unitToggle}>
                  <HapticPressable
                    onPress={() => setUnit('lb')}
                    style={[
                      styles.unitButton,
                      unit === 'lb' && styles.unitButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.unitText,
                        unit === 'lb' && styles.unitTextActive,
                      ]}
                    >
                      lb
                    </Text>
                  </HapticPressable>
                  <HapticPressable
                    onPress={() => setUnit('kg')}
                    style={[
                      styles.unitButton,
                      unit === 'kg' && styles.unitButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.unitText,
                        unit === 'kg' && styles.unitTextActive,
                      ]}
                    >
                      kg
                    </Text>
                  </HapticPressable>
                </View>
              </View>
            </Card>

            <Text style={styles.sectionTitle}>Charts</Text>
            <Card padding="md">
              {/* Y Axis Divisions */}
              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Y Axis Divisions</Text>
                <View style={styles.stepperRow}>
                  <HapticPressable
                    onPress={() =>
                      setChartSettings({ yTickCount: Math.max(2, chartSettings.yTickCount - 1) })
                    }
                    style={styles.stepperButton}
                  >
                    <Ionicons name="remove" size={16} color={colors.text} />
                  </HapticPressable>
                  <Text style={styles.stepperValue}>{chartSettings.yTickCount}</Text>
                  <HapticPressable
                    onPress={() =>
                      setChartSettings({ yTickCount: Math.min(10, chartSettings.yTickCount + 1) })
                    }
                    style={styles.stepperButton}
                  >
                    <Ionicons name="add" size={16} color={colors.text} />
                  </HapticPressable>
                </View>
              </View>

              <View style={styles.settingDivider} />

              {/* X Axis Labels */}
              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>X Axis Labels</Text>
                <View style={styles.stepperRow}>
                  <HapticPressable
                    onPress={() =>
                      setChartSettings({ xTickCount: Math.max(2, chartSettings.xTickCount - 1) })
                    }
                    style={styles.stepperButton}
                  >
                    <Ionicons name="remove" size={16} color={colors.text} />
                  </HapticPressable>
                  <Text style={styles.stepperValue}>{chartSettings.xTickCount}</Text>
                  <HapticPressable
                    onPress={() =>
                      setChartSettings({ xTickCount: Math.min(10, chartSettings.xTickCount + 1) })
                    }
                    style={styles.stepperButton}
                  >
                    <Ionicons name="add" size={16} color={colors.text} />
                  </HapticPressable>
                </View>
              </View>

              <View style={styles.settingDivider} />

              {/* Grid Lines */}
              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Grid Lines</Text>
                <HapticPressable
                  onPress={() => setChartSettings({ showGrid: !chartSettings.showGrid })}
                  style={[
                    styles.toggleButton,
                    chartSettings.showGrid && styles.toggleButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      chartSettings.showGrid && styles.toggleTextActive,
                    ]}
                  >
                    {chartSettings.showGrid ? 'ON' : 'OFF'}
                  </Text>
                </HapticPressable>
              </View>

              <View style={styles.settingDivider} />

              {/* Show Y Labels */}
              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Y Axis Labels</Text>
                <HapticPressable
                  onPress={() => setChartSettings({ showYLabels: !chartSettings.showYLabels })}
                  style={[
                    styles.toggleButton,
                    chartSettings.showYLabels && styles.toggleButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      chartSettings.showYLabels && styles.toggleTextActive,
                    ]}
                  >
                    {chartSettings.showYLabels ? 'ON' : 'OFF'}
                  </Text>
                </HapticPressable>
              </View>

              <View style={styles.settingDivider} />

              {/* Show X Labels */}
              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>X Axis Labels</Text>
                <HapticPressable
                  onPress={() => setChartSettings({ showXLabels: !chartSettings.showXLabels })}
                  style={[
                    styles.toggleButton,
                    chartSettings.showXLabels && styles.toggleButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      chartSettings.showXLabels && styles.toggleTextActive,
                    ]}
                  >
                    {chartSettings.showXLabels ? 'ON' : 'OFF'}
                  </Text>
                </HapticPressable>
              </View>
            </Card>
          </>
        )}

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appName}>HugeLog</Text>
          <Text style={styles.version}>Version 1.0.0</Text>
        </View>
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
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statCard: {
    width: '48%',
    flexGrow: 1,
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
  menuItem: { marginTop: spacing.md },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  menuText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    flex: 1,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingLabel: {
    color: colors.text,
    fontSize: fontSize.md,
  },
  unitToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.sm,
    padding: 2,
  },
  unitButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm - 2,
  },
  unitButtonActive: {
    backgroundColor: colors.primary,
  },
  unitText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  unitTextActive: {
    color: colors.text,
  },
  settingDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    fontVariant: ['tabular-nums'],
    minWidth: 24,
    textAlign: 'center',
  },
  toggleButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceLight,
  },
  toggleButtonActive: {
    backgroundColor: colors.primaryMuted,
  },
  toggleText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  toggleTextActive: {
    color: colors.primary,
  },
  appInfo: {
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  appName: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  version: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
});
