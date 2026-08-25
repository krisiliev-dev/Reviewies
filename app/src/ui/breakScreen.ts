/**
 * A way to break a screen on purpose.
 *
 * The error boundaries of §6.35 were each checked on one screen, and doing that to a
 * phone screen is what found that its boundary strands you with no navigation. Reading
 * the code would not have shown it. So this makes breaking a screen repeatable rather
 * than a hand edit per route: `?break=render` throws during render, `?break=effect`
 * throws from an effect, which a boundary does not catch at all.
 *
 * It ships. Not because a person will ever type it, but because a harness that only
 * exists while somebody is testing has to be re-added every time — and the last two
 * things found here were found by pointing it at a screen nobody had pointed it at.
 * Nothing happens without the parameter, which is a query string on your own device.
 */
export type BreakKind = 'render' | 'effect';

export function breakRequested(): BreakKind | undefined {
  const value =
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('break');
  return value === 'render' || value === 'effect' ? value : undefined;
}

/**
 * Throw where a boundary can see it.
 *
 * Called during render, so React unwinds to the nearest boundary — which is the case
 * the boundary exists for.
 */
export function breakOnRender(screen: string): void {
  if (breakRequested() === 'render') {
    throw new Error(`${screen} was broken on purpose (?break=render)`);
  }
}

/**
 * Throw where a boundary cannot.
 *
 * An error thrown from an effect, or from a promise an effect started, does not reach a
 * boundary — React has already finished rendering. It becomes an unhandled rejection,
 * which is the other half of what §6.35 built and the half nothing had tested.
 */
export function breakInEffect(screen: string): void {
  if (breakRequested() === 'effect') {
    void Promise.reject(new Error(`${screen} was broken on purpose (?break=effect)`));
  }
}
