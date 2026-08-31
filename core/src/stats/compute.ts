import { db } from '../data/db.ts';
import type { WatchEvent } from '../domain/types.ts';
import { dayKey } from '../time.ts';

/**
 * Stats, computed from watch events.
 *
 * Two rules, both from the research:
 *
 * 1. Everything is runtime-weighted. Serializd users complained specifically that
 *    "half-hour programs can't compete with 45-60 minute programs" — counting
 *    episodes rather than minutes flatters whoever watches sitcoms.
 *
 * 2. Windows other than all-time. A top Trakt roadmap request was scoping stats to
 *    30 days or year-to-date rather than a single lifetime number nobody relates to.
 */

/** Assumed length when an event carries no runtime, rather than dropping it. */
const DEFAULT_RUNTIME_MIN = 30;

export type Window = '30d' | 'ytd' | 'year' | 'all';

/**
 * Which stretch of time the stats screen opens on.
 *
 * It was `ytd` on the web and `30d` on the phone — the same screen opening on a
 * different answer depending on which one you held, which nobody had decided (§6.54).
 * This year, because the year is the period people actually think in about what they
 * have watched, and because Year in Review is built on it.
 *
 * Whatever it is, it can be empty for somebody whose history is real — see
 * `COPY.stats.showAllTime`, which is the way out of that.
 */
export const DEFAULT_STATS_WINDOW: Window = 'ytd';

export interface TitleTally {
  titleId: string;
  name: string;
  episodes: number;
  minutes: number;
}

export interface StatsSummary {
  episodes: number;
  minutes: number;
  distinctTitles: number;
  topTitles: TitleTally[];
  /** Watch counts keyed yyyy-mm-dd, for a heatmap or chart. */
  byDay: Record<string, number>;
  busiestDay?: { date: string; episodes: number };
  longestStreakDays: number;
  firstWatch?: number;
  lastWatch?: number;
}

export function windowStart(window: Window, now: number, year?: number): number {
  if (window === '30d') return now - 30 * 24 * 60 * 60 * 1000;
  if (window === 'ytd') return new Date(new Date(now).getFullYear(), 0, 1).getTime();
  if (window === 'year') return new Date(year ?? new Date(now).getFullYear(), 0, 1).getTime();
  return 0;
}

export function windowEnd(window: Window, now: number, year?: number): number {
  if (window === 'year') return new Date((year ?? new Date(now).getFullYear()) + 1, 0, 1).getTime();
  // Unbounded, not `now`. Bounding at the current millisecond drops an event
  // watched in this exact tick — mark an episode watched, open stats, and it
  // would be missing. It also drops imported rows whose timestamps sit slightly
  // in the future through clock skew.
  return Infinity;
}


export function summarise(
  events: WatchEvent[],
  names: Map<string, string>,
  topN = 5,
): StatsSummary {
  const byDay: Record<string, number> = {};
  const tallies = new Map<string, TitleTally>();
  let minutes = 0;
  let first: number | undefined;
  let last: number | undefined;

  for (const e of events) {
    const runtime = e.runtimeMin ?? DEFAULT_RUNTIME_MIN;
    minutes += runtime;

    const key = dayKey(e.watchedAt);
    byDay[key] = (byDay[key] ?? 0) + 1;

    if (first === undefined || e.watchedAt < first) first = e.watchedAt;
    if (last === undefined || e.watchedAt > last) last = e.watchedAt;

    // Films have no series, so they tally under their own ID.
    const titleId = e.seriesId ?? e.targetId;
    const tally = tallies.get(titleId) ?? {
      titleId,
      name: names.get(titleId) ?? 'Unknown',
      episodes: 0,
      minutes: 0,
    };
    tally.episodes++;
    tally.minutes += runtime;
    tallies.set(titleId, tally);
  }

  const days = Object.entries(byDay);
  const busiest = days.sort((a, b) => b[1] - a[1])[0];

  return {
    episodes: events.length,
    minutes,
    distinctTitles: tallies.size,
    // Ranked by time, not episode count, for the same reason stats are
    // runtime-weighted at all.
    topTitles: [...tallies.values()].sort((a, b) => b.minutes - a.minutes).slice(0, topN),
    byDay,
    busiestDay: busiest ? { date: busiest[0], episodes: busiest[1] } : undefined,
    longestStreakDays: longestStreak(Object.keys(byDay)),
    firstWatch: first,
    lastWatch: last,
  };
}

/** Longest run of consecutive calendar days with at least one watch. */
export function longestStreak(dayKeys: string[]): number {
  if (dayKeys.length === 0) return 0;

  // `Date.parse` on a bare `yyyy-mm-dd` is UTC midnight — the reading that is wrong
  // everywhere else in this product and right here, because both ends get it and the gap
  // between two UTC midnights is exactly a day even across a daylight-saving change. Two
  // local midnights would be 23 or 25 hours apart, which is why this reads the keys back
  // rather than the instants they came from. §6.66.
  const days = [...new Set(dayKeys)].sort();
  let best = 1;
  let run = 1;

  for (let i = 1; i < days.length; i++) {
    const prev = Date.parse(days[i - 1]);
    const cur = Date.parse(days[i]);
    const gapDays = Math.round((cur - prev) / 86_400_000);
    if (gapDays === 1) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  return best;
}

export async function getSummary(
  window: Window,
  opts: { now?: number; year?: number; topN?: number } = {},
): Promise<StatsSummary> {
  const now = opts.now ?? Date.now();
  const from = windowStart(window, now, opts.year);
  const to = windowEnd(window, now, opts.year);

  const events = (await db.watches.toArray()).filter(
    (e) => e.watchedAt >= from && e.watchedAt < to,
  );

  const titles = await db.titles.toArray();
  const names = new Map(titles.map((t) => [t.id, t.name]));

  return summarise(events, names, opts.topN);
}

/** Years that actually contain watches, newest first — for the Year in Review picker. */
export async function availableYears(): Promise<number[]> {
  const events = await db.watches.toArray();
  const years = new Set(events.map((e) => new Date(e.watchedAt).getFullYear()));
  return [...years].sort((a, b) => b - a);
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
  const days = hours / 24;
  return `${days.toFixed(1)} days`;
}

/**
 * One row per year, twelve counts each — the year spine.
 *
 * `core/src/ui/spine.ts` holds the drawing decisions and the argument; this is the data
 * behind them, and it is deliberately made of **counts**. `docs/design/direction.md` graft 2
 * cut TEST CARD's per-watch strip down to this for a reason it verified in
 * `core/src/data/diocache.ts`: the import deposits episode watches with no ratings at all,
 * so a strip keyed to rating is flat grey on the day a decade arrives, and a row made of
 * counts reads correctly.
 *
 * Three rules, all of which a test can state:
 *
 * 1. **The current year is always a row**, watched or not. Somebody who has never marked
 *    anything still gets an almanac with one cell open in it, which is the whole object
 *    saying what it is for. It is also what stops the open cell landing on 2019 because 2019
 *    is the newest year with anything in it.
 * 2. **Newest first**, because the row you are adding to is the row you want at the top, and
 *    because a spine that grows downward puts tonight further away every year.
 * 3. **The open cell is in the data, not in the renderer.** It would be two lines in each
 *    `YearSpine.tsx` — `new Date(Date.now()).getMonth()` — and that is two clocks: the one
 *    this function read to decide which year gets a row, and the one a component reads a few
 *    milliseconds later. They agree every night of the year except one, and on that night the
 *    renderer would look for the open cell in a year the data has no row for and draw
 *    nothing. One clock, read here, carried on the row it belongs to.
 *
 * Local time throughout — `getFullYear` and `getMonth` read the viewer's own calendar, which
 * is `core/src/time.ts`'s standing rule and the one `availableYears` above already follows.
 * A watch at 11pm on 31 December belongs to the year the person was in when they watched it.
 */
export interface SpineYear {
  year: number;
  /** Twelve counts, January first. */
  months: number[];
  episodes: number;
  minutes: number;
  /**
   * The month, 0–11, whose block carries the open cell. Present on exactly one row — the
   * current year — and `undefined` on every other.
   */
  open?: number;
}

export function spineYears(events: WatchEvent[], now: number = Date.now()): SpineYear[] {
  const rows = new Map<number, SpineYear>();
  const row = (year: number): SpineYear => {
    const existing = rows.get(year);
    if (existing) return existing;
    const made: SpineYear = { year, months: Array(12).fill(0), episodes: 0, minutes: 0 };
    rows.set(year, made);
    return made;
  };

  // Rules 1 and 3, both before the loop so they hold on an empty history as well as a full
  // one, and off one reading of one clock.
  const today = new Date(now);
  row(today.getFullYear()).open = today.getMonth();

  for (const event of events) {
    const at = new Date(event.watchedAt);
    const year = row(at.getFullYear());
    year.months[at.getMonth()]++;
    year.episodes++;
    year.minutes += event.runtimeMin ?? DEFAULT_RUNTIME_MIN;
  }

  return [...rows.values()].sort((a, b) => b.year - a.year);
}

/** The spine, read from the database. All-time by definition — a year is the window. */
export async function getSpine(now: number = Date.now()): Promise<SpineYear[]> {
  return spineYears(await db.watches.toArray(), now);
}
