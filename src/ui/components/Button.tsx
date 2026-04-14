import { StyleSheet, Text, ActivityIndicator, type ViewStyle } from 'react-native';
import { colors, spacing, radius, fontSize, fontWeight } from '@/ui/theme';
import { HapticPressable } from './HapticPressable';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
}: ButtonProps) {
  const variantStyles = variants[variant];
  const sizeStyles = sizes[size];

  return (
    <HapticPressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.base,
        variantStyles.container,
        sizeStyles.container,
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variantStyles.textColor}
        />
      ) : (
        <Text
          style={[
            styles.text,
            { color: variantStyles.textColor },
            sizeStyles.text,
          ]}
        >
          {title}
        </Text>
      )}
    </HapticPressable>
  );
}

const variants = {
  primary: {
    container: { backgroundColor: colors.primary } as ViewStyle,
    textColor: colors.text,
  },
  secondary: {
    container: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.primary,
    } as ViewStyle,
    textColor: colors.primary,
  },
  ghost: {
    container: { backgroundColor: 'transparent' } as ViewStyle,
    textColor: colors.textSecondary,
  },
  danger: {
    container: { backgroundColor: colors.danger } as ViewStyle,
    textColor: colors.text,
  },
};

const sizes = {
  sm: {
    container: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    } as ViewStyle,
    text: { fontSize: fontSize.sm },
  },
  md: {
    container: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm + 2,
    } as ViewStyle,
    text: { fontSize: fontSize.md },
  },
  lg: {
    container: {
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
    } as ViewStyle,
    text: { fontSize: fontSize.lg },
  },
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  text: {
    fontWeight: fontWeight.semibold,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
});
