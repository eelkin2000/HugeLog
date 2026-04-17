import { useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { generateId as uuid } from '@/utils/id';
import { colors, spacing, fontSize, fontWeight, radius } from '@/ui/theme';
import { Card } from '@/ui/components/Card';
import { Button } from '@/ui/components/Button';
import { HapticPressable } from '@/ui/components/HapticPressable';
import { MuscleMapSvg } from '@/ui/components/MuscleMapSvg';
import { db } from '@/db/client';
import { exercises } from '@/db/schema';
import {
  EXERCISE_CATEGORIES,
  CATEGORY_LABELS,
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
  type ExerciseCategory,
  type MuscleGroup,
} from '@/utils/constants';

export default function CreateExerciseScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ExerciseCategory | null>(null);
  const [primaryMuscle, setPrimaryMuscle] = useState<MuscleGroup | null>(null);
  const [secondaryMuscles, setSecondaryMuscles] = useState<MuscleGroup[]>([]);
  const [equipment, setEquipment] = useState('');
  const [instructions, setInstructions] = useState('');

  const toggleSecondary = (muscle: MuscleGroup) => {
    if (muscle === primaryMuscle) return; // Can't be both primary and secondary
    setSecondaryMuscles((prev) =>
      prev.includes(muscle)
        ? prev.filter((m) => m !== muscle)
        : [...prev, muscle]
    );
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter an exercise name');
      return;
    }
    if (!category) {
      Alert.alert('Error', 'Please select a category');
      return;
    }
    if (!primaryMuscle) {
      Alert.alert('Error', 'Please select a primary muscle group');
      return;
    }

    const id = uuid();
    await db.insert(exercises).values({
      id,
      name: name.trim(),
      category,
      primaryMuscle,
      secondaryMuscles:
        secondaryMuscles.length > 0
          ? JSON.stringify(secondaryMuscles)
          : null,
      equipment: equipment.trim() || null,
      instructions: instructions.trim() || null,
      isCustom: 1,
      isArchived: 0,
      createdAt: new Date().toISOString(),
    });

    router.back();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <HapticPressable onPress={() => router.back()}>
          <Ionicons name="close" size={28} color={colors.text} />
        </HapticPressable>
        <Text style={styles.headerTitle}>New Exercise</Text>
        <Button title="Save" onPress={handleSave} size="sm" />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Name */}
        <Text style={styles.label}>Exercise Name</Text>
        <TextInput
          style={styles.textInput}
          value={name}
          onChangeText={setName}
          placeholder="e.g., Incline Dumbbell Curl"
          placeholderTextColor={colors.textMuted}
          autoFocus
        />

        {/* Category */}
        <Text style={styles.label}>Category</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {EXERCISE_CATEGORIES.map((cat) => (
            <HapticPressable key={cat} onPress={() => setCategory(cat)}>
              <View
                style={[
                  styles.chip,
                  category === cat && styles.chipActive,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    category === cat && styles.chipTextActive,
                  ]}
                >
                  {CATEGORY_LABELS[cat]}
                </Text>
              </View>
            </HapticPressable>
          ))}
        </ScrollView>

        {/* Primary Muscle */}
        <Text style={styles.label}>Primary Muscle Group</Text>
        <View style={styles.chipWrap}>
          {MUSCLE_GROUPS.map((muscle) => (
            <HapticPressable
              key={muscle}
              onPress={() => {
                setPrimaryMuscle(muscle);
                // Remove from secondary if it was there
                setSecondaryMuscles((prev) =>
                  prev.filter((m) => m !== muscle)
                );
              }}
            >
              <View
                style={[
                  styles.chip,
                  primaryMuscle === muscle && styles.chipActive,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    primaryMuscle === muscle && styles.chipTextActive,
                  ]}
                >
                  {MUSCLE_GROUP_LABELS[muscle]}
                </Text>
              </View>
            </HapticPressable>
          ))}
        </View>

        {/* Secondary Muscles */}
        <Text style={styles.label}>Secondary Muscles (optional)</Text>
        <Text style={styles.hint}>Tap multiple to select</Text>
        <View style={styles.chipWrap}>
          {MUSCLE_GROUPS.filter((m) => m !== primaryMuscle).map((muscle) => (
            <HapticPressable
              key={muscle}
              onPress={() => toggleSecondary(muscle)}
            >
              <View
                style={[
                  styles.chip,
                  secondaryMuscles.includes(muscle) && styles.chipSecondary,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    secondaryMuscles.includes(muscle) &&
                      styles.chipTextSecondary,
                  ]}
                >
                  {MUSCLE_GROUP_LABELS[muscle]}
                </Text>
              </View>
            </HapticPressable>
          ))}
        </View>

        {/* Muscle Map Preview */}
        {primaryMuscle && (
          <Card style={styles.previewCard} padding="md">
            <Text style={styles.previewTitle}>Muscle Activation</Text>
            <MuscleMapSvg
              primaryMuscles={primaryMuscle ? [primaryMuscle] : []}
              secondaryMuscles={secondaryMuscles}
              width={280}
              height={200}
            />
          </Card>
        )}

        {/* Equipment */}
        <Text style={styles.label}>Equipment (optional)</Text>
        <TextInput
          style={styles.textInput}
          value={equipment}
          onChangeText={setEquipment}
          placeholder="e.g., dumbbells, incline bench"
          placeholderTextColor={colors.textMuted}
        />

        {/* Instructions */}
        <Text style={styles.label}>Instructions (optional)</Text>
        <TextInput
          style={[styles.textInput, styles.multilineInput]}
          value={instructions}
          onChangeText={setInstructions}
          placeholder="Describe proper form and technique..."
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={4}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  label: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  hint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginBottom: spacing.xs,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: fontSize.md,
  },
  multilineInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  chipRow: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  chipTextActive: {
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  chipSecondary: {
    backgroundColor: colors.secondaryMuted,
    borderColor: colors.secondary,
  },
  chipTextSecondary: {
    color: colors.secondary,
    fontWeight: fontWeight.semibold,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  previewCard: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  previewTitle: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
    alignSelf: 'flex-start',
  },
});
