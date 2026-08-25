import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { requestSync, startSyncDriver } from '@reviewies/core/sync/driver';
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

  /**
   * Sync, which this app has never done.
   *
   * Nothing in here imported the engine: you could sign in, read "an account adds sync
   * across devices" on the account screen, and never have a single row leave the phone.
   * The driver runs for the app rather than for a screen, so it does not matter where
   * somebody is when they mark an episode watched.
   *
   * After the platform is bound, because the driver reads the outbox and the database
   * is not there yet.
   */
  useEffect(() => {
    if (!ready) return;
    const stop = startSyncDriver();
    // Coming back to the app is the moment a queue built on a train is most likely to
    // move, and a phone suspends timers outright while it is backgrounded.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void requestSync();
    });
    return () => {
      stop();
      subscription.remove();
    };
  }, [ready]);

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
        {/* The tab group draws its own chrome. */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
