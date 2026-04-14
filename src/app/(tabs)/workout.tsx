import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fontWeight } from '@/ui/theme';
import { Button } from '@/ui/components/Button';
import { Card } from '@/ui/components/Card';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';

export default function WorkoutTab() {
  const router = useRouter();
  const isActive = useActiveWorkoutStore((s) => s.isActive);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Ionicons name="barbell" size={72} color={colors.primary} />
        <Text style={styles.title}>
          {isActive ? 'Workout in Progress' : 'Start a Workout'}
        </Text>
        <Text style={styles.subtitle}>
          {isActive
            ? 'You have an active workout session'
            : 'Begin an empty workout and add exercises as you go'}
        </Text>
        <Button
          title={isActive ? 'Resume Workout' : 'Start Empty Workout'}
          onPress={() => router.push('/workout/active')}
          size="lg"
          style={styles.button}
        />

        {!isActive && (
          <Card style={styles.tipCard} padding="md">
            <View style={styles.tipRow}>
              <Ionicons name="bulb-outline" size={18} color={colors.warning} />
              <Text style={styles.tipText}>
                Your previous weights and reps will be loaded automatically for each exercise
              </Text>
            </View>
          </Card>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 22,
  },
  button: {
    marginTop: spacing.xl,
    minWidth: 220,
  },
  tipCard: {
    marginTop: spacing.xl,
    maxWidth: 300,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  tipText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: 20,
    flex: 1,
  },
});
