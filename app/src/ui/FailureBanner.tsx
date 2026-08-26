import { useEffect, useState } from 'react';
import { onFailure, reportFailure, type Failure } from '@reviewies/core/data/failure';
import { COPY } from '@reviewies/core/copy';

/**
 * What a failure nobody caught looks like.
 *
 * The app had no answer for one. A thrown render error took the whole tree to a blank
 * page; an unhandled rejection went nowhere, leaving a spinner that never stops or a
 * button that appears to do nothing. Both are now a sentence at the top of the screen.
 *
 * Dismissible, and it does not block anything. Most of what arrives here is survivable —
 * one screen's load failed and the rest of the app is fine — so it says what happened
 * and gets out of the way rather than taking over.
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
if (typeof window !== 'undefined') {
  // The two ways a failure escapes everything, both of which were silent.
  window.addEventListener('unhandledrejection', (e) => reportFailure(e.reason));
  window.addEventListener('error', (e) => reportFailure(e.error ?? e.message));
}

export function FailureBanner() {
  const [failure, setFailure] = useState<Failure>();

  useEffect(() => onFailure(setFailure), []);

  if (!failure) return null;

  /**
   * One failure has an answer, and it is not "dismiss".
   *
   * A tab left open across a deployment cannot load the files its build was made of, and
   * the only thing that fixes it is a reload. Saying "something went wrong" and offering
   * nothing would be the §6.50 mistake — a screen that knows what you should do next and
   * makes you work it out. §6.65.
   */
  const stale = failure.message === COPY.app.updated;

  return (
    <div
      role="alert"
      className="safe-top fixed inset-x-0 top-0 z-50 flex items-start gap-3 border-b border-edge bg-surface px-4 py-3"
    >
      <p className="min-w-0 flex-1 text-sm">
        {stale ? (
          COPY.app.updated
        ) : (
          <>
            Something went wrong: {failure.message}. Nothing you have done is lost — it is
            all on this device.
          </>
        )}
      </p>
      {stale && (
        <button
          onClick={() => window.location.reload()}
          className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-ink"
        >
          {COPY.app.reload}
        </button>
      )}
      <button
        onClick={() => setFailure(undefined)}
        aria-label="Dismiss this message"
        className="min-h-[24px] shrink-0 rounded-lg px-2 text-sm text-muted underline"
      >
        Dismiss
      </button>
    </div>
  );
}
