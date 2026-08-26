import { useEffect, useRef, useState } from 'react';
import type { Reaction } from '@reviewies/core/domain/types';
import { useReducedMotion } from '../ui/useReducedMotion';
import { ANNOUNCE_EVERY_MS, summarise } from '@reviewies/core/watching/announce';
import { REACTION_VISIBLE_MS } from '@reviewies/core/watching/reactions';

const LANES = 4;
/**
 * The traverse, derived from how long a reaction should be readable.
 *
 * The keyframe below covers 120vw — in from 100vw, out to -20vw — of which 100vw is on
 * screen, so a reaction is visible for five sixths of the traverse. Seven seconds here
 * meant nearly six seconds on screen against the phone's four, which was two platforms
 * answering the same question differently rather than a decision anybody made.
 */
const TRAVEL_MS = Math.round(REACTION_VISIBLE_MS * 1.2);

interface Flying {
  key: string;
  emoji: string;
  lane: number;
  mine: boolean;
}

/**
 * Reactions drifting right-to-left across the top of the screen, in the danmaku
 * convention established by Niconico and Bilibili.
 *
 * These are replayed from history rather than requiring a live audience. That is the
 * difference between a feature that works and a dead screen: if you watch an episode
 * at 2am alone, you still see everything everyone else left at that moment, and old
 * shows feel as alive as new ones.
 */
export function ReactionStream({
  reactions,
  positionMs,
  density = 1,
  paused = false,
}: {
  reactions: Reaction[];
  positionMs: number;
  /** 0.25–1. Bilibili's lesson is that unfiltered bullet comments become unreadable. */
  density?: number;
  /**
   * Stops the stream where it stands, without stopping the clock.
   *
   * WCAG 2.2.2 asks for a way to pause anything that moves by itself for more than
   * five seconds, and this moves for the length of an episode. Density thins it; only
   * this stops it. It is deliberately not the clock's pause — you can want the
   * timecode to keep running and the top of the screen to hold still.
   */
  paused?: boolean;
}) {
  const reduced = useReducedMotion();
  const [flying, setFlying] = useState<Flying[]>([]);
  const lastPos = useRef(0);
  const lane = useRef(0);
  const seq = useRef(0);

  /**
   * What this says out loud, which is moments rather than reactions.
   *
   * The container used to be the live region, so every emoji that drifted past was
   * announced — twenty-four a minute at the default density, on a screen somebody is
   * holding while watching television. Now a burst is collected and summarised once,
   * and between moments it says nothing.
   */
  const [announcement, setAnnouncement] = useState('');
  const pending = useRef<string[]>([]);
  const spokeAt = useRef(0);

  useEffect(() => {
    const from = lastPos.current;
    const to = positionMs;
    lastPos.current = to;

    // Seeking backwards, or a jump large enough to be a seek rather than playback,
    // should not dump a whole episode's reactions on screen at once.
    if (to < from || to - from > 5000) return;
    if (paused) return;

    // Not anything of yours that has already flown on its own account, or the same
    // reaction crosses the screen twice.
    const due = reactions.filter(
      (r) => r.tMs > from && r.tMs <= to && !ownFlown.current.has(r.id),
    );
    if (due.length === 0) return;

    const shown = density >= 1 ? due : due.filter(() => Math.random() < density);
    if (shown.length === 0) return;

    pending.current.push(...shown.map((r) => r.emoji));

    setFlying((current) => [
      ...current,
      ...shown.map((r) => {
        lane.current = (lane.current + 1) % LANES;
        return {
          key: `${r.id}-${seq.current++}`,
          emoji: r.emoji,
          lane: lane.current,
          mine: r.mine,
        };
      }),
    ]);
  }, [positionMs, reactions, density, paused]);

  /**
   * Your own reaction, immediately.
   *
   * The window above is `(last tick, now]`, and a reaction you have just left is stamped
   * at exactly `now` — so by the next tick the window has moved past it and it never
   * flies. Tapping an emoji stored a reaction and changed nothing on screen, which is
   * indistinguishable from a tap that missed, in the feature the product is built
   * around. Doc 10 §3.
   *
   * Not subject to density and not skipped while held: thinning the crowd is about other
   * people, and holding the stream still is about the drift. Yours is the one thing you
   * asked for.
   */
  const ownFlown = useRef(new Set<string>());
  const primed = useRef(false);
  useEffect(() => {
    // Everything already there when this screen opened is history, not something you
    // just did. Without this, re-entering an episode you have reacted to before would
    // empty every one of your past reactions across the screen at once.
    if (!primed.current) {
      primed.current = true;
      for (const r of reactions) if (r.mine) ownFlown.current.add(r.id);
      return;
    }

    const fresh = reactions.filter((r) => r.mine && !ownFlown.current.has(r.id));
    if (fresh.length === 0) return;
    for (const r of fresh) ownFlown.current.add(r.id);

    setFlying((current) => [
      ...current,
      ...fresh.map((r) => {
        lane.current = (lane.current + 1) % LANES;
        return { key: `${r.id}-own-${seq.current++}`, emoji: r.emoji, lane: lane.current, mine: true };
      }),
    ]);
  }, [reactions]);

  /**
   * Speak at most one summary per window, and only while the stream is moving.
   *
   * Held is the control that stops the drift; it stops the talking with it, because
   * somebody who has asked the screen to hold still has asked for quiet.
   */
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      if (pending.current.length === 0) return;
      const now = Date.now();
      if (now - spokeAt.current < ANNOUNCE_EVERY_MS) return;
      spokeAt.current = now;
      setAnnouncement(summarise(pending.current));
      pending.current = [];
    }, 1000);
    return () => clearInterval(id);
  }, [paused]);

  // Retire finished reactions in one sweep rather than a timer per element.
  useEffect(() => {
    if (flying.length === 0 || paused) return;
    const id = setTimeout(() => setFlying((c) => c.slice(1)), TRAVEL_MS / 2);
    return () => clearTimeout(id);
  }, [flying, paused]);

  return (
    <div
      className="pointer-events-none relative h-32 overflow-hidden"
      aria-label="Reactions from other viewers"
    >
      {/* The only thing here that speaks. The emoji themselves are hidden from a screen
          reader: they are a visual swell, and read one at a time they are noise. */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      {flying.map((f, index) => (
        <span
          key={f.key}
          aria-hidden="true"
          className="absolute text-3xl will-change-transform"
          style={{
            top: `${f.lane * 26 + 4}px`,
            opacity: f.mine ? 1 : 0.85,
            // Asked for less movement, this stops being a drift and becomes a row that
            // appears and clears. Staggered along the width so several at once do not
            // land on top of each other.
            ...(reduced
              ? { right: `${8 + (index % LANES) * 22}%` }
              : {
                  animation: `reaction-drift ${TRAVEL_MS}ms linear forwards`,
                  animationPlayState: paused ? 'paused' : 'running',
                }),
          }}
        >
          {f.emoji}
        </span>
      ))}
      <style>{`
        @keyframes reaction-drift {
          from { transform: translateX(100vw); }
          to   { transform: translateX(-20vw); }
        }
      `}</style>
    </div>
  );
}
