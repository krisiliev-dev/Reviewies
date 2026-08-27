import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { onFailure, reportFailure, type Failure } from '@reviewies/core/data/failure';
import { theme } from './theme';

/**
 * What a failure nobody caught looks like, on the phone.
 *
 * §6.35 said this could not be done — that React Native does not surface an unhandled
 * rejection the way a browser does and the hooks are runtime internals. That was too
 * pessimistic and breaking a screen on purpose is what showed it: an effect that rejects
 * left the phone with nothing on screen at all, which was worth a second look rather
 * than a caveat.
 *
 * React Native bundles `promise`, and its rejection tracking is that package's own
 * documented interface — React Native's own `promiseRejectionTrackingOptions` imports
 * the same `enable`. It is not an internal, and turning it on is what the development
 * red box already does. So the phone can hear them after all.
 *
 * Wrapped in a try/catch anyway. If a future React Native swaps its promise
 * implementation this quietly does nothing rather than taking the app down at startup,
 * which would be a poor trade for an error reporter.
 */
/**
 * Listen from the moment the bundle runs, not from when a component mounts.
 *
 * This was registered in an effect, and breaking a screen on purpose is what showed the
 * hole: the phone's root layout renders a spinner until the platform is bound, so the
 * banner is not in the tree yet — and a rejection during startup reached nothing at all.
 * The bus retains the last failure for a late subscriber, but only if something called
 * `reportFailure`, and the thing that calls it was the listener that did not exist yet.
 *
 * At module scope it is attached before any of the app has run, and the banner picks up
 * whatever happened from the retained value when it does mount.
 */
try {
  const tracking = require('promise/setimmediate/rejection-tracking') as {
    enable(options: { allRejections: boolean; onUnhandled(id: number, e: unknown): void }): void;
  };
  tracking.enable({ allRejections: true, onUnhandled: (_id, e) => reportFailure(e) });
} catch {
  // Nothing to hook. The error boundary still covers render failures.
}

{
  // The web export takes the browser's route, the same one the web app uses.
  const web = globalThis as {
    addEventListener?: (type: string, listener: (e: { reason?: unknown }) => void) => void;
  };
  web.addEventListener?.('unhandledrejection', (e) => reportFailure(e.reason));
}

export function FailureBanner() {
  const [failure, setFailure] = useState<Failure>();

  useEffect(() => onFailure(setFailure), []);

  useEffect(() => {
    try {
      const tracking = require('promise/setimmediate/rejection-tracking') as {
        enable(options: { allRejections: boolean; onUnhandled(id: number, e: unknown): void }): void;
      };
      tracking.enable({
        allRejections: true,
        onUnhandled: (_id, e) => reportFailure(e),
      });
    } catch {
      // Nothing to hook. The error boundary still covers render failures.
    }

    // The web export takes the browser's route, the same one the web app uses.
    const web = globalThis as {
      addEventListener?: (type: string, listener: (e: { reason?: unknown }) => void) => void;
      removeEventListener?: (type: string, listener: (e: { reason?: unknown }) => void) => void;
    };
    if (!web.addEventListener) return;
    const onRejection = (e: { reason?: unknown }) => reportFailure(e.reason);
    web.addEventListener('unhandledrejection', onRejection);
    return () => web.removeEventListener?.('unhandledrejection', onRejection);
  }, []);

  if (!failure) return null;

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.text}>
        Something went wrong: {failure.message}. Nothing you have done is lost — it is all
        on this device.
      </Text>
      <Pressable
        onPress={() => setFailure(undefined)}
        accessibilityRole="button"
        accessibilityLabel="Dismiss this message"
        hitSlop={8}
        style={styles.dismiss}
      >
        <Text style={styles.dismissText}>Dismiss</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: theme.groundRaised,
    borderBottomWidth: 1,
    borderBottomColor: theme.strokeHairline,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  text: { color: theme.ink, flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20 },
  dismiss: { minHeight: 24, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  dismissText: { color: theme.inkSecondary, fontSize: 13, textDecorationLine: 'underline' },
});
