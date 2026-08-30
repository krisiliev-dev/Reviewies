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
 * How a day is named to a person: "Today", "Tomorrow", "Yesterday", "Friday",
 * "Fri, 3 Sep", "Thu, 4 Aug 2005".
 *
 * The web had this and the phone printed the raw `2026-08-26` — the same screen, two
 * different answers, which is the §6.51 shape again. Here so that both get the same one.
 * Anything further out than a week gets its date, because "Thursday" three weeks away
 * tells nobody anything.
 *
 * ## Going backwards
 *
 * This was written for the calendar, which only looks forward, and every test it had
 * stood on today or later. The title page lists an episode *history*, and putting it
 * through here unchanged turned a 2005 premiere into **"Thu, Aug 4"** — the same shape
 * as an episode airing next month, for something twenty-one years old. That is a worse
 * answer than the ISO string the title page used to print, which is why the reading pass
 * that found it filed the date rather than fixing it: the repair needed a decision first.
 *
 * The decision is **distance decides how much date; direction decides only the words
 * that must have one.**
 *
 * - The near words are the exception to everything, in both directions. Today, Tomorrow,
 *   Yesterday.
 * - A bare weekday is a *forward* name. "Friday" three days ago and "Friday" three days
 *   ahead are the same string, and a person reading a list of episodes has no way to
 *   tell which was meant — so the past does not get one and falls through to its date.
 *   The forward branch keeps it: the week ahead is the case the branch was written for
 *   and the ambiguity does not arise there.
 * - **The year is written down whenever it is not this one**, in either direction. An
 *   unqualified "Aug 4" is not neutral — it is a claim that the date is near enough that
 *   the year does not need saying — and a premiere from 2005 and a season announced for
 *   2027 are both badly served by it.
 *
 * Rejected: a second formatter for the past, which is a second answer to §6.66's question
 * and would let the two drift; and "Last Friday", which reads well in English and becomes
 * *"Last vendredi"* the moment `toLocaleDateString` is not returning English — the near
 * words above are whole strings from `COPY`, not an English modifier glued to a localised
 * one, and that is the difference.
 */
export function formatDay(day: string, now: number = Date.now()): string {
  const start = startOfDay(day);
  if (!Number.isFinite(start)) return day;

  const diff = daysUntil(day, now);
  if (diff === 0) return COPY.calendar.today;
  if (diff === 1) return COPY.calendar.tomorrow;
  if (diff === -1) return COPY.calendar.yesterday;

  const date = new Date(start);
  if (diff > 1 && diff < 7) {
    return date.toLocaleDateString(undefined, { weekday: 'long' });
  }
  // Compared against the *viewer's* year rather than a count of days, so the answer is
  // the one a person would give: a date is in this year or it is not.
  const thisYear = new Date(now).getFullYear() === date.getFullYear();
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(thisYear ? {} : { year: 'numeric' }),
  });
}
