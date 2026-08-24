import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { bindNativePlatform } from '../src/platform';
import { theme } from '../src/ui/theme';

/**
 * Nothing renders until the platform is bound.
 *
 * The core throws a clear error if its database is used before `setDatabase`, and a
 * screen that mounted early would hit that on its first read — a confusing failure a
 * long way from its cause. Gating here means the error can only be a real one.
 */
export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string>();

  useEffect(() => {
    bindNativePlatform().then(
      () => setReady(true),
      (error: unknown) => setFailed(error instanceof Error ? error.message : String(error)),
    );
  }, []);

  if (failed) {
    return (
      <View style={styles.centre}>
        <Text style={styles.title}>Reviewies could not start</Text>
        <Text style={styles.detail}>{failed}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.ink },
          headerTintColor: theme.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.ink },
        }}
      >
        {/* These two draw their own headings, so the navigator's would stack a second
            title above the first. */}
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="search" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.ink,
    padding: 24,
    gap: 8,
  },
  title: { color: theme.text, fontSize: 18, fontWeight: '600' },
  detail: { color: theme.muted, fontSize: 14, textAlign: 'center' },
});
