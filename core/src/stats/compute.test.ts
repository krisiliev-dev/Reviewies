import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db.ts';
import {
  availableYears,
  formatDuration,
  getSummary,
  longestStreak,
  summarise,
  windowStart,
} from './compute.ts';
import type { WatchEvent } from '../domain/types.ts';

const DAY = 86_400_000;

const ev = (over: Partial<WatchEvent> = {}): WatchEvent => ({
  id: crypto.randomUUID(),
  targetId: 'tmdb:ep:1',
  seriesId: 'tmdb:tv:1',
  watchedAt: Date.parse('2026-06-15T20:00:00Z'),
  runtimeMin: 50,
  source: 'manual',
  ...over,
});

const names = new Map([
  ['tmdb:tv:1', 'The Long Dark'],
  ['tmdb:tv:2', 'Kitchen Nightshift'],
]);

describe('runtime weighting', () => {
  it('counts minutes, not episodes', () => {
    const s = summarise([ev({ runtimeMin: 50 }), ev({ runtimeMin: 22 })], names);
    expect(s.episodes).toBe(2);
    expect(s.minutes).toBe(72);
  });

  it('ranks a drama above a sitcom with more episodes', () => {
    // The exact complaint from Serializd users: episode counts flatter whoever
    // watches half-hour shows.
    const events = [
      ...Array.from({ length: 10 }, () => ev({ seriesId: 'tmdb:tv:2', runtimeMin: 22 })),
      ...Array.from({ length: 6 }, () => ev({ seriesId: 'tmdb:tv:1', runtimeMin: 55 })),
    ];
    const s = summarise(events, names);
    expect(s.topTitles[0].name).toBe('The Long Dark');
    expect(s.topTitles[0].minutes).toBe(330);
    expect(s.topTitles[1].episodes).toBe(10);
  });

  it('assumes a default runtime rather than dropping an event', () => {
    expect(summarise([ev({ runtimeMin: undefined })], names).minutes).toBe(30);
  });

  it('tallies films under their own id, since they have no series', () => {
    const s = summarise([ev({ seriesId: undefined, targetId: 'tmdb:movie:4' })], names);
    expect(s.topTitles[0].titleId).toBe('tmdb:movie:4');
  });
});

describe('summary shape', () => {
  it('reports an empty summary without throwing', () => {
    const s = summarise([], names);
    expect(s).toMatchObject({ episodes: 0, minutes: 0, distinctTitles: 0, longestStreakDays: 0 });
    expect(s.busiestDay).toBeUndefined();
  });

  it('finds the busiest day', () => {
    // Local 8pm, not 20:00Z. The UTC spelling made this a claim about the runner's
    // timezone rather than about the code: at UTC+14 it is already the 16th, and the
    // test failed while `summarise` was right. §6.66.
    const base = new Date(2026, 5, 15, 20).getTime();
    const s = summarise(
      [ev({ watchedAt: base }), ev({ watchedAt: base + 1000 }), ev({ watchedAt: base + 3 * DAY })],
      names,
    );
    expect(s.busiestDay).toEqual({ date: '2026-06-15', episodes: 2 });
  });

  it('records first and last watch', () => {
    const a = Date.parse('2026-01-01T00:00:00Z');
    const b = Date.parse('2026-09-01T00:00:00Z');
    const s = summarise([ev({ watchedAt: b }), ev({ watchedAt: a })], names);
    expect(s.firstWatch).toBe(a);
    expect(s.lastWatch).toBe(b);
  });

  it('limits the top list', () => {
    const events = ['a', 'b', 'c', 'd'].map((k) => ev({ seriesId: `tmdb:tv:${k}` }));
    expect(summarise(events, names, 2).topTitles).toHaveLength(2);
  });
});

describe('streaks', () => {
  it('counts consecutive days', () => {
    expect(longestStreak(['2026-06-01', '2026-06-02', '2026-06-03'])).toBe(3);
  });

  it('breaks on a gap', () => {
    expect(longestStreak(['2026-06-01', '2026-06-02', '2026-06-05', '2026-06-06'])).toBe(2);
  });

  it('counts a single day as one', () => {
    expect(longestStreak(['2026-06-01'])).toBe(1);
  });

  it('returns zero for no days', () => {
    expect(longestStreak([])).toBe(0);
  });

  it('handles duplicates and unsorted input', () => {
    expect(longestStreak(['2026-06-03', '2026-06-01', '2026-06-02', '2026-06-02'])).toBe(3);
  });

  it('spans a month boundary', () => {
    expect(longestStreak(['2026-01-30', '2026-01-31', '2026-02-01'])).toBe(3);
  });
});

describe('windows', () => {
  const now = Date.parse('2026-06-15T12:00:00Z');

  it('30d looks back thirty days', () => {
    expect(windowStart('30d', now)).toBe(now - 30 * DAY);
  });

  it('ytd starts at January 1st', () => {
    expect(new Date(windowStart('ytd', now)).getFullYear()).toBe(2026);
    expect(new Date(windowStart('ytd', now)).getMonth()).toBe(0);
  });

  it('all-time starts at zero', () => {
    expect(windowStart('all', now)).toBe(0);
  });
});

describe('against the database', () => {
  beforeEach(async () => {
    await db.watches.clear();
    await db.titles.clear();
    await db.titles.put({ id: 'tmdb:tv:1', kind: 'show', name: 'The Long Dark', fetchedAt: Date.now() });
  });

  it('excludes events outside the window', async () => {
    const now = Date.now();
    await db.watches.bulkAdd([
      ev({ watchedAt: now - 5 * DAY }),
      ev({ watchedAt: now - 200 * DAY }),
    ]);

    expect((await getSummary('30d', { now })).episodes).toBe(1);
    expect((await getSummary('all', { now })).episodes).toBe(2);
  });

  it('includes an event watched in this exact millisecond', async () => {
    // Regression: windowEnd used to be `now`, with a strict `<` comparison, so an
    // event timestamped in the same tick as the query vanished from the summary.
    const now = Date.now();
    await db.watches.add(ev({ watchedAt: now }));
    expect((await getSummary('all', { now })).episodes).toBe(1);
  });

  it('includes an event timestamped slightly in the future', async () => {
    // Imported history can carry mild clock skew; dropping it would be worse than
    // showing it.
    const now = Date.now();
    await db.watches.add(ev({ watchedAt: now + 5000 }));
    expect((await getSummary('all', { now })).episodes).toBe(1);
  });

  it('resolves series names', async () => {
    await db.watches.add(ev({ watchedAt: Date.now() }));
    expect((await getSummary('all')).topTitles[0].name).toBe('The Long Dark');
  });

  it('scopes a specific year', async () => {
    await db.watches.bulkAdd([
      ev({ watchedAt: Date.parse('2025-06-01T00:00:00Z') }),
      ev({ watchedAt: Date.parse('2026-06-01T00:00:00Z') }),
    ]);
    const s = await getSummary('year', { year: 2025, now: Date.parse('2026-08-01T00:00:00Z') });
    expect(s.episodes).toBe(1);
  });

  it('lists years containing watches, newest first', async () => {
    await db.watches.bulkAdd([
      ev({ watchedAt: Date.parse('2024-03-01T00:00:00Z') }),
      ev({ watchedAt: Date.parse('2026-03-01T00:00:00Z') }),
    ]);
    expect(await availableYears()).toEqual([2026, 2024]);
  });
});

describe('formatDuration', () => {
  it.each([
    [45, '45m'],
    [90, '1.5h'],
    [600, '10h'],
    [2880, '2.0 days'],
  ])('formats %i minutes as %s', (mins, expected) => {
    expect(formatDuration(mins)).toBe(expected);
  });
});
