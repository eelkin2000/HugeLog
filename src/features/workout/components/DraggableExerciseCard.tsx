import { useRef } from 'react';
import { View, Text, StyleSheet, Animated as RNAnimated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  Swipeable,
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  Layout,
} from 'react-native-reanimated';
import { colors, spacing, fontSize, fontWeight, radius } from '@/ui/theme';
import { HapticPressable } from '@/ui/components/HapticPressable';

interface Props {
  index: number;
  total: number;
  title: string;
  subtitle?: string;
  /** When true, render a slim title-only row (used while any card in the list is being dragged). */
  collapsed: boolean;
  /** Approximate rendered height of a full (non-collapsed) card in px. Used to translate
   *  finger travel into a target index. Doesn't need to be exact — Layout.springify animates the shift. */
  fullCardHeight?: number;
  onDragStart: () => void;
  /** Called when drag is released, with the target index. Parent is responsible for:
   *   - clearing its "dragging" state (so cards un-collapse)
   *   - calling the actual reorder action if from !== to */
  onDragEnd: (from: number, to: number) => void;
  onDelete: () => void;
  children: React.ReactNode;
}

const COLLAPSED_ROW_HEIGHT = 56; // matches the collapsedCard minHeight + spacing

/**
 * A single exercise card that supports:
 *   - Long-press anywhere on the card to start dragging it up/down to reorder
 *   - Swipe left on the card to reveal a Delete action
 *
 * The parent owns a "currently dragging" index. While any card is being dragged,
 * all cards (including the dragged one) collapse to a slim title-only row via
 * the `collapsed` prop so the whole list is easy to see and rearrange.
 */
export function DraggableExerciseCard({
  index,
  total,
  title,
  subtitle,
  collapsed,
  fullCardHeight = 220,
  onDragStart,
  onDragEnd,
  onDelete,
  children,
}: Props) {
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const zIndex = useSharedValue(0);
  const elevation = useSharedValue(0);
  const swipeableRef = useRef<Swipeable>(null);

  // When collapsed everyone is the same short height — use that for index math.
  // When not collapsed the offset is less important (only the initiator uses it
  // before neighbours collapse), so the estimated full-card height is fine.
  const rowHeight = collapsed ? COLLAPSED_ROW_HEIGHT + spacing.sm : fullCardHeight;

  const pan = Gesture.Pan()
    .activateAfterLongPress(250)
    .onStart(() => {
      scale.value = withSpring(1.04, { damping: 15 });
      zIndex.value = 999;
      elevation.value = withTiming(16, { duration: 150 });
      runOnJS(onDragStart)();
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
    })
    .onUpdate((e) => {
      translateY.value = e.translationY;
    })
    .onEnd(() => {
      const offset = Math.round(translateY.value / rowHeight);
      const newIndex = Math.max(0, Math.min(total - 1, index + offset));
      translateY.value = withSpring(0, { damping: 18 });
      scale.value = withSpring(1, { damping: 15 });
      elevation.value = withTiming(0, { duration: 200 });
      zIndex.value = 0;
      runOnJS(onDragEnd)(index, newIndex);
    });

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    zIndex: zIndex.value,
    elevation: elevation.value,
    shadowOpacity: elevation.value / 32,
  }));

  const renderRightActions = (
    _progress: RNAnimated.AnimatedInterpolation<number>,
    dragX: RNAnimated.AnimatedInterpolation<number>
  ) => {
    const tx = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [0, 100],
      extrapolate: 'clamp',
    });
    return (
      <RNAnimated.View
        style={[styles.deleteAction, { transform: [{ translateX: tx }] }]}
      >
        <HapticPressable
          hapticType="heavy"
          onPress={() => {
            swipeableRef.current?.close();
            onDelete();
          }}
          style={styles.deleteInner}
        >
          <Ionicons name="trash-outline" size={22} color={colors.text} />
          <Text style={styles.deleteText}>Delete</Text>
        </HapticPressable>
      </RNAnimated.View>
    );
  };

  return (
    <Animated.View
      style={[styles.wrapper, animStyle]}
      layout={Layout.springify().damping(18)}
    >
      <Swipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        rightThreshold={40}
        overshootRight={false}
        friction={2}
        // Disable swipe-to-delete during drag mode so the gesture doesn't fight the reorder
        enabled={!collapsed}
      >
        <GestureDetector gesture={pan}>
          {collapsed ? (
            <View style={styles.collapsedCard}>
              <Ionicons
                name="reorder-three"
                size={20}
                color={colors.textMuted}
              />
              <View style={styles.collapsedTitleWrap}>
                <Text style={styles.collapsedTitle} numberOfLines={1}>
                  {title}
                </Text>
                {subtitle ? (
                  <Text style={styles.collapsedSubtitle} numberOfLines={1}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : (
            <View>{children}</View>
          )}
        </GestureDetector>
      </Swipeable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    marginBottom: spacing.sm,
  },
  collapsedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    minHeight: COLLAPSED_ROW_HEIGHT,
  },
  collapsedTitleWrap: {
    flex: 1,
  },
  collapsedTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  collapsedSubtitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 1,
  },
  deleteAction: {
    width: 96,
    justifyContent: 'center',
  },
  deleteInner: {
    flex: 1,
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  deleteText: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
});
