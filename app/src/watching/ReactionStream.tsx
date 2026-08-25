import { useEffect, useRef, useState } from 'react';
import type { Reaction } from '@reviewies/core/domain/types';
import { useReducedMotion } from '../ui/useReducedMotion';

const LANES = 4;
const TRAVEL_MS = 7000;

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

  useEffect(() => {
    const from = lastPos.current;
    const to = positionMs;
    lastPos.current = to;

    // Seeking backwards, or a jump large enough to be a seek rather than playback,
    // should not dump a whole episode's reactions on screen at once.
    if (to < from || to - from > 5000) return;
    if (paused) return;

    const due = reactions.filter((r) => r.tMs > from && r.tMs <= to);
    if (due.length === 0) return;

    const shown = density >= 1 ? due : due.filter(() => Math.random() < density);
    if (shown.length === 0) return;

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

  // Retire finished reactions in one sweep rather than a timer per element.
  useEffect(() => {
    if (flying.length === 0 || paused) return;
    const id = setTimeout(() => setFlying((c) => c.slice(1)), TRAVEL_MS / 2);
    return () => clearTimeout(id);
  }, [flying, paused]);

  return (
    <div
      className="pointer-events-none relative h-32 overflow-hidden"
      aria-live="polite"
      aria-label="Reactions from other viewers"
    >
      {flying.map((f, index) => (
        <span
          key={f.key}
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
