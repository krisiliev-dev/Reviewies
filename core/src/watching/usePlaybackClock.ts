import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A manually-synced playback clock.
 *
 * Watching Mode deliberately does not depend on controlling your TV. Knowing the
 * timestamp is the only real requirement, and a "start now" button plus a nudge
 * control gets most of the way there on every device, today, with no bridge, no
 * browser extension and no microphone.
 *
 * Better sources slot in behind this same interface later: a browser extension
 * reading video.currentTime, a bridge observing a Cast session, or fingerprint
 * matching. Those change where `positionMs` comes from, not how the UI consumes it.
 */
export interface PlaybackClock {
  positionMs: number;
  running: boolean;
  start: (atMs?: number) => void;
  pause: () => void;
  toggle: () => void;
  /** Shift the clock. Negative means "I am behind what I thought". */
  nudge: (deltaMs: number) => void;
  /**
   * Recompute the position now rather than on the next tick.
   *
   * Called when the app returns to the foreground: a browser throttles timers in a
   * background tab and a phone suspends them outright, so the first thing a returning
   * user would otherwise see is a stale timecode. Each app wires its own source for
   * that (visibilitychange on the web, AppState on a phone), because the hook has no
   * business knowing which one it is running on.
   */
  resync: () => void;
  seek: (ms: number) => void;
  reset: () => void;
}

/**
 * Elapsed time that no correction can move.
 *
 * `Date.now()` is the wall clock, and the wall clock is allowed to jump — NTP catching
 * up, a manual correction, a phone crossing a timezone. This hook only ever measures a
 * *difference* from an anchor, so an offset cancels; a jump does not. Half an hour into
 * an episode, a two-minute correction would move the timecode two minutes and file
 * every reaction after it at the wrong moment.
 *
 * `performance.now()` is monotonic by definition and immune to all of it. Falling back
 * to `Date.now()` where it does not exist, which is no worse than what was here before.
 * §6.67.
 */
const elapsed = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

export function usePlaybackClock(tickMs = 250): PlaybackClock {
  const [running, setRunning] = useState(false);
  const [positionMs, setPositionMs] = useState(0);

  // Anchor point: wall-clock time when the current run began, and the media offset
  // at that moment. Deriving position from these rather than accumulating ticks
  // means the clock cannot drift if timers are throttled in a background tab.
  const anchorWall = useRef(0);
  const anchorMedia = useRef(0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setPositionMs(anchorMedia.current + (elapsed() - anchorWall.current));
    }, tickMs);
    return () => clearInterval(id);
  }, [running, tickMs]);


  const start = useCallback((atMs?: number) => {
    anchorMedia.current = atMs ?? 0;
    anchorWall.current = elapsed();
    setPositionMs(anchorMedia.current);
    setRunning(true);
  }, []);

  const pause = useCallback(() => {
    setRunning((was) => {
      if (was) {
        const now = anchorMedia.current + (elapsed() - anchorWall.current);
        anchorMedia.current = now;
        setPositionMs(now);
      }
      return false;
    });
  }, []);

  const seek = useCallback((ms: number) => {
    const clamped = Math.max(0, ms);
    anchorMedia.current = clamped;
    anchorWall.current = elapsed();
    setPositionMs(clamped);
  }, []);

  const nudge = useCallback((deltaMs: number) => {
    setPositionMs((current) => {
      const next = Math.max(0, current + deltaMs);
      anchorMedia.current = next;
      anchorWall.current = elapsed();
      return next;
    });
  }, []);

  const toggle = useCallback(() => {
    if (running) pause();
    else {
      anchorWall.current = elapsed();
      setRunning(true);
    }
  }, [running, pause]);

  const reset = useCallback(() => {
    anchorMedia.current = 0;
    anchorWall.current = elapsed();
    setPositionMs(0);
    setRunning(false);
  }, []);

  const resync = useCallback(() => {
    if (running) setPositionMs(anchorMedia.current + (elapsed() - anchorWall.current));
  }, [running]);

  return { positionMs, running, start, pause, toggle, nudge, seek, reset, resync };
}

export function formatTimecode(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
