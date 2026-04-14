import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, spacing, radius, fontSize, fontWeight } from '@/ui/theme';

type BadgeVariant = 'primary' | 'success' | 'warning' | 'danger' | 'muted';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
}

export function Badge({ label, variant = 'primary', style }: BadgeProps) {
  const variantStyle = variantStyles[variant];

  return (
    <View style={[styles.base, variantStyle, style]}>
      <Text style={[styles.text, { color: variantStyle.color }]}>{label}</Text>
    </View>
  );
}

const variantStyles: Record<BadgeVariant, ViewStyle & { color: string }> = {
  primary: {
    backgroundColor: colors.primaryMuted,
    color: colors.primaryLight,
  },
  success: {
    backgroundColor: colors.successMuted,
    color: colors.success,
  },
  warning: {
    backgroundColor: colors.warningMuted,
    color: colors.warning,
  },
  danger: {
    backgroundColor: colors.dangerMuted,
    color: colors.danger,
  },
  muted: {
    backgroundColor: colors.surfaceLight,
    color: colors.textSecondary,
  },
};

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
});
