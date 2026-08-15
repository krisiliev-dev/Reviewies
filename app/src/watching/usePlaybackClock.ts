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
  seek: (ms: number) => void;
  reset: () => void;
}

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
      setPositionMs(anchorMedia.current + (Date.now() - anchorWall.current));
    }, tickMs);
    return () => clearInterval(id);
  }, [running, tickMs]);

  // Recompute immediately on returning to the tab, rather than waiting a tick.
  useEffect(() => {
    function onVisible() {
      if (running && document.visibilityState === 'visible') {
        setPositionMs(anchorMedia.current + (Date.now() - anchorWall.current));
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [running]);

  const start = useCallback((atMs?: number) => {
    anchorMedia.current = atMs ?? 0;
    anchorWall.current = Date.now();
    setPositionMs(anchorMedia.current);
    setRunning(true);
  }, []);

  const pause = useCallback(() => {
    setRunning((was) => {
      if (was) {
        const now = anchorMedia.current + (Date.now() - anchorWall.current);
        anchorMedia.current = now;
        setPositionMs(now);
      }
      return false;
    });
  }, []);

  const seek = useCallback((ms: number) => {
    const clamped = Math.max(0, ms);
    anchorMedia.current = clamped;
    anchorWall.current = Date.now();
    setPositionMs(clamped);
  }, []);

  const nudge = useCallback((deltaMs: number) => {
    setPositionMs((current) => {
      const next = Math.max(0, current + deltaMs);
      anchorMedia.current = next;
      anchorWall.current = Date.now();
      return next;
    });
  }, []);

  const toggle = useCallback(() => {
    if (running) pause();
    else {
      anchorWall.current = Date.now();
      setRunning(true);
    }
  }, [running, pause]);

  const reset = useCallback(() => {
    anchorMedia.current = 0;
    anchorWall.current = Date.now();
    setPositionMs(0);
    setRunning(false);
  }, []);

  return { positionMs, running, start, pause, toggle, nudge, seek, reset };
}

export function formatTimecode(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
