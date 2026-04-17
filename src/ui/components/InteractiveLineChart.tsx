import { useState, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, {
  Path,
  Line as SvgLine,
  Circle,
  Defs,
  LinearGradient as SvgGradient,
  Stop,
  Rect,
  G,
  Text as SvgText,
} from 'react-native-svg';
import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withTiming,
} from 'react-native-reanimated';
import { colors, spacing, fontSize as fontSizes, fontWeight, radius } from '@/ui/theme';

// ─── Types ───────────────────────────────────────────────────────

export interface ChartDataPoint {
  date: string;
  label: string;
  value: number;
  workoutId?: string;
}

export interface ChartAxisConfig {
  yTickCount: number;    // number of Y axis divisions (default 5)
  xTickCount: number;    // max number of X axis labels (default 5)
  showGrid: boolean;     // show horizontal grid lines
  showXLabels: boolean;
  showYLabels: boolean;
}

const DEFAULT_AXIS: ChartAxisConfig = {
  yTickCount: 5,
  xTickCount: 5,
  showGrid: true,
  showXLabels: true,
  showYLabels: true,
};

interface InteractiveLineChartProps {
  data: ChartDataPoint[];
  color: string;
  unit: string;
  formatValue?: (v: number) => string;
  axisConfig?: Partial<ChartAxisConfig>;
  height?: number;
  onDataPointPress?: (workoutId: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────

function niceNum(range: number, round: boolean): number {
  const exp = Math.floor(Math.log10(range));
  const frac = range / Math.pow(10, exp);
  let nice: number;
  if (round) {
    if (frac < 1.5) nice = 1;
    else if (frac < 3) nice = 2;
    else if (frac < 7) nice = 5;
    else nice = 10;
  } else {
    if (frac <= 1) nice = 1;
    else if (frac <= 2) nice = 2;
    else if (frac <= 5) nice = 5;
    else nice = 10;
  }
  return nice * Math.pow(10, exp);
}

function niceScale(minVal: number, maxVal: number, tickCount: number) {
  if (minVal === maxVal) {
    const pad = minVal === 0 ? 10 : Math.abs(minVal) * 0.1;
    minVal -= pad;
    maxVal += pad;
  }
  const range = niceNum(maxVal - minVal, false);
  const tickSpacing = niceNum(range / (tickCount - 1), true);
  const niceMin = Math.floor(minVal / tickSpacing) * tickSpacing;
  const niceMax = Math.ceil(maxVal / tickSpacing) * tickSpacing;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + tickSpacing * 0.5; v += tickSpacing) {
    ticks.push(Math.round(v * 1000) / 1000);
  }
  return { min: niceMin, max: niceMax, ticks };
}

function buildLinePath(
  points: { x: number; y: number }[],
): string {
  if (points.length === 0) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

function buildAreaPath(
  points: { x: number; y: number }[],
  bottom: number,
): string {
  if (points.length === 0) return '';
  let d = `M ${points[0].x} ${bottom}`;
  d += ` L ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  d += ` L ${points[points.length - 1].x} ${bottom} Z`;
  return d;
}

// ─── Component ───────────────────────────────────────────────────

export function InteractiveLineChart({
  data,
  color,
  unit,
  formatValue,
  axisConfig: axisConfigProp,
  height = 220,
  onDataPointPress,
}: InteractiveLineChartProps) {
  const axis = { ...DEFAULT_AXIS, ...axisConfigProp };
  const [containerWidth, setContainerWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Ref tracks activeIndex reliably across gesture callbacks (avoids stale closure)
  const activeIndexRef = useRef<number | null>(null);

  // Gesture shared values
  const touchX = useSharedValue(0);
  const isPressed = useSharedValue(false);
  // Mirrors activeIndexRef for worklet access (refs aren't readable inside worklets)
  const activeIndexShared = useSharedValue<number | null>(null);
  // Whether a tooltip was visible at the START of the current pan gesture
  const wasTooltipActive = useSharedValue(false);

  // Layout
  const Y_LABEL_WIDTH = axis.showYLabels ? 48 : 0;
  const X_LABEL_HEIGHT = axis.showXLabels ? 20 : 0;
  const PADDING_TOP = 16;
  const PADDING_RIGHT = 12;

  const chartWidth = containerWidth - Y_LABEL_WIDTH - PADDING_RIGHT;
  const chartHeight = height - X_LABEL_HEIGHT - PADDING_TOP;
  const chartLeft = Y_LABEL_WIDTH;
  const chartTop = PADDING_TOP;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  // Filter valid data
  const validData = useMemo(() => data.filter((d) => d.value > 0), [data]);

  // Compute scales
  const { yScale, yTicks, points, xTicks } = useMemo(() => {
    if (validData.length < 2 || chartWidth <= 0)
      return { yScale: { min: 0, max: 1, ticks: [] }, yTicks: [], points: [], xTicks: [] };

    const values = validData.map((d) => d.value);
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const scale = niceScale(minV, maxV, axis.yTickCount);

    const pts = validData.map((d, i) => {
      const xFrac = i / (validData.length - 1);
      const yFrac = (d.value - scale.min) / (scale.max - scale.min);
      return {
        x: chartLeft + xFrac * chartWidth,
        y: chartTop + chartHeight - yFrac * chartHeight,
        dataIndex: i,
      };
    });

    // X axis labels — pick evenly spaced
    const xTickIndices: number[] = [];
    const xCount = Math.min(axis.xTickCount, validData.length);
    if (xCount >= 2) {
      for (let i = 0; i < xCount; i++) {
        xTickIndices.push(Math.round((i / (xCount - 1)) * (validData.length - 1)));
      }
    }
    const xT = xTickIndices.map((idx) => ({
      x: pts[idx].x,
      label: validData[idx].label,
    }));

    return { yScale: scale, yTicks: scale.ticks, points: pts, xTicks: xT };
  }, [validData, chartWidth, chartHeight, chartLeft, chartTop, axis.yTickCount, axis.xTickCount]);

  // Find closest point to touch X
  const findClosest = useCallback(
    (px: number) => {
      if (points.length === 0) return null;
      let closest = 0;
      let minDist = Infinity;
      for (let i = 0; i < points.length; i++) {
        const dist = Math.abs(points[i].x - px);
        if (dist < minDist) {
          minDist = dist;
          closest = i;
        }
      }
      return closest;
    },
    [points],
  );

  const updateActive = useCallback(
    (x: number) => {
      const idx = findClosest(x);
      activeIndexRef.current = idx;
      activeIndexShared.value = idx;
      setActiveIndex(idx);
    },
    [findClosest],
  );

  const clearActive = useCallback(() => {
    activeIndexRef.current = null;
    activeIndexShared.value = null;
    setActiveIndex(null);
  }, []);

  // Tap navigates only when the tooltip is already visible (user dragged to a point first).
  // Uses the ref (not state) to avoid stale closure from RNGH gesture callbacks.
  const handleTap = useCallback(() => {
    const idx = activeIndexRef.current;
    if (idx !== null) {
      const dataPoint = validData[idx];
      if (dataPoint?.workoutId && onDataPointPress) {
        onDataPointPress(dataPoint.workoutId);
      }
      activeIndexRef.current = null;
      setActiveIndex(null);
    }
    // No tooltip visible → do nothing
  }, [validData, onDataPointPress]);

  // Pan gesture: long press to activate, keep tooltip on release.
  // Also handles "slow tap" navigation: if the tooltip was already visible when
  // the user started pressing (wasTooltipActive) and they barely moved, treat it
  // as a navigate tap — covering the case where their click exceeds the 150ms
  // long-press threshold and the tap gesture loses the Race.
  const panGesture = Gesture.Pan()
    .activateAfterLongPress(150)
    .onStart((e) => {
      isPressed.value = true;
      touchX.value = e.x;
      // Capture whether tooltip was showing BEFORE this press began
      wasTooltipActive.value = activeIndexShared.value !== null;
      runOnJS(updateActive)(e.x);
    })
    .onUpdate((e) => {
      touchX.value = e.x;
      runOnJS(updateActive)(e.x);
    })
    .onEnd((e) => {
      isPressed.value = false;
      // If tooltip was showing when press started and the user didn't drag
      // (translationX < 20px), navigate — this is a "slow click" on the tooltip.
      if (wasTooltipActive.value && Math.abs(e.translationX) < 20) {
        runOnJS(handleTap)();
      }
      // Otherwise keep tooltip visible for a follow-up tap
    })
    .onFinalize(() => {
      isPressed.value = false;
      wasTooltipActive.value = false;
    });

  // Tap gesture: navigate if tooltip is showing
  const tapGesture = Gesture.Tap()
    .onEnd(() => {
      runOnJS(handleTap)();
    });

  // Race: quick tap wins; long press lets pan win
  const composed = Gesture.Race(tapGesture, panGesture);

  // Not enough data
  if (validData.length < 2) {
    return (
      <View style={[styles.chartContainer, { height }]} onLayout={onLayout}>
        <View style={styles.emptyChart}>
          <Text style={styles.emptyText}>
            Need at least 2 sessions to chart
          </Text>
        </View>
      </View>
    );
  }

  if (containerWidth === 0) {
    return <View style={[styles.chartContainer, { height }]} onLayout={onLayout} />;
  }

  const linePath = buildLinePath(points);
  const areaPath = buildAreaPath(points, chartTop + chartHeight);

  const activePoint =
    activeIndex !== null ? points[activeIndex] : null;
  const activeData =
    activeIndex !== null ? validData[activeIndex] : null;

  const fmtVal = (v: number) =>
    formatValue ? formatValue(v) : `${Math.round(v)} ${unit}`;

  const fmtYLabel = (v: number) => {
    if (formatValue) return formatValue(v);
    if (Math.abs(v) >= 10000) return `${(v / 1000).toFixed(0)}k`;
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
    return `${Math.round(v)}`;
  };

  return (
    <View style={[styles.chartContainer, { height }]} onLayout={onLayout}>
      <GestureDetector gesture={composed}>
        <Animated.View style={{ width: '100%', height: '100%' }}>
          <Svg width={containerWidth} height={height}>
            <Defs>
              <SvgGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity="0.25" />
                <Stop offset="1" stopColor={color} stopOpacity="0.02" />
              </SvgGradient>
            </Defs>

            {/* Y axis labels + horizontal grid */}
            {yTicks.map((tick, i) => {
              const yFrac =
                (tick - (yTicks[0] ?? 0)) /
                ((yTicks[yTicks.length - 1] ?? 1) - (yTicks[0] ?? 0) || 1);
              const y = chartTop + chartHeight - yFrac * chartHeight;

              return (
                <G key={`yt-${i}`}>
                  {axis.showGrid && (
                    <SvgLine
                      x1={chartLeft}
                      y1={y}
                      x2={chartLeft + chartWidth}
                      y2={y}
                      stroke={colors.border}
                      strokeWidth={0.5}
                      strokeDasharray="4,4"
                    />
                  )}
                  {axis.showYLabels && (
                    <SvgText
                      x={Y_LABEL_WIDTH - 6}
                      y={y + 4}
                      fill={colors.textMuted}
                      fontSize={10}
                      textAnchor="end"
                    >
                      {fmtYLabel(tick)}
                    </SvgText>
                  )}
                </G>
              );
            })}

            {/* X axis labels */}
            {axis.showXLabels &&
              xTicks.map((tick, i) => (
                <SvgText
                  key={`xt-${i}`}
                  x={tick.x}
                  y={chartTop + chartHeight + 14}
                  fill={colors.textMuted}
                  fontSize={9}
                  textAnchor="middle"
                >
                  {tick.label}
                </SvgText>
              ))}

            {/* Area fill */}
            <Path d={areaPath} fill={`url(#grad-${color})`} />

            {/* Line */}
            <Path
              d={linePath}
              stroke={color}
              strokeWidth={2}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Active crosshair + dot */}
            {activePoint && (
              <>
                {/* Vertical line */}
                <SvgLine
                  x1={activePoint.x}
                  y1={chartTop}
                  x2={activePoint.x}
                  y2={chartTop + chartHeight}
                  stroke={colors.textMuted}
                  strokeWidth={1}
                  strokeDasharray="3,3"
                />
                {/* Horizontal line */}
                <SvgLine
                  x1={chartLeft}
                  y1={activePoint.y}
                  x2={chartLeft + chartWidth}
                  y2={activePoint.y}
                  stroke={colors.textMuted}
                  strokeWidth={0.5}
                  strokeDasharray="3,3"
                />
                {/* Outer glow */}
                <Circle
                  cx={activePoint.x}
                  cy={activePoint.y}
                  r={8}
                  fill={color}
                  opacity={0.2}
                />
                {/* Dot */}
                <Circle
                  cx={activePoint.x}
                  cy={activePoint.y}
                  r={5}
                  fill={color}
                  stroke={colors.surface}
                  strokeWidth={2}
                />
              </>
            )}
          </Svg>

          {/* Tooltip */}
          {activePoint && activeData && (
            <View
              style={[
                styles.tooltip,
                {
                  left: Math.min(
                    Math.max(activePoint.x - 60, 4),
                    containerWidth - 124,
                  ),
                  top: Math.max(activePoint.y - 52, 0),
                },
              ]}
              pointerEvents="none"
            >
              <Text style={styles.tooltipValue}>{fmtVal(activeData.value)}</Text>
              <Text style={styles.tooltipDate}>{activeData.label}</Text>
            </View>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  chartContainer: {
    position: 'relative',
  },
  emptyChart: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    textAlign: 'center',
  },
  tooltip: {
    position: 'absolute',
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: 80,
    alignItems: 'center',
  },
  tooltipValue: {
    color: colors.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeight.bold,
    fontVariant: ['tabular-nums'],
  },
  tooltipDate: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    marginTop: 1,
  },
});
