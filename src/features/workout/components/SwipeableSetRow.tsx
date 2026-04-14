import { useRef } from 'react';
import { View, Text, StyleSheet, Animated as RNAnimated } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors, spacing, fontSize, fontWeight, radius } from '@/ui/theme';
import { HapticPressable } from '@/ui/components/HapticPressable';
import { NumericInput } from '@/ui/components/NumericInput';
import type { SetType, WeightUnit } from '@/utils/constants';

const SET_TYPE_COLORS: Record<SetType, string> = {
  warmup: colors.warning,
  working: colors.textSecondary,
  dropset: colors.secondary,
  failure: colors.danger,
};

const SET_TYPE_LABELS: Record<SetType, string> = {
  warmup: 'W',
  working: '',
  dropset: 'D',
  failure: 'F',
};

const SET_TYPE_ORDER: SetType[] = ['working', 'warmup', 'dropset', 'failure'];

interface SwipeableSetRowProps {
  setNumber: number;
  type: SetType;
  weight: number | null;
  reps: number | null;
  isCompleted: boolean;
  isPersonalRecord: boolean;
  previousWeight?: number | null;
  previousReps?: number | null;
  unit: WeightUnit;
  onUpdateWeight: (value: number | null) => void;
  onUpdateReps: (value: number | null) => void;
  onComplete: () => void;
  onDelete: () => void;
  onChangeType: (type: SetType) => void;
}

export function SwipeableSetRow({
  setNumber,
  type,
  weight,
  reps,
  isCompleted,
  isPersonalRecord,
  previousWeight,
  previousReps,
  unit,
  onUpdateWeight,
  onUpdateReps,
  onComplete,
  onDelete,
  onChangeType,
}: SwipeableSetRowProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleComplete = () => {
    if (!isCompleted) {
      // Bounce animation on complete
      scale.value = withSequence(
        withSpring(1.03, { damping: 8, stiffness: 400 }),
        withSpring(1, { damping: 15 })
      );
    }
    onComplete();
  };

  const handleCycleType = () => {
    const currentIdx = SET_TYPE_ORDER.indexOf(type);
    const nextIdx = (currentIdx + 1) % SET_TYPE_ORDER.length;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChangeType(SET_TYPE_ORDER[nextIdx]);
  };

  const renderRightActions = (
    _progress: RNAnimated.AnimatedInterpolation<number>,
    dragX: RNAnimated.AnimatedInterpolation<number>
  ) => {
    const translateX = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [0, 80],
      extrapolate: 'clamp',
    });

    return (
      <RNAnimated.View
        style={[styles.deleteAction, { transform: [{ translateX }] }]}
      >
        <HapticPressable
          hapticType="heavy"
          onPress={() => {
            swipeableRef.current?.close();
            onDelete();
          }}
          style={styles.deleteButton}
        >
          <Ionicons name="trash-outline" size={20} color={colors.text} />
          <Text style={styles.deleteText}>Delete</Text>
        </HapticPressable>
      </RNAnimated.View>
    );
  };

  const typeLabel = SET_TYPE_LABELS[type] || String(setNumber);
  const typeColor = SET_TYPE_COLORS[type];

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootRight={false}
      friction={2}
    >
      <Animated.View
        style={[
          styles.row,
          isCompleted && styles.rowCompleted,
          isPersonalRecord && styles.rowPR,
          animatedStyle,
        ]}
      >
        {/* Set Number / Type */}
        <HapticPressable
          onPress={handleCycleType}
          style={styles.setNumberContainer}
          scaleOnPress={false}
        >
          <Text style={[styles.setNumber, { color: typeColor }]}>
            {type === 'working' ? String(setNumber) : typeLabel}
          </Text>
        </HapticPressable>

        {/* Previous values (ghost text) */}
        <View style={styles.previousContainer}>
          {previousWeight != null && previousReps != null && !isCompleted ? (
            <Text style={styles.previousText}>
              {previousWeight}x{previousReps}
            </Text>
          ) : null}
        </View>

        {/* Weight Input */}
        <View style={styles.inputContainer}>
          <NumericInput
            value={weight}
            onChangeValue={onUpdateWeight}
            step={5}
            placeholder={previousWeight != null ? String(previousWeight) : '0'}
          />
        </View>

        {/* Reps Input */}
        <View style={styles.inputContainer}>
          <NumericInput
            value={reps}
            onChangeValue={onUpdateReps}
            step={1}
            min={0}
            max={999}
            placeholder={previousReps != null ? String(previousReps) : '0'}
          />
        </View>

        {/* Complete Button */}
        <HapticPressable
          onPress={handleComplete}
          hapticType={isCompleted ? 'light' : 'medium'}
          style={[
            styles.checkButton,
            isCompleted && styles.checkButtonCompleted,
            isPersonalRecord && styles.checkButtonPR,
          ]}
          scaleOnPress={false}
        >
          {isPersonalRecord ? (
            <Ionicons name="trophy" size={16} color={colors.textInverse} />
          ) : (
            <Ionicons
              name="checkmark"
              size={18}
              color={isCompleted ? colors.textInverse : colors.textMuted}
            />
          )}
        </HapticPressable>
      </Animated.View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 6,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.sm,
    marginBottom: 2,
    backgroundColor: colors.surface,
  },
  rowCompleted: {
    backgroundColor: colors.successMuted,
  },
  rowPR: {
    backgroundColor: 'rgba(255, 183, 77, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 183, 77, 0.3)',
  },
  setNumberContainer: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.surfaceLight,
  },
  setNumber: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  previousContainer: {
    width: 50,
    alignItems: 'center',
  },
  previousText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontVariant: ['tabular-nums'],
  },
  inputContainer: {
    flex: 1,
  },
  checkButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkButtonCompleted: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  checkButtonPR: {
    backgroundColor: colors.warning,
    borderColor: colors.warning,
  },
  deleteAction: {
    justifyContent: 'center',
    width: 80,
  },
  deleteButton: {
    flex: 1,
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.sm,
    marginLeft: spacing.xs,
    marginBottom: 2,
  },
  deleteText: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    marginTop: 2,
  },
});
