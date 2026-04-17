import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, fontSize as fontSizes, fontWeight, radius } from '@/ui/theme';
import { HapticPressable } from './HapticPressable';
import { InteractiveLineChart, type ChartDataPoint, type ChartAxisConfig } from './InteractiveLineChart';

export type ProgressionDataPoint = ChartDataPoint;

interface ProgressionChartProps {
  title: string;
  data: ProgressionDataPoint[];
  unit: string;
  color?: string;
  formatValue?: (v: number) => string;
  axisConfig?: Partial<ChartAxisConfig>;
  onDataPointPress?: (workoutId: string) => void;
}

export function ProgressionChart({
  title,
  data,
  unit,
  color = colors.primary,
  formatValue,
  axisConfig,
  onDataPointPress,
}: ProgressionChartProps) {
  const validData = data.filter((d) => d.value > 0);

  // Compute header stats from valid data
  const hasEnough = validData.length >= 2;
  const latest = hasEnough ? validData[validData.length - 1] : null;
  const first = hasEnough ? validData[0] : null;
  const diff = latest && first ? latest.value - first.value : 0;
  const pct = first && first.value > 0 ? (diff / first.value) * 100 : 0;
  const displayValue =
    latest
      ? formatValue
        ? formatValue(latest.value)
        : `${Math.round(latest.value)} ${unit}`
      : '--';

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.statsRow}>
          <Text style={styles.latestValue}>{displayValue}</Text>
          {diff !== 0 && (
            <Text
              style={[
                styles.change,
                { color: diff > 0 ? colors.success : colors.danger },
              ]}
            >
              {diff > 0 ? '+' : ''}
              {Math.round(pct)}%
            </Text>
          )}
        </View>
      </View>

      <InteractiveLineChart
        data={data}
        color={color}
        unit={unit}
        formatValue={formatValue}
        axisConfig={axisConfig}
        height={220}
        onDataPointPress={onDataPointPress}
      />
    </View>
  );
}

type TimeRange = '30d' | '90d' | 'all';

interface ProgressionChartGroupProps {
  weightData: ProgressionDataPoint[];
  e1rmData: ProgressionDataPoint[];
  volumeData: ProgressionDataPoint[];
  unit: string;
  axisConfig?: Partial<ChartAxisConfig>;
  onDataPointPress?: (workoutId: string) => void;
}

export function ProgressionChartGroup({
  weightData,
  e1rmData,
  volumeData,
  unit,
  axisConfig,
  onDataPointPress,
}: ProgressionChartGroupProps) {
  const [range, setRange] = useState<TimeRange>('90d');

  const filterByRange = (data: ProgressionDataPoint[]) => {
    if (range === 'all') return data;
    const now = new Date();
    const days = range === '30d' ? 30 : 90;
    const cutoff = new Date(now.getTime() - days * 86400000);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    return data.filter((d) => d.date >= cutoffStr);
  };

  const filteredWeight = filterByRange(weightData);
  const filteredE1rm = filterByRange(e1rmData);
  const filteredVolume = filterByRange(volumeData);

  const formatVolume = (v: number) => {
    if (v >= 10000) return `${(v / 1000).toFixed(1)}k`;
    return `${Math.round(v)}`;
  };

  return (
    <View>
      {/* Time range picker */}
      <View style={styles.rangePicker}>
        {(['30d', '90d', 'all'] as TimeRange[]).map((r) => (
          <HapticPressable
            key={r}
            onPress={() => setRange(r)}
            style={[
              styles.rangeButton,
              range === r && styles.rangeButtonActive,
            ]}
          >
            <Text
              style={[
                styles.rangeLabel,
                range === r && styles.rangeLabelActive,
              ]}
            >
              {r === 'all' ? 'All' : r === '30d' ? '30D' : '90D'}
            </Text>
          </HapticPressable>
        ))}
      </View>

      <ProgressionChart
        title="Best Weight"
        data={filteredWeight}
        unit={unit}
        color={colors.primary}
        axisConfig={axisConfig}
        onDataPointPress={onDataPointPress}
      />
      <ProgressionChart
        title="Estimated 1RM"
        data={filteredE1rm}
        unit={unit}
        color={colors.secondary}
        axisConfig={axisConfig}
        onDataPointPress={onDataPointPress}
      />
      <ProgressionChart
        title="Session Volume"
        data={filteredVolume}
        unit={unit}
        color={colors.success}
        formatValue={formatVolume}
        axisConfig={axisConfig}
        onDataPointPress={onDataPointPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeight.medium,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  latestValue: {
    color: colors.text,
    fontSize: fontSizes.md,
    fontWeight: fontWeight.bold,
    fontVariant: ['tabular-nums'],
  },
  change: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums'],
  },
  rangePicker: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 2,
    marginBottom: spacing.md,
    alignSelf: 'center',
  },
  rangeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm - 2,
  },
  rangeButtonActive: {
    backgroundColor: colors.primaryMuted,
  },
  rangeLabel: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    fontWeight: fontWeight.medium,
  },
  rangeLabelActive: {
    color: colors.primary,
  },
});
