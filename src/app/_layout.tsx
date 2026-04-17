import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { initDatabase } from '@/db/init';
import { seedExercises } from '@/db/seed/exercises';
import { seedMockWorkouts } from '@/db/seed/mockWorkouts';
import { colors } from '@/ui/theme';
import { NumericInputDoneBar } from '@/ui/components/NumericInput';

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      await initDatabase();
      await seedExercises();
      if (__DEV__) {
        await seedMockWorkouts();
      }
      setIsReady(true);
    }
    prepare();
  }, []);

  if (!isReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="workout/active"
          options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
        />
        <Stack.Screen name="workout/[id]" />
        <Stack.Screen name="exercise/[id]" />
        <Stack.Screen name="exercise/browse" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="exercise/create" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="program/[id]" />
        <Stack.Screen name="program/create" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="program/edit-day" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="analytics/index" />
      </Stack>
      <NumericInputDoneBar />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
