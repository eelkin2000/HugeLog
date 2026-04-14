import { Pressable, type PressableProps } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface HapticPressableProps extends PressableProps {
  hapticType?: 'light' | 'medium' | 'heavy';
  scaleOnPress?: boolean;
}

export function HapticPressable({
  hapticType = 'light',
  scaleOnPress = true,
  onPressIn,
  onPressOut,
  onPress,
  style,
  ...props
}: HapticPressableProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const hapticMap = {
    light: Haptics.ImpactFeedbackStyle.Light,
    medium: Haptics.ImpactFeedbackStyle.Medium,
    heavy: Haptics.ImpactFeedbackStyle.Heavy,
  };

  return (
    <AnimatedPressable
      onPressIn={(e) => {
        if (scaleOnPress) scale.value = withSpring(0.97, { damping: 15 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (scaleOnPress) scale.value = withSpring(1, { damping: 15 });
        onPressOut?.(e);
      }}
      onPress={(e) => {
        Haptics.impactAsync(hapticMap[hapticType]);
        onPress?.(e);
      }}
      style={[animatedStyle, style as any]}
      {...props}
    />
  );
}
