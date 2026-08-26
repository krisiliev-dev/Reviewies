/**
 * The viewer's calendar.
 *
 * Two different things get called a date in this product and they are not the same kind
 * of thing. A **watch** happens at an instant — a number of milliseconds, unambiguous
 * everywhere. An **air date** is a calendar date: `2026-08-26`, a square on somebody's
 * wall, with no hour attached to it at all.
 *
 * Turning the second into the first is where every timezone bug lives, because
 * `Date.parse('2026-08-26')` does it silently and gets it wrong for most of the world.
 * The specification says a date-only string is **UTC** midnight, so:
 *
 * - In Los Angeles, an episode airing tomorrow counts as aired from 5pm today — Up Next
 *   offers you an episode nobody has broadcast yet, on exactly the evening people open
 *   this app.
 * - In Kiritimati (UTC+14), an episode airing today stays hidden until 2pm — the whole
 *   morning of the day it aired, Up Next says there is nothing to watch.
 *
 * Neither was visible to a single test, because the runner's clock is UTC — where the
 * two agree — and because every air-date fixture in the suite is *days* away from now,
 * so an error of a few hours never crosses a boundary. §6.66.
 *
 * So: a calendar date is read in the viewer's own calendar, everywhere, through here.
 * That is the only reading a person can check by looking at their wall.
 */

import { COPY } from './copy.ts';

const pad = (n: number): string => String(n).padStart(2, '0');

/** Which calendar day, in the viewer's own calendar, an instant belongs to. */
export function dayKey(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Today, in the viewer's own calendar. */
export function todayKey(now: number = Date.now()): string {
  return dayKey(now);
}

/**
 * The instant a calendar day begins, in the viewer's own calendar.
 *
 * Accepts a bare `yyyy-mm-dd` or a longer ISO string, since TMDB sends the first and
 * imports have produced the second. Returns NaN for anything unreadable, so callers can
 * keep using `Number.isFinite` to mean "this episode has no usable date".
 *
 * On the one day a year that has no local midnight — a spring-forward that happens at
 * midnight, as Brazil used to — the Date constructor normalises to 1am, which is still
 * the first instant of that day and therefore still right.
 */
export function startOfDay(day: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!match) return NaN;
  const [, year, month, date] = match;
  return new Date(Number(year), Number(month) - 1, Number(date)).getTime();
}

/**
 * Whether a calendar day has arrived where the viewer is.
 *
 * True from the first moment of that day. An air date carries no hour — TMDB gives the
 * original network's date and nothing more — so the honest reading is "on that day",
 * not "at some hour of that day we invented".
 */
export function dayHasArrived(day: string, now: number = Date.now()): boolean {
  const start = startOfDay(day);
  return Number.isFinite(start) && start <= now;
}

/**
 * Whole calendar days from today to `day`; negative for the past.
 *
 * Counted between the two days' starting instants and rounded, so a day that is 23 or 25
 * hours long — which is what a daylight-saving change makes it — still counts as one.
 * Subtracting raw milliseconds and flooring would report 0 across a spring-forward.
 */
export function daysUntil(day: string, now: number = Date.now()): number {
  const start = startOfDay(day);
  if (!Number.isFinite(start)) return NaN;
  return Math.round((start - startOfDay(dayKey(now))) / 86_400_000);
}

/**
 * How a day is named to a person: "Today", "Tomorrow", "Friday", "Fri, 3 Sep".
 *
 * The web had this and the phone printed the raw `2026-08-26` — the same screen, two
 * different answers, which is the §6.51 shape again. Here so that both get the same one.
 * Anything further out than a week gets its date, because "Thursday" three weeks away
 * tells nobody anything.
 */
export function formatDay(day: string, now: number = Date.now()): string {
  const start = startOfDay(day);
  if (!Number.isFinite(start)) return day;

  const diff = daysUntil(day, now);
  if (diff === 0) return COPY.calendar.today;
  if (diff === 1) return COPY.calendar.tomorrow;

  const date = new Date(start);
  if (diff > 1 && diff < 7) {
    return date.toLocaleDateString(undefined, { weekday: 'long' });
  }
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
