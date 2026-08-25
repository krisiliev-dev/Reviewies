import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the person using this has asked the system for less movement.
 *
 * `AccessibilityInfo` is the cross-platform answer — iOS Reduce Motion, Android
 * "Remove animations" — and react-native-web implements it on top of the same
 * `prefers-reduced-motion` media query the web app reads, so one call covers all
 * three. Worth stating because the obvious guess is that the web build would need
 * its own path, and it does not.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (!cancelled) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return reduced;
}
