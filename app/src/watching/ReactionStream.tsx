import { useEffect, useRef, useState } from 'react';
import type { Reaction } from '@reviewies/core/domain/types';
import { useReducedMotion } from '../ui/useReducedMotion';
import { ANNOUNCE_EVERY_MS, summarise } from '@reviewies/core/watching/announce';
import {
  DEFAULT_REACTION_DENSITY,
  REACTION_VISIBLE_MS,
} from '@reviewies/core/watching/reactions';
import { COPY } from '@reviewies/core/copy';

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
  /**
   * When this one has finished crossing and its slot is free again.
   *
   * `Date.now()` rather than the monotonic clock §6.67 moved the *playback* position to.
   * A clock correction mid-episode would sweep a batch a little early or late, which is
   * cosmetic — an emoji leaving a moment sooner than it should — where the same
   * correction applied to the playback position files every reaction after it at the
   * wrong timestamp. Different stakes, different answer.
   */
  retireAt: number;
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
  density = DEFAULT_REACTION_DENSITY,
  paused = false,
}: {
  /**
   * `undefined` until the episode's history has been read.
   *
   * The difference matters exactly once, in the priming below, and getting it wrong
   * meant every reaction you had ever left on an episode flew across the screen the
   * moment you reopened it. §6.78.
   */
  reactions: Reaction[] | undefined;
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
   * announced — up to twenty-four on screen at once at the default density, on a screen
   * somebody is holding while watching television. Now a burst is collected and
   * summarised once, and between moments it says nothing.
   */
  const [announcement, setAnnouncement] = useState('');
  const pending = useRef<string[]>([]);
  /**
   * How many are on screen, readable from the effect below without making it depend on
   * `flying` — which would re-run it on every arrival and replay the same window.
   */
  const flyingCount = useRef(0);
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
    if (!reactions) return;
    const due = reactions.filter(
      (r) => r.tMs > from && r.tMs <= to && !ownFlown.current.has(r.id),
    );
    if (due.length === 0) return;

    // A cap on what is on screen, not a proportion of what is due. `density` was a
    // fraction here and a count on the phone — the same control meaning two different
    // things — and a fraction cannot be promised to anybody, because a quarter of a
    // quiet episode is nothing and all of a busy one is a wall. §6.55.
    const room = Math.max(0, density - flyingCount.current);
    const shown = due.slice(0, room);
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
          retireAt: Date.now() + TRAVEL_MS,
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
    //
    // Which is exactly what it did. The priming ran on the first render, when the live
    // query had not answered yet and `reactions` was the empty array it was given as a
    // default — so it primed with nothing, and the real history arriving a moment later
    // looked like eight taps that had just happened. §6.78 found it by opening the
    // screen on an episode with a few of its own reactions on it: eight emoji, stacked
    // two to a lane, drifting across a screen whose clock had not been started.
    //
    // `undefined` now means "not read yet" and an empty array means "read, and empty",
    // so the priming happens when the history actually arrives — including when the
    // history is nothing, which is what keeps the *first* reaction on an episode flying
    // the moment it is tapped.
    if (!reactions) return;
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
        return {
          key: `${r.id}-own-${seq.current++}`,
          emoji: r.emoji,
          lane: lane.current,
          mine: true,
          retireAt: Date.now() + TRAVEL_MS,
        };
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

  /**
   * Retire everything that has finished crossing, not one thing every so often.
   *
   * It used to drop a single element every `TRAVEL_MS / 2`, whatever had finished. The
   * cap held — twenty-four were mounted and twenty-four were on screen — so nothing
   * looked wrong, and the cost was paid somewhere nobody was measuring: a slot taken by
   * an emoji whose animation ended four seconds ago stays taken for up to another fifty,
   * and `room = density - flyingCount` then refuses every arrival meanwhile.
   *
   * Measured over five minutes of a busy episode — one reaction a second — **116 of 300
   * ever reached the screen**. Twenty a minute, against the twenty-four slots × four
   * seconds visible that the design allows, which is three hundred. And the ones shown
   * were an arbitrary prefix, because `due.slice(0, room)` takes the earliest.
   *
   * "You still see everything everyone else left at that moment" is what this screen is
   * for. It was showing two fifths of it. §6.69.
   */
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      const now = Date.now();
      // Only touch state when something actually expired: a `setFlying` per tick would
      // re-render the band four times a second for the length of an episode.
      setFlying((c) => (c.some((f) => f.retireAt <= now) ? c.filter((f) => f.retireAt > now) : c));
    }, 250);
    return () => clearInterval(id);
  }, [paused]);

  /**
   * Held means held, including the countdown.
   *
   * WCAG 2.2.2's pause stops the animation where it stands (`animationPlayState`), so
   * retiring on schedule underneath it would clear a screen somebody asked to hold
   * still. The time spent paused is added back to every deadline on release.
   */
  const heldSince = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (paused) {
      heldSince.current = Date.now();
      return;
    }
    const since = heldSince.current;
    heldSince.current = undefined;
    if (since === undefined) return;
    const held = Date.now() - since;
    setFlying((c) => c.map((f) => ({ ...f, retireAt: f.retireAt + held })));
  }, [paused]);

  flyingCount.current = flying.length;

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

      {/*
        A resting state, because the band is the feature.
        §6.61 looked at the screenshots for the first time and found the top fifth of
        Watching Mode — the part where other people's reactions cross — was a hundred and
        twenty-eight pixels of pure black with nothing to say it was anything. Somebody
        opening the flagship screen saw a gap. This says what the space is for, quietly,
        and gets out of the way the moment anything arrives.
      */}
      {/*
        The stream's own resting label, and not a `Note`: it is set in the tertiary ink
        because it sits over a moving band on the `well` ground, where tertiary holds
        5.09:1. `Note` owns its ink at secondary, so a call site overriding that would be
        two answers — this is a different role rather than a note with an exception.

        It was `text-ink-secondary/70` before, which is the defect `docs/design/tokens.md`
        §3 names: an opacity on a colour is invisible to a contrast test forever, and a
        named step is not.
      */}
      {flying.length === 0 && (
        <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-s12 text-ink-tertiary">
          {COPY.watching.streamResting}
        </p>
      )}
      {flying.map((f, index) => (
        <span
          key={f.key}
          aria-hidden="true"
          className="absolute text-s30 will-change-transform"
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
