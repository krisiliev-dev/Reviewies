import { useEffect, useState } from 'react';
import { SAY_WE_ARE_LOOKING } from '@reviewies/core/ui/waiting';

/**
 * Whether a wait has lasted long enough to be worth a word — the phone's copy.
 *
 * `core/src/ui/waiting.ts` owns the threshold and the argument; `app/src/ui/waiting.ts` is
 * the same twenty lines for the web. Two files rather than one because the hook is
 * `react` and nothing else, and this repository's rule is that `@reviewies/core` holds no
 * React: the *number* is shared, which is the part that could drift, and the four lines of
 * `useState` and `setTimeout` around it are not.
 *
 * ## What is measured here and what is not
 *
 * `design/between.mjs` prints its own caveat and it applies to this file. It counted the
 * flicker on the **web** — nine of twenty-four interactions, 13–44ms each — and its
 * `--phone` mode reads a `react-native-web` export, so a pixel or a colour taken there is a
 * fact about that renderer rather than about a device. The one channel that does cross is
 * the count of distinct painted states, because that is produced by the component tree and
 * by `useLive`, which are the same JavaScript on both. So: this is applied here on the
 * strength of the shared source rather than of a phone measurement, and no number in this
 * comment is claimed for a device.
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

  /* `waiting &&` for the reason the web's copy gives: the state lags the prop by a render
   * on the frame the wait ends, and a stale `true` there paints the word after the answer. */
  return waiting && longEnough;
}
