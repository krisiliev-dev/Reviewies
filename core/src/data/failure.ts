/**
 * Somewhere for a failure nobody caught to go.
 *
 * §6.33 and §6.34 went through every place the core answers a failure with emptiness
 * and made the ones that matter say which kind of empty they are. This is the other
 * half: what happens to a failure that nothing was expecting at all.
 *
 * Before this there was no answer. Neither app had an error boundary or a global
 * rejection handler, so a thrown error in any component took the entire React tree
 * down to a blank page with nothing on it, and an unhandled promise rejection went
 * nowhere at all — a button that appears to do nothing, or a spinner that never stops.
 *
 * A bus rather than a wrapper at every call site. There are fifty-odd places where a
 * screen starts async work without catching, most of them calling into core functions
 * that cannot reject; wrapping all of them would be a large diff to make a rare failure
 * visible, and it would still miss the next one. One place that hears everything nobody
 * else did is smaller and catches more.
 */

export interface Failure {
  message: string;
  /** Roughly when, so a screen can ignore one it has already shown. */
  at: number;
}

const listeners = new Set<(failure: Failure) => void>();

/**
 * The most recent failure, kept for whoever subscribes next.
 *
 * Found by breaking a screen on first load: `componentDidCatch` fires during the commit
 * that renders the boundary's fallback, and the banner's `useEffect` has not run yet, so
 * the report went to an empty listener set and vanished. The boundary showed its own
 * message and nothing was lost that time — but the same ordering would drop any failure
 * during startup, when there is no boundary to cover for it.
 */
let last: Failure | undefined;

/**
 * Say that something failed and nothing handled it.
 *
 * Deliberately not a logger. The point is that a person finds out, which is the whole
 * standard the importer set — anything it cannot read is listed rather than dropped.
 */
export function reportFailure(error: unknown): void {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Something went wrong';

  const failure: Failure = { message, at: Date.now() };
  last = failure;
  for (const listener of listeners) listener(failure);
}

export function onFailure(fn: (failure: Failure) => void): () => void {
  listeners.add(fn);
  // Anything that failed before there was anybody to tell.
  if (last) fn(last);
  return () => listeners.delete(fn);
}

/** Mainly for tests, which must not leak a listener into the next case. */
export function resetFailures(): void {
  listeners.clear();
  last = undefined;
}
