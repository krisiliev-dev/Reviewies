import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { longestStreak } from './compute.ts';

/**
 * Stats as seen from somewhere that is not Greenwich.
 *
 * Every other test in this directory runs in the runner's timezone, which is UTC, and
 * in UTC a UTC day key and a local day key are the same string. That agreement hid a
 * bug for the majority of the people this app is for: west of Greenwich, an evening is
 * already tomorrow in UTC, so every evening's viewing was filed under the next day.
 */

const ORIGINAL_TZ = process.env.TZ;

/** What the day key is expected to be: the viewer's own calendar date. */
function localDayKey(ms: number): string {
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

describe('watching in the evening in New York', () => {
  beforeAll(() => {
    process.env.TZ = 'America/New_York';
  });
  afterAll(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  it('files an evening under the day it actually was', async () => {
    const { getSummary } = await import('./compute.ts');
    const { db } = await import('../data/db.ts');

    await db.watches.clear();
    // 8pm on a Monday in New York. In UTC this is 1am on the Tuesday.
    const monday = Date.parse('2026-06-15T20:00:00-04:00');
    await db.watches.add({
      id: 'w1',
      targetId: 'tmdb:ep:1',
      seriesId: 'tmdb:tv:1',
      watchedAt: monday,
      runtimeMin: 45,
      source: 'manual',
    });

    const summary = await getSummary('all', { now: Date.parse('2026-07-01T12:00:00Z') });
    expect(summary.busiestDay?.date).toBe('2026-06-15');
    expect(localDayKey(monday)).toBe('2026-06-15');
  });

  it('counts an evening and the next morning as two days, not one', async () => {
    // The streak bug. Both of these are 1am UTC on consecutive days plus a morning, so
    // in UTC the Monday evening and the Tuesday morning share a date.
    const { getSummary } = await import('./compute.ts');
    const { db } = await import('../data/db.ts');

    await db.watches.clear();
    const times = [
      Date.parse('2026-06-15T20:00:00-04:00'), // Monday evening
      Date.parse('2026-06-16T10:00:00-04:00'), // Tuesday morning
    ];
    await db.watches.bulkAdd(
      times.map((watchedAt, i) => ({
        id: `w${i}`,
        targetId: `tmdb:ep:${i}`,
        seriesId: 'tmdb:tv:1',
        watchedAt,
        runtimeMin: 45,
        source: 'manual' as const,
      })),
    );

    const summary = await getSummary('all', { now: Date.parse('2026-07-01T12:00:00Z') });
    expect(summary.longestStreakDays).toBe(2);
  });

  it('keeps New Year’s Eve in the year the viewer watched it', async () => {
    const { getSummary } = await import('./compute.ts');
    const { db } = await import('../data/db.ts');

    await db.watches.clear();
    // 8pm on 31 December in New York is 1am on 1 January in UTC.
    await db.watches.add({
      id: 'nye',
      targetId: 'tmdb:ep:9',
      seriesId: 'tmdb:tv:1',
      watchedAt: Date.parse('2026-12-31T20:00:00-05:00'),
      runtimeMin: 45,
      source: 'manual',
    });

    // The year window is built from local midnights, so the day key has to agree with
    // it or an episode counts in one year and is dated to another.
    const summary = await getSummary('year', {
      year: 2026,
      now: Date.parse('2027-02-01T12:00:00Z'),
    });
    expect(summary.episodes).toBe(1);
    expect(summary.busiestDay?.date).toBe('2026-12-31');
  });

  it('still measures gaps between day keys correctly', () => {
    expect(longestStreak(['2026-12-30', '2026-12-31', '2027-01-01'])).toBe(3);
    expect(longestStreak(['2028-02-28', '2028-02-29', '2028-03-01'])).toBe(3);
  });
});
