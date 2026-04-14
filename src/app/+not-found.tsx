import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, fontSize, fontWeight } from '@/ui/theme';
import { Button } from '@/ui/components/Button';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Page Not Found</Text>
      <Button
        title="Go Home"
        onPress={() => router.replace('/')}
        style={styles.button}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.lg,
  },
  button: {},
});
