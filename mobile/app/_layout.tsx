import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { requestSync, startSyncDriver } from '@reviewies/core/sync/driver';
import { startCalendarRefresh } from '@reviewies/core/calendar/refresh';
import { bindNativePlatform } from '../src/platform';
import { border, radius, theme } from '../src/ui/theme';
import { breakInEffect, breakOnRender } from '../src/ui/breakScreen';
import { FailureBanner } from '../src/ui/FailureBanner';
import { reportFailure } from '@reviewies/core/data/failure';
import type { ErrorBoundaryProps } from 'expo-router';

/**
 * Keep one broken screen from taking the app with it.
 *
 * expo-router uses a component exported under this name as the boundary for everything
 * below it, so exporting it from the root layout covers the whole app. There was none,
 * on either platform — a thrown error in any component took the tree down to a blank
 * screen with nothing on it, on an app whose premise is that your history is safe here.
 *
 * `retry` is expo-router's: it remounts the subtree, which is the right offer because
 * most of what lands here is one screen's load rather than a broken app.
 *
 * It is not the only offer, and that took looking at it to notice. This boundary is at
 * the root layout, so it replaces the navigation along with the screen — where the web's
 * sits inside the tab bar and leaves it standing. A screen that throws every time makes
 * "Try again" a loop with no way out of it, so there is a way home as well.
 *
 * What this does *not* cover, said plainly rather than left to look handled: an
 * unhandled promise rejection on a device. React Native's promise implementation does
 * not surface those the way a browser's `unhandledrejection` does, and the ways to hook
 * it are internal to the runtime and change between versions. The web export gets them
 * through the same listener the web app uses; a device does not.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  reportFailure(error);
  return (
    <View style={styles.centre}>
      <Text style={styles.title}>This screen stopped</Text>
      <Text style={styles.detail}>
        Something on it went wrong. Everything you have tracked is still here — it lives
        on this device and nothing was lost.
      </Text>
      <Pressable style={styles.retry} accessibilityRole="button" onPress={() => void retry()}>
        <Text style={styles.retryText}>Try again</Text>
      </Pressable>
      <Pressable
        style={styles.retryQuiet}
        accessibilityRole="button"
        onPress={() => router.replace('/')}
      >
        <Text style={styles.retryQuietText}>Go to Up Next</Text>
      </Pressable>
    </View>
  );
}

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
  // The break harness, at the root so it reaches every route rather than the two
  // somebody remembered to try. Does nothing without the query parameter.
  breakOnRender('the phone');
  useEffect(() => breakInEffect('the phone'), []);

  useEffect(() => {
    if (!ready) return;
    const stop = startSyncDriver();
    // Same reason as sync: this belongs to the app, not to whichever screen was open.
    const stopRefresh = startCalendarRefresh();
    // Coming back to the app is the moment a queue built on a train is most likely to
    // move, and a phone suspends timers outright while it is backgrounded.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void requestSync();
    });
    return () => {
      stop();
      stopRefresh();
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
        <ActivityIndicator color={theme.workingFill} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <FailureBanner />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.ground },
          headerTintColor: theme.ink,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.ground },
        }}
      >
        {/* The tab group draws its own chrome. */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  retry: {
    marginTop: 16,
    backgroundColor: theme.actionFill,
    borderRadius: radius.pill,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  retryText: { color: theme.actionLabel, fontWeight: '700', fontSize: 15 },
  retryQuiet: {
    marginTop: 12,
    borderWidth: border.hairline, borderColor: theme.strokeSignal, backgroundColor: 'transparent',
    borderRadius: radius.pill,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  retryQuietText: { color: theme.ink, fontWeight: '600', fontSize: 15 },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.ground,
    padding: 24,
    gap: 8,
  },
  title: { color: theme.ink, fontSize: 18, fontWeight: '600' },
  detail: { color: theme.inkSecondary, fontSize: 14, textAlign: 'center' },
});
