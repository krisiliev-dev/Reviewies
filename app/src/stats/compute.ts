import { db } from '../data/db';
import type { WatchEvent } from '../domain/types';

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
  return now;
}

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

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
