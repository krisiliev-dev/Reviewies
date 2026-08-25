import { useEffect, useState } from 'react';
import { onFailure, reportFailure, type Failure } from '@reviewies/core/data/failure';

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
export function FailureBanner() {
  const [failure, setFailure] = useState<Failure>();

  useEffect(() => onFailure(setFailure), []);

  // The two ways a failure escapes everything, both of which were silent.
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => reportFailure(e.reason);
    const onError = (e: ErrorEvent) => reportFailure(e.error ?? e.message);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError);
    };
  }, []);

  if (!failure) return null;

  return (
    <div
      role="alert"
      className="safe-top fixed inset-x-0 top-0 z-50 flex items-start gap-3 border-b border-edge bg-surface px-4 py-3"
    >
      <p className="min-w-0 flex-1 text-sm">
        Something went wrong: {failure.message}. Nothing you have done is lost — it is all
        on this device.
      </p>
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
