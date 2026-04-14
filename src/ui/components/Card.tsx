import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { colors, spacing, radius } from '@/ui/theme';

interface CardProps extends ViewProps {
  variant?: 'default' | 'elevated';
  padding?: keyof typeof spacing;
}

export function Card({
  variant = 'default',
  padding = 'md',
  style,
  children,
  ...props
}: CardProps) {
  return (
    <View
      style={[
        styles.base,
        { padding: spacing[padding] },
        variant === 'elevated' && styles.elevated,
        style as ViewStyle,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  elevated: {
    backgroundColor: colors.surfaceLight,
    borderColor: colors.borderLight,
  },
});
