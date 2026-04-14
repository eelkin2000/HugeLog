import { useRef } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  Text,
  type ViewStyle,
} from 'react-native';
import { colors, spacing, radius, fontSize, fontWeight } from '@/ui/theme';
import { HapticPressable } from './HapticPressable';

interface NumericInputProps {
  value: number | null;
  onChangeValue: (val: number | null) => void;
  placeholder?: string;
  suffix?: string;
  step?: number;
  min?: number;
  max?: number;
  compact?: boolean;
  style?: ViewStyle;
}

export function NumericInput({
  value,
  onChangeValue,
  placeholder = '0',
  suffix,
  step = 5,
  min = 0,
  max = 9999,
  compact = false,
  style,
}: NumericInputProps) {
  const inputRef = useRef<TextInput>(null);

  const handleTextChange = (text: string) => {
    if (text === '') {
      onChangeValue(null);
      return;
    }
    const cleaned = text.replace(/[^0-9.]/g, '');
    const num = parseFloat(cleaned);
    if (!isNaN(num) && num >= min && num <= max) {
      onChangeValue(num);
    }
  };

  const increment = () => {
    const current = value ?? 0;
    const next = Math.min(current + step, max);
    onChangeValue(next);
  };

  const decrement = () => {
    const current = value ?? 0;
    const next = Math.max(current - step, min);
    onChangeValue(next);
  };

  if (compact) {
    return (
      <HapticPressable
        onPress={() => inputRef.current?.focus()}
        scaleOnPress={false}
        style={[styles.compactContainer, style]}
      >
        <TextInput
          ref={inputRef}
          style={styles.compactInput}
          value={value != null ? String(value) : ''}
          onChangeText={handleTextChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          selectTextOnFocus
        />
      </HapticPressable>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <HapticPressable onPress={decrement} style={styles.stepButton}>
        <Text style={styles.stepText}>-</Text>
      </HapticPressable>

      <View style={styles.inputWrapper}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={value != null ? String(value) : ''}
          onChangeText={handleTextChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          selectTextOnFocus
        />
        {suffix && <Text style={styles.suffix}>{suffix}</Text>}
      </View>

      <HapticPressable onPress={increment} style={styles.stepButton}>
        <Text style={styles.stepText}>+</Text>
      </HapticPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Standard
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepButton: {
    width: 32,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    color: colors.primary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
    minWidth: 36,
    fontVariant: ['tabular-nums'],
    padding: 0,
  },
  suffix: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginLeft: 2,
  },

  // Compact
  compactContainer: {
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  compactInput: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    padding: 0,
    width: '100%',
  },
});
