import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db.ts';
import {
  availableYears,
  formatDuration,
  getSummary,
  longestStreak,
  summarise,
  windowEnd,
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

  /**
   * Five, and the busiest day rather than the first one seen.
   *
   * §6.76 mutated `summarise` and both of these survived. The list length is only ever
   * asked for explicitly above, so the default nothing passes — which is what every
   * screen actually gets — was free to be any number. And the busiest-day comparator
   * reads `b[1] - a[1]`; change either index and the comparison returns NaN, which
   * leaves the array in the order it was built. The fixture above happens to build the
   * busy day first, so it still came out on top.
   */
  it('returns five titles when nobody says how many', () => {
    const events = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((k) => ev({ seriesId: `tmdb:tv:${k}` }));
    expect(summarise(events, names).topTitles).toHaveLength(5);
  });

  it('finds the busiest day even when it is not the first one', () => {
    const first = new Date(2026, 5, 15, 20).getTime();
    const later = new Date(2026, 5, 18, 20).getTime();
    const s = summarise(
      [ev({ watchedAt: first }), ev({ watchedAt: later }), ev({ watchedAt: later + 1000 })],
      names,
    );
    expect(s.busiestDay).toEqual({ date: '2026-06-18', episodes: 2 });
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
    // The whole instant, not the year and the month: checking two of the three fields
    // left the day free to be the 2nd, which §6.76 proved by making it so.
    expect(windowStart('ytd', now)).toBe(new Date(2026, 0, 1).getTime());
  });

  it('all-time starts at zero', () => {
    expect(windowStart('all', now)).toBe(0);
  });

  /**
   * The Year in Review's two edges, which nothing had ever named.
   *
   * The `ytd` test above checks the year and the month and not the day, and the `year`
   * window — the one the picker uses — had no test of its own at all. §6.76 moved its
   * start to February, moved its start to the 2nd, moved its end into the year after
   * next, and the suite stayed green through all of it.
   *
   * Written in local time on purpose. Both ends of this are built with `new Date(y, 0, 1)`,
   * which is local midnight, and the suite runs again at UTC+14 (§6.66).
   */
  it('a year begins at local midnight on the first of January', () => {
    expect(windowStart('year', now, 2025)).toBe(new Date(2025, 0, 1).getTime());
  });

  it('and ends at local midnight on the first of January after it', () => {
    expect(windowEnd('year', now, 2025)).toBe(new Date(2026, 0, 1).getTime());
  });

  /**
   * A year given is a year meant — whatever window sits beside it.
   *
   * `year` reaches these two functions from exactly one place in the product, the Year in
   * Review picker, and the two screens that draw that picker did not agree on how to say
   * so. The web passed `'year'`; the phone passed whichever *window* chip had last been
   * pressed and the year alongside it, so `windowStart` took the `'ytd'` branch and threw
   * the year away. Measured rather than reasoned about: on the phone, with the design
   * harness's 122 imported watches, 2026, 2025 and 2024 all reported `Episodes 50` — the
   * current year's figure, three times, under three different headings — where the web
   * reported 50, 66 and 6. `docs/design/hci.md` finding 1.
   *
   * The rule is stated here rather than repaired at the call site, because a decision made
   * at two call sites is a decision the third one will make differently. Nothing in the
   * product wants a year ignored; a caller that supplies one is asking for that year, and
   * silently answering a different one is the worst of the three available behaviours.
   *
   * Every window, not just the phone's `'ytd'`: a clause naming the one that was wrong is
   * a clause that passes again the moment the phone's default changes.
   */
  it('answers the year it was given, whatever window sits beside it', () => {
    for (const beside of ['30d', 'ytd', 'all', 'year'] as const) {
      expect(windowStart(beside, now, 2025), `${beside} with a year`)
        .toBe(new Date(2025, 0, 1).getTime());
      expect(windowEnd(beside, now, 2025), `${beside} with a year`)
        .toBe(new Date(2026, 0, 1).getTime());
    }
  });

  /** And a window with no year beside it is still that window. The other half. */
  it('leaves a window alone when no year is given', () => {
    expect(windowStart('30d', now, undefined)).toBe(now - 30 * DAY);
    expect(windowEnd('30d', now, undefined)).toBe(Infinity);
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

  /**
   * Both ends of the filter, to the millisecond.
   *
   * `watchedAt >= from && watchedAt < to` — half-open, which is the right shape and was
   * asserted nowhere. §6.76 flipped each comparison in turn and nothing failed, because
   * every fixture here is days from a boundary. On the Year in Review it decides which
   * side of midnight on New Year's Eve a watch is counted.
   */
  it('counts the first millisecond of a year and not the last of the one before', async () => {
    const start = new Date(2025, 0, 1).getTime();
    await db.watches.bulkAdd([ev({ watchedAt: start }), ev({ watchedAt: start - 1 })]);

    const s = await getSummary('year', { year: 2025, now: new Date(2026, 7, 1).getTime() });
    expect(s.episodes).toBe(1);
    expect(s.firstWatch).toBe(start);
  });

  it('and stops before the first millisecond of the next one', async () => {
    const end = new Date(2026, 0, 1).getTime();
    await db.watches.bulkAdd([ev({ watchedAt: end - 1 }), ev({ watchedAt: end })]);

    const s = await getSummary('year', { year: 2025, now: new Date(2026, 7, 1).getTime() });
    expect(s.episodes).toBe(1);
    expect(s.lastWatch).toBe(end - 1);
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

  /**
   * The phone's call, exactly as `mobile/app/stats.tsx` makes it.
   *
   * The clause above holds the two window functions; this one holds the summary, because
   * the defect was only ever visible from here — the screen calls `getSummary(window,
   * { year })` and reads four figures off the result. Written as the call site writes it
   * so that the guard fails on the phone's shape and not only on an argument list nothing
   * uses.
   */
  it('scopes a year handed to it beside a window, which is how the phone asks', async () => {
    await db.watches.bulkAdd([
      ev({ watchedAt: Date.parse('2025-06-01T00:00:00Z') }),
      ev({ watchedAt: Date.parse('2026-06-01T00:00:00Z') }),
      ev({ watchedAt: Date.parse('2026-07-01T00:00:00Z') }),
    ]);
    const now = Date.parse('2026-08-01T00:00:00Z');
    expect((await getSummary('ytd', { year: 2025, now })).episodes).toBe(1);
    expect((await getSummary('ytd', { year: 2026, now })).episodes).toBe(2);
    // And with no year, `ytd` is still this year — the state the picker starts in.
    expect((await getSummary('ytd', { now })).episodes).toBe(2);
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
    // The two places the unit changes. Every case above is comfortably inside one of
    // them, so §6.76 could move either boundary by a whole unit unnoticed — an hour of
    // television reading as "60m", a day as "24h".
    [59, '59m'],
    [60, '1.0h'],
    [1439, '24h'],
    [1440, '1.0 days'],
  ])('formats %i minutes as %s', (mins, expected) => {
    expect(formatDuration(mins)).toBe(expected);
  });
});
