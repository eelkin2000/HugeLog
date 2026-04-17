import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';
import { colors, spacing, fontSize, fontWeight } from '@/ui/theme';

/**
 * Simplified anatomical muscle map — front and back views.
 * Each muscle region is a Path keyed to the app's MuscleGroup type.
 * Primary muscles render in colors.primary, secondary in colors.primaryMuted.
 *
 * Path data inspired by open-source body-highlighter projects (MIT).
 * Simplified for mobile rendering clarity.
 */

interface MuscleMapProps {
  primaryMuscles: string[];
  secondaryMuscles?: string[];
  width?: number;
  height?: number;
  showLabels?: boolean;
}

// ---------- path definitions (viewBox 0 0 200 400 per side) ----------

// FRONT VIEW muscle paths — muscular proportions
const FRONT_MUSCLES: Record<string, string> = {
  // Chest - wide, thick pecs
  chest: 'M68,92 Q76,84 92,82 L100,82 Q100,110 86,118 Q74,114 68,104 Z M132,92 Q124,84 108,82 L100,82 Q100,110 114,118 Q126,114 132,104 Z',
  // Front delts - capped shoulders
  front_delts: 'M62,78 Q56,86 54,100 Q56,106 62,102 Q66,92 68,92 Q70,84 68,80 Z M138,78 Q144,86 146,100 Q144,106 138,102 Q134,92 132,92 Q130,84 132,80 Z',
  // Side delts (big shoulder caps)
  side_delts: 'M54,72 Q48,78 46,88 Q48,96 52,100 Q54,92 56,84 Q58,76 62,78 Q58,72 54,72 Z M146,72 Q152,78 154,88 Q152,96 148,100 Q146,92 144,84 Q142,76 138,78 Q142,72 146,72 Z',
  // Biceps - full peaks
  biceps: 'M56,106 Q50,118 48,134 Q50,140 56,138 Q62,128 64,116 Q62,108 56,106 Z M144,106 Q150,118 152,134 Q150,140 144,138 Q138,128 136,116 Q138,108 144,106 Z',
  // Forearms - thick
  forearms: 'M48,142 Q44,156 42,174 Q44,180 50,178 Q54,164 56,150 Q56,144 52,140 Z M152,142 Q156,156 158,174 Q156,180 150,178 Q146,164 144,150 Q144,144 148,140 Z',
  // Abs - defined six-pack
  abs: 'M86,120 Q84,134 84,158 Q86,174 90,184 L100,186 L110,184 Q114,174 116,158 Q116,134 114,120 Q110,116 100,114 Q90,116 86,120 Z',
  // Obliques - wide
  obliques: 'M74,122 Q72,138 72,158 Q74,174 78,184 L86,186 Q84,170 84,152 Q84,134 86,120 Q82,118 74,122 Z M126,122 Q128,138 128,158 Q126,174 122,184 L114,186 Q116,170 116,152 Q116,134 114,120 Q118,118 126,122 Z',
  // Quads - massive
  quads: 'M78,202 Q72,222 70,248 Q70,268 76,286 Q82,292 90,288 Q96,274 98,254 Q98,234 96,214 Q94,204 88,198 Z M122,202 Q128,222 130,248 Q130,268 124,286 Q118,292 110,288 Q104,274 102,254 Q102,234 104,214 Q106,204 112,198 Z',
  // Hip flexors
  hip_flexors: 'M86,186 Q90,192 94,200 Q98,202 100,202 Q102,202 106,200 Q110,192 114,186 L110,184 Q106,188 100,190 Q94,188 90,184 Z',
  // Adductors
  adductors: 'M96,214 Q98,226 98,246 Q98,256 100,266 L102,266 Q104,256 104,246 Q104,226 106,214 Q104,206 100,202 Q96,206 96,214 Z',
  // Calves - diamond shaped
  calves: 'M76,296 Q72,314 72,334 Q74,350 80,356 Q86,354 90,344 Q90,328 88,314 Q86,300 82,292 Z M124,296 Q128,314 128,334 Q126,350 120,356 Q114,354 110,344 Q110,328 112,314 Q114,300 118,292 Z',
  // Traps (front, thick neck)
  traps: 'M84,64 Q90,68 96,70 L100,70 L104,70 Q110,68 116,64 Q112,58 106,56 L100,54 L94,56 Q88,58 84,64 Z',
};

// BACK VIEW muscle paths — muscular proportions
const BACK_MUSCLES: Record<string, string> = {
  // Upper back (rhomboids, mid-traps) - thick
  upper_back: 'M74,88 Q82,82 92,80 L100,80 L108,80 Q118,82 126,88 Q124,100 118,110 Q112,114 100,114 Q88,114 82,110 Q76,100 74,88 Z',
  // Lats - wide V-taper
  lats: 'M68,98 Q62,112 60,130 Q62,150 68,160 Q76,166 84,162 Q88,150 88,136 Q88,122 86,112 Q80,104 74,98 Z M132,98 Q138,112 140,130 Q138,150 132,160 Q124,166 116,162 Q112,150 112,136 Q112,122 114,112 Q120,104 126,98 Z',
  // Rear delts - rounded caps
  rear_delts: 'M54,74 Q50,82 50,94 Q52,102 58,100 Q64,92 66,84 Q64,76 58,74 Z M146,74 Q150,82 150,94 Q148,102 142,100 Q136,92 134,84 Q136,76 142,74 Z',
  // Traps (back view - big trapezius)
  traps: 'M84,56 Q76,62 70,72 Q64,80 62,88 Q68,92 74,88 Q82,82 92,80 L100,80 L108,80 Q118,82 126,88 Q132,92 138,88 Q136,80 130,72 Q124,62 116,56 Q110,52 100,50 Q90,52 84,56 Z',
  // Triceps - horseshoe shape
  triceps: 'M56,104 Q50,116 48,132 Q50,140 56,138 Q62,128 64,116 Q64,108 58,104 Z M144,104 Q150,116 152,132 Q150,140 144,138 Q138,128 136,116 Q136,108 142,104 Z',
  // Lower back (erectors) - thick columns
  lower_back: 'M86,116 Q84,132 84,154 Q86,166 90,174 L100,176 L110,174 Q114,166 116,154 Q116,132 114,116 Q110,114 100,114 Q90,114 86,116 Z',
  // Glutes - full
  glutes: 'M74,182 Q70,194 70,208 Q72,218 80,222 Q90,224 98,216 Q100,208 100,200 Q98,188 94,182 Q86,178 74,182 Z M126,182 Q130,194 130,208 Q128,218 120,222 Q110,224 102,216 Q100,208 100,200 Q102,188 106,182 Q114,178 126,182 Z',
  // Hamstrings - thick
  hamstrings: 'M76,228 Q70,248 70,268 Q72,286 78,294 Q86,298 92,292 Q96,278 96,258 Q96,242 94,228 Q90,222 82,226 Z M124,228 Q130,248 130,268 Q128,286 122,294 Q114,298 108,292 Q104,278 104,258 Q104,242 106,228 Q110,222 118,226 Z',
  // Calves (back - big diamond)
  calves: 'M76,300 Q70,316 70,336 Q72,352 78,358 Q86,360 92,352 Q94,340 94,324 Q92,310 88,300 Q84,296 76,300 Z M124,300 Q130,316 130,336 Q128,352 122,358 Q114,360 108,352 Q106,340 106,324 Q108,310 112,300 Q116,296 124,300 Z',
};

// Map muscle group names to which view they appear in (some in both)
const FRONT_MUSCLE_KEYS = new Set([
  'chest', 'front_delts', 'side_delts', 'biceps', 'forearms', 'abs',
  'obliques', 'quads', 'hip_flexors', 'adductors', 'calves', 'traps',
]);

const BACK_MUSCLE_KEYS = new Set([
  'upper_back', 'lats', 'rear_delts', 'traps', 'triceps', 'lower_back',
  'glutes', 'hamstrings', 'calves',
]);

// Body outline paths — muscular/bodybuilder silhouette
const FRONT_BODY_OUTLINE =
  'M100,12 Q88,12 83,18 Q78,26 78,38 L78,48 Q80,56 84,64 Q72,66 60,72 Q48,76 44,86 Q40,96 38,110 Q36,126 38,142 Q40,154 44,166 Q46,174 50,176 L50,172 Q44,154 44,138 Q44,122 48,108 Q52,98 58,92 Q62,98 64,108 Q66,118 68,130 Q70,142 72,155 Q72,164 70,174 Q68,182 68,190 Q72,196 78,200 Q70,224 68,250 Q68,272 70,292 Q68,314 68,342 Q70,358 76,370 Q82,378 88,380 L88,374 Q82,364 80,352 Q78,336 78,318 Q80,298 82,286 Q88,296 96,304 Q98,318 98,342 Q98,358 96,372 L96,378 Q98,380 100,380 Q102,380 104,378 L104,372 Q102,358 102,342 Q102,318 104,304 Q112,296 118,286 Q120,298 122,318 Q122,336 120,352 Q118,364 112,374 L112,380 Q118,378 124,370 Q130,358 132,342 Q132,314 130,292 Q132,272 132,250 Q130,224 122,200 Q128,196 132,190 Q132,182 130,174 Q128,164 128,155 Q130,142 132,130 Q134,118 136,108 Q138,98 142,92 Q148,98 152,108 Q156,122 156,138 Q156,154 150,172 L150,176 Q154,174 156,166 Q160,154 162,142 Q164,126 162,110 Q160,96 156,86 Q152,76 140,72 Q128,66 116,64 Q120,56 122,48 L122,38 Q122,26 117,18 Q112,12 100,12 Z';

const BACK_BODY_OUTLINE =
  'M100,10 Q88,10 83,16 Q78,24 78,36 L78,46 Q80,54 84,62 Q72,64 60,70 Q48,74 44,84 Q40,94 38,108 Q36,124 38,140 Q40,152 44,164 Q46,172 50,174 L50,170 Q44,152 44,136 Q44,120 48,106 Q52,96 58,90 Q62,96 64,106 Q66,116 68,128 Q70,140 72,153 Q72,162 70,172 Q68,180 68,188 Q72,194 78,198 Q70,222 68,248 Q68,270 70,290 Q68,312 68,340 Q70,356 76,368 Q82,376 88,378 L88,372 Q82,362 80,350 Q78,334 78,316 Q80,296 82,284 Q88,294 96,302 Q98,316 98,340 Q98,356 96,370 L96,376 Q98,378 100,378 Q102,378 104,376 L104,370 Q102,356 102,340 Q102,316 104,302 Q112,294 118,284 Q120,296 122,316 Q122,334 120,350 Q118,362 112,372 L112,378 Q118,376 124,368 Q130,356 132,340 Q132,312 130,290 Q132,270 132,248 Q130,222 122,198 Q128,194 132,188 Q132,180 130,172 Q128,162 128,153 Q130,140 132,128 Q134,116 136,106 Q138,96 142,90 Q148,96 152,106 Q156,120 156,136 Q156,152 150,170 L150,174 Q154,172 156,164 Q160,152 162,140 Q164,124 162,108 Q160,94 156,84 Q152,74 140,70 Q128,64 116,62 Q120,54 122,46 L122,36 Q122,24 117,16 Q112,10 100,10 Z';

function getMuscleColor(
  muscle: string,
  primarySet: Set<string>,
  secondarySet: Set<string>
): string {
  if (primarySet.has(muscle)) return colors.primary;
  if (secondarySet.has(muscle)) return colors.primaryMuted;
  return colors.surfaceLight;
}

export function MuscleMapSvg({
  primaryMuscles,
  secondaryMuscles = [],
  width = 280,
  height = 240,
  showLabels = true,
}: MuscleMapProps) {
  const primarySet = new Set(primaryMuscles);
  const secondarySet = new Set(secondaryMuscles);

  const svgWidth = width / 2 - 4;
  const svgHeight = height;

  return (
    <View style={styles.container}>
      {showLabels && (
        <View style={styles.labelRow}>
          <Text style={styles.viewLabel}>Front</Text>
          <Text style={styles.viewLabel}>Back</Text>
        </View>
      )}
      <View style={styles.mapRow}>
        {/* Front view */}
        <Svg
          width={svgWidth}
          height={svgHeight}
          viewBox="0 0 200 400"
        >
          {/* Body outline */}
          <Path
            d={FRONT_BODY_OUTLINE}
            fill={colors.surface}
            stroke={colors.border}
            strokeWidth={1.5}
          />
          {/* Muscle regions */}
          <G>
            {Object.entries(FRONT_MUSCLES).map(([muscle, path]) => (
              <Path
                key={muscle}
                d={path}
                fill={getMuscleColor(muscle, primarySet, secondarySet)}
                stroke={
                  primarySet.has(muscle) || secondarySet.has(muscle)
                    ? colors.primaryLight
                    : colors.border
                }
                strokeWidth={primarySet.has(muscle) ? 1.5 : 0.5}
                opacity={
                  primarySet.has(muscle) ? 1 : secondarySet.has(muscle) ? 0.8 : 0.4
                }
              />
            ))}
          </G>
        </Svg>

        {/* Back view */}
        <Svg
          width={svgWidth}
          height={svgHeight}
          viewBox="0 0 200 400"
        >
          <Path
            d={BACK_BODY_OUTLINE}
            fill={colors.surface}
            stroke={colors.border}
            strokeWidth={1.5}
          />
          <G>
            {Object.entries(BACK_MUSCLES).map(([muscle, path]) => (
              <Path
                key={muscle}
                d={path}
                fill={getMuscleColor(muscle, primarySet, secondarySet)}
                stroke={
                  primarySet.has(muscle) || secondarySet.has(muscle)
                    ? colors.primaryLight
                    : colors.border
                }
                strokeWidth={primarySet.has(muscle) ? 1.5 : 0.5}
                opacity={
                  primarySet.has(muscle) ? 1 : secondarySet.has(muscle) ? 0.8 : 0.4
                }
              />
            ))}
          </G>
        </Svg>
      </View>

      {/* Legend */}
      {showLabels && (primaryMuscles.length > 0 || secondaryMuscles.length > 0) && (
        <View style={styles.legend}>
          {primaryMuscles.length > 0 && (
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
              <Text style={styles.legendText}>Primary</Text>
            </View>
          )}
          {secondaryMuscles.length > 0 && (
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.primaryMuted }]} />
              <Text style={styles.legendText}>Secondary</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: spacing.xs,
  },
  viewLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  mapRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
  },
});
