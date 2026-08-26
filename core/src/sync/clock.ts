import { readPreference, writePreference } from '../data/storage.ts';
import { COPY } from '../copy.ts';

/**
 * A clock that has been checked against somebody else's.
 *
 * Sync is last-write-wins on `updatedAt`, and `updatedAt` is a number **the device
 * writes**. Nothing anywhere compared it to anything, which made a wrong clock — a dead
 * coin cell, a bad NTP server, a date set by hand to unlock an expired trial — into
 * silent data loss that looks exactly like sync working:
 *
 * - A week **fast**: every row that device touches is stamped a week ahead. No other
 *   device can overwrite one for a week, and the person correcting their own mistake
 *   cannot either. Worse, the pull cursor is derived from row timestamps, so a correct
 *   device that pulls one of those rows moves *its* cursor a week into the future and
 *   then receives nothing at all until the real clock catches up.
 * - A week **slow**: its writes reach the server carrying an old timestamp, so every
 *   other device's cursor is already past them. The row is there and nobody ever sees
 *   it. The edit simply evaporates.
 *
 * ## Why an offset rather than the alternatives
 *
 * **Clamping remote timestamps to our own on receipt** is one line and destroys the only
 * thing `updatedAt` is for: saying which of two devices wrote last.
 *
 * **A per-device counter** — a Lamport clock — is the correct answer to "which write came
 * after which" and does not involve wall time at all. It also changes the wire format,
 * the schema, and the meaning of every row already written. Out of scope for one sprint,
 * and recorded in §7 as the thing this does not become.
 *
 * **Learning the offset from the server** costs a persisted number and nothing on the
 * wire: every HTTP response already carries a `Date` header. Stamps are corrected at the
 * source, so nothing wrong is written in the first place, and ordering between devices
 * survives because they are all corrected towards the same clock. What it does not do is
 * repair rows already written wrongly, or help a device that has never once reached the
 * server — which is why migration 0014 also clamps `updated_at` server-side and the
 * engine refuses to let any cursor run ahead of now. §6.67.
 *
 * ## What deliberately does not use this
 *
 * Anything that compares two of *this device's own* timestamps. `isStale(fetchedAt)`,
 * `expireMetadata`, the calendar's refresh throttle, the anime-id TTL and `resumeFor`
 * all measure a difference between a number this device wrote and a number this device
 * is reading now — so an offset cancels out exactly, and correcting one end and not the
 * other would introduce the error rather than remove it. They are right as they are.
 *
 * A clock that *jumps* still perturbs them, and the cost is bounded and self-healing: a
 * cache that refreshes early, or one that waits longer than it should once. The one
 * place a jump was not survivable is `usePlaybackClock`, which measures elapsed time
 * across a whole episode and now uses `performance.now()` — monotonic by definition.
 */

const OFFSET_KEY = 'reviewies.sync.clockOffsetMs';

/** serverNow − localNow, in milliseconds. Positive means our clock is slow. */
let offsetMs: number | undefined;
let loaded = false;

function load(): void {
  if (loaded) return;
  loaded = true;
  const stored = readPreference(OFFSET_KEY);
  if (stored === null) return;
  const parsed = Number(stored);
  if (Number.isFinite(parsed)) offsetMs = parsed;
}

/**
 * Record what the server said the time was.
 *
 * `roundTripMs` is how long the request took. The server stamped its header somewhere
 * inside that window, so half of it is the best single guess at the one-way delay —
 * the standard correction, and on a slow connection the difference between a skew of
 * "two seconds" and one of "two seconds plus however long the train tunnel lasted".
 *
 * A `Date` header has one-second resolution, so this can never be more accurate than
 * that. It does not need to be: it exists to catch skews measured in hours and days.
 */
export function observeServerTime(serverNowMs: number, roundTripMs = 0): void {
  if (!Number.isFinite(serverNowMs)) return;
  load();
  offsetMs = serverNowMs + roundTripMs / 2 - Date.now();
  writePreference(OFFSET_KEY, String(Math.round(offsetMs)));
}

/**
 * The time, corrected towards the server if we have ever heard from it.
 *
 * Every `updatedAt` this product writes comes from here. Uncorrected `Date.now()` is
 * still the answer on a device that has never synced — there is nothing better to say —
 * and the first successful request fixes it from then on.
 */
export function syncedNow(): number {
  load();
  return Date.now() + (offsetMs ?? 0);
}

/** How far out this device's clock is, or undefined if the server has never answered. */
export function clockOffsetMs(): number | undefined {
  load();
  return offsetMs;
}

/** Forget the correction. For tests, and for signing out of an account. */
export function resetClock(): void {
  offsetMs = undefined;
  loaded = false;
  writePreference(OFFSET_KEY, '');
}

/**
 * Anything further out than this is not a clock, it is a mistake.
 *
 * Used only to decide whether to *tell* somebody. Correcting silently is right — the
 * offset does its job either way — but a device two days out will also be wrong about
 * every deadline, every "aired today" and every timestamp it shows, and none of that is
 * something sync can fix.
 */
export const NOTABLE_SKEW_MS = 60 * 60 * 1000;

/**
 * What to tell somebody about their clock, or nothing at all.
 *
 * Nothing is the usual answer, and the bar is deliberately high: a minute or two out is
 * invisible and irrelevant, and a warning about it would be noise. An hour is where the
 * rest of the app starts being wrong in ways sync cannot fix — the calendar, what aired
 * today, which day a watch is filed under — and where saying so beats letting somebody
 * conclude the app is broken.
 */
export function clockWarning(): string | undefined {
  const offset = clockOffsetMs();
  if (offset === undefined || Math.abs(offset) < NOTABLE_SKEW_MS) return undefined;
  return COPY.app.clockWrong(describeSkew(Math.abs(offset)));
}

/** "2 hours", "3 days" — the roughest unit that is still true. */
function describeSkew(ms: number): string {
  const hours = Math.round(ms / 3_600_000);
  if (hours < 48) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}
