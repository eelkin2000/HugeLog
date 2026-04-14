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
import { NumericInput } from '@/ui/components/NumericInput';
import { db } from '@/db/client';
import { programs } from '@/db/schema';

export default function CreateProgramScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [numWeeks, setNumWeeks] = useState<number | null>(4);
  const [daysPerWeek, setDaysPerWeek] = useState<number | null>(4);
  const [difficulty, setDifficulty] = useState<string>('intermediate');

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a program name');
      return;
    }
    if (!numWeeks || !daysPerWeek) {
      Alert.alert('Error', 'Please set weeks and days per week');
      return;
    }

    const id = uuid();
    await db.insert(programs).values({
      id,
      name: name.trim(),
      description: description.trim() || null,
      numWeeks,
      daysPerWeek,
      difficulty,
      isBuiltIn: 0,
      createdAt: new Date().toISOString(),
    });

    router.replace(`/program/${id}`);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <HapticPressable onPress={() => router.back()}>
          <Ionicons name="close" size={28} color={colors.text} />
        </HapticPressable>
        <Text style={styles.headerTitle}>Create Program</Text>
        <Button title="Save" onPress={handleCreate} size="sm" />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Name */}
        <Text style={styles.label}>Program Name</Text>
        <TextInput
          style={styles.textInput}
          value={name}
          onChangeText={setName}
          placeholder="e.g., My PPL Split"
          placeholderTextColor={colors.textMuted}
        />

        {/* Description */}
        <Text style={styles.label}>Description (optional)</Text>
        <TextInput
          style={[styles.textInput, styles.multilineInput]}
          value={description}
          onChangeText={setDescription}
          placeholder="Describe your program..."
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={3}
        />

        {/* Duration */}
        <Text style={styles.label}>Number of Weeks</Text>
        <NumericInput
          value={numWeeks}
          onChangeValue={setNumWeeks}
          step={1}
          min={1}
          max={52}
          style={styles.numericInput}
        />

        <Text style={styles.label}>Days Per Week</Text>
        <NumericInput
          value={daysPerWeek}
          onChangeValue={setDaysPerWeek}
          step={1}
          min={1}
          max={7}
          style={styles.numericInput}
        />

        {/* Difficulty */}
        <Text style={styles.label}>Difficulty</Text>
        <View style={styles.difficultyRow}>
          {['beginner', 'intermediate', 'advanced'].map((d) => (
            <HapticPressable
              key={d}
              onPress={() => setDifficulty(d)}
            >
              <View
                style={[
                  styles.difficultyChip,
                  difficulty === d && styles.difficultyChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.difficultyText,
                    difficulty === d && styles.difficultyTextActive,
                  ]}
                >
                  {d}
                </Text>
              </View>
            </HapticPressable>
          ))}
        </View>

        <Card style={styles.infoCard} padding="md">
          <Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} />
          <Text style={styles.infoText}>
            After creating the program, you can add exercises to each day from the program detail screen.
          </Text>
        </Card>
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
    minHeight: 80,
    textAlignVertical: 'top',
  },
  numericInput: {
    alignSelf: 'flex-start',
    minWidth: 160,
  },
  difficultyRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  difficultyChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  difficultyChipActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  difficultyText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    textTransform: 'capitalize',
  },
  difficultyTextActive: {
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  infoCard: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  infoText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: 20,
    flex: 1,
  },
});
