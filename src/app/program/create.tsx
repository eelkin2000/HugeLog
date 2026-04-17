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
import { db } from '@/db/client';
import { programs, programDays } from '@/db/schema';

interface WorkoutDay {
  id: string;
  name: string;
}

export default function CreateProgramScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [days, setDays] = useState<WorkoutDay[]>([
    { id: uuid(), name: 'Day 1' },
  ]);

  const addDay = () => {
    setDays((prev) => [
      ...prev,
      { id: uuid(), name: `Day ${prev.length + 1}` },
    ]);
  };

  const removeDay = (id: string) => {
    if (days.length <= 1) {
      Alert.alert('Error', 'A program needs at least one workout day');
      return;
    }
    setDays((prev) => prev.filter((d) => d.id !== id));
  };

  const updateDayName = (id: string, newName: string) => {
    setDays((prev) =>
      prev.map((d) => (d.id === id ? { ...d, name: newName } : d))
    );
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a program name');
      return;
    }

    const hasEmptyDay = days.some((d) => !d.name.trim());
    if (hasEmptyDay) {
      Alert.alert('Error', 'All workout days need a name');
      return;
    }

    const programId = uuid();
    await db.insert(programs).values({
      id: programId,
      name: name.trim(),
      description: description.trim() || null,
      numWeeks: 1,
      daysPerWeek: days.length,
      difficulty: null,
      isBuiltIn: 0,
      createdAt: new Date().toISOString(),
    });

    // Create program days
    for (let i = 0; i < days.length; i++) {
      await db.insert(programDays).values({
        id: days[i].id,
        programId,
        weekNumber: 1,
        dayNumber: i + 1,
        name: days[i].name.trim(),
      });
    }

    router.replace(`/program/${programId}`);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <HapticPressable onPress={() => router.back()}>
          <Ionicons name="close" size={28} color={colors.text} />
        </HapticPressable>
        <Text style={styles.headerTitle}>New Program</Text>
        <Button title="Create" onPress={handleCreate} size="sm" />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Name */}
        <Text style={styles.label}>Program Name</Text>
        <TextInput
          style={styles.textInput}
          value={name}
          onChangeText={setName}
          placeholder="e.g., Push Pull Legs"
          placeholderTextColor={colors.textMuted}
          autoFocus
        />

        {/* Description */}
        <Text style={styles.label}>Description (optional)</Text>
        <TextInput
          style={[styles.textInput, styles.multilineInput]}
          value={description}
          onChangeText={setDescription}
          placeholder="What's this program about?"
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={2}
        />

        {/* Workout Days */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Workout Days</Text>
          <Text style={styles.sectionSubtitle}>
            Define the days in your rotation
          </Text>
        </View>

        {days.map((day, index) => (
          <Card key={day.id} style={styles.dayCard} padding="sm">
            <View style={styles.dayRow}>
              <View style={styles.dayNumber}>
                <Text style={styles.dayNumberText}>{index + 1}</Text>
              </View>
              <TextInput
                style={styles.dayNameInput}
                value={day.name}
                onChangeText={(text) => updateDayName(day.id, text)}
                placeholder="Day name..."
                placeholderTextColor={colors.textMuted}
              />
              {days.length > 1 && (
                <HapticPressable onPress={() => removeDay(day.id)}>
                  <Ionicons
                    name="trash-outline"
                    size={20}
                    color={colors.danger}
                  />
                </HapticPressable>
              )}
            </View>
          </Card>
        ))}

        <HapticPressable onPress={addDay}>
          <View style={styles.addDayButton}>
            <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
            <Text style={styles.addDayText}>Add Workout Day</Text>
          </View>
        </HapticPressable>

        <Card style={styles.infoCard} padding="md">
          <Ionicons
            name="information-circle-outline"
            size={20}
            color={colors.textSecondary}
          />
          <Text style={styles.infoText}>
            After creating the program, you'll be able to add exercises to each
            workout day.
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
    minHeight: 60,
    textAlignVertical: 'top',
  },
  sectionHeader: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  sectionSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  dayCard: {
    marginBottom: spacing.sm,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dayNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumberText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  dayNameInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    paddingVertical: spacing.xs,
  },
  addDayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderStyle: 'dashed',
    marginTop: spacing.xs,
  },
  addDayText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
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
