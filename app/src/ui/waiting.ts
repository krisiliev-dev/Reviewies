import { useEffect, useState } from 'react';
import { SAY_WE_ARE_LOOKING } from '@reviewies/core/ui/waiting';

/**
 * Whether a wait has lasted long enough to be worth a word.
 *
 * `core/src/ui/waiting.ts` has the whole argument and the measurement — 9 of 24 web
 * interactions painting `COPY.waiting.loading` for 13–44ms, a word too brief to fixate.
 * This is the web half of the repair: a screen asks *am I still waiting*, and gets back
 * *and has it been long enough to say so*.
 *
 * ## Why a hook and not `Date.now()` at the render
 *
 * Because the answer has to arrive as a re-render. A screen that computed "has 200ms
 * passed" during render would be right at the moment it was asked and would never be asked
 * again — the query resolving is what re-renders it, and that is precisely the case where
 * the word must not appear. The timer is the thing that wakes the screen up to speak.
 *
 * ## The reset, which is the half that is easy to leave out
 *
 * The timer restarts every time `waiting` goes false → true, so a second wait on the same
 * mounted screen gets the same silence as the first. `Stats.tsx` is the case: changing the
 * period sets `summary` back to `undefined` on a screen that has been mounted for a minute,
 * and a latch that only ever ran once at mount would have the word painting instantly for
 * every window the person tries after the first — the exact flicker this exists to remove,
 * surviving in the one place a mount-time timer cannot see.
 */
export function useWaitedLongEnough(waiting: boolean): boolean {
  const [longEnough, setLongEnough] = useState(false);

  useEffect(() => {
    if (!waiting) {
      setLongEnough(false);
      return;
    }
    const timer = setTimeout(() => setLongEnough(true), SAY_WE_ARE_LOOKING);
    return () => clearTimeout(timer);
  }, [waiting]);

  /*
   * `waiting &&`, not `longEnough` alone. The state lags a render behind the prop on the
   * frame the wait ends, and returning a stale `true` there would paint the word for one
   * frame *after* the answer had arrived — which is the same defect this file removes,
   * moved to the other end of the interval.
   */
  return waiting && longEnough;
}
