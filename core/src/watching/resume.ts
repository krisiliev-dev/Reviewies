import { readPreference, writePreference } from '../data/storage.ts';

/**
 * Where you had got to, so that leaving the screen does not lose it.
 *
 * Watching Mode kept its position in React state and nowhere else, so stepping away —
 * a phone call, looking up who that actor is, anything — came back to `0:00` and *Start
 * watching*. For a second-screen app that is not an edge case, it is the case: doc 10
 * §2 found it within a minute of using the thing.
 *
 * The clock is restored the way it would have behaved if nobody had left. A clock that
 * was *running* is advanced by the wall-clock time that passed, because the episode kept
 * playing while you were away and showing you where you were three minutes ago would be
 * a different kind of wrong. A clock that was *paused* comes back where it was.
 *
 * Kept per episode, so returning to a different one starts clean, and dropped after
 * `STALE_AFTER_MS` — resuming last night's episode this evening is not a resume, it is a
 * surprise.
 */
export interface Resumable {
  targetId: string;
  positionMs: number;
  running: boolean;
  /** When this was written. */
  at: number;
}

const KEY = 'reviewies:watching-position';

/** Longer than an episode and shorter than a night. */
export const STALE_AFTER_MS = 4 * 60 * 60 * 1000;

export function remember(state: Resumable): void {
  // Best-effort, like every other preference: a full or blocked store must not be able
  // to interrupt watching something. `writePreference` already swallows for that reason.
  writePreference(KEY, JSON.stringify(state));
}

export function forget(): void {
  writePreference(KEY, '');
}

/**
 * What to restore for this episode, already advanced if it was running.
 *
 * Returns nothing when there is no record, when it belongs to a different episode, or
 * when it is old enough that resuming would be a surprise rather than a convenience.
 */
export function resumeFor(targetId: string, now = Date.now()): Resumable | undefined {
  const raw = readPreference(KEY);
  if (!raw) return undefined;

  let saved: Resumable;
  try {
    saved = JSON.parse(raw) as Resumable;
  } catch {
    return undefined;
  }

  if (
    !saved ||
    saved.targetId !== targetId ||
    typeof saved.positionMs !== 'number' ||
    !Number.isFinite(saved.positionMs) ||
    typeof saved.at !== 'number' ||
    now - saved.at > STALE_AFTER_MS ||
    // A record from the future is a clock that moved, not a position to trust.
    saved.at > now + 60_000
  ) {
    return undefined;
  }

  const elapsed = saved.running ? Math.max(0, now - saved.at) : 0;
  return { ...saved, positionMs: Math.max(0, saved.positionMs + elapsed), at: now };
}
