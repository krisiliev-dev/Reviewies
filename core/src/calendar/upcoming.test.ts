import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db.ts';
import { classify, getUpcoming, groupByDay, shouldNotify } from './upcoming.ts';
import type { CachedEpisode } from '../domain/types.ts';

const DAY = 86_400_000;

const ep = (season: number, number: number, over: Partial<CachedEpisode> = {}): CachedEpisode => ({
  id: `tmdb:ep:s${season}e${number}`,
  seriesId: 'tmdb:tv:1',
  season,
  number,
  name: `Episode ${number}`,
  fetchedAt: Date.now(),
  ...over,
});

describe('classification', () => {
  const twoSeasons = [ep(1, 1), ep(1, 2), ep(1, 3), ep(2, 1), ep(2, 2)];

  it('marks the first episode of a season a premiere', () => {
    expect(classify(ep(1, 1), twoSeasons)).toBe('premiere');
    expect(classify(ep(2, 1), twoSeasons)).toBe('premiere');
  });

  it('marks the last episode of a non-final season a season finale', () => {
    expect(classify(ep(1, 3), twoSeasons)).toBe('finale');
  });

  it('marks the last episode of the last season a series finale', () => {
    // Needs whole-series context, not just the season.
    expect(classify(ep(2, 2), twoSeasons)).toBe('series-finale');
  });

  it('treats middle episodes as regular', () => {
    expect(classify(ep(1, 2), twoSeasons)).toBe('regular');
  });

  it('never treats a special as a milestone', () => {
    // A Christmas special is not a premiere.
    const withSpecial = [...twoSeasons, ep(0, 1)];
    expect(classify(ep(0, 1), withSpecial)).toBe('regular');
  });

  it('calls a single-episode season a finale rather than a premiere', () => {
    const oneOff = [ep(1, 1)];
    expect(classify(ep(1, 1), oneOff)).toBe('series-finale');
  });

  it('handles non-contiguous episode numbers', () => {
    const odd = [ep(1, 3), ep(1, 7), ep(1, 11)];
    expect(classify(ep(1, 3), odd)).toBe('premiere');
    expect(classify(ep(1, 11), odd)).toBe('series-finale');
  });

  it('falls back to regular with no context', () => {
    expect(classify(ep(1, 1), [])).toBe('regular');
  });
});

describe('notification preference', () => {
  it('sends nothing when off', () => {
    expect(shouldNotify('premiere', 'off')).toBe(false);
    expect(shouldNotify('series-finale', 'off')).toBe(false);
  });

  it('sends only milestones on the default setting', () => {
    // The Trakt request verbatim: premieres and finales, not every episode.
    expect(shouldNotify('premiere', 'milestones')).toBe(true);
    expect(shouldNotify('finale', 'milestones')).toBe(true);
    expect(shouldNotify('series-finale', 'milestones')).toBe(true);
    expect(shouldNotify('regular', 'milestones')).toBe(false);
  });

  it('sends everything when asked to', () => {
    expect(shouldNotify('regular', 'all')).toBe(true);
  });
});

describe('upcoming feed', () => {
  const now = Date.parse('2026-08-24T12:00:00Z');
  const dateAt = (offsetDays: number) =>
    new Date(now + offsetDays * DAY).toISOString().slice(0, 10);

  beforeEach(async () => {
    await Promise.all([db.library.clear(), db.episodes.clear(), db.titles.clear()]);
    await db.titles.put({
      id: 'tmdb:tv:1',
      kind: 'show',
      name: 'The Long Dark',
      fetchedAt: Date.now(),
    });
    await db.library.add({
      titleId: 'tmdb:tv:1',
      kind: 'show',
      status: 'watching',
      addedAt: 1,
    });
  });

  it('includes episodes airing within the window', async () => {
    await db.episodes.bulkPut([ep(1, 1, { airDate: dateAt(3) })]);
    expect(await getUpcoming(30, now)).toHaveLength(1);
  });

  it('excludes episodes that already aired', async () => {
    await db.episodes.bulkPut([ep(1, 1, { airDate: dateAt(-5) })]);
    expect(await getUpcoming(30, now)).toHaveLength(0);
  });

  it('excludes episodes beyond the window', async () => {
    await db.episodes.bulkPut([ep(1, 1, { airDate: dateAt(90) })]);
    expect(await getUpcoming(30, now)).toHaveLength(0);
  });

  it('excludes shows you paused or dropped', async () => {
    // Being reminded about something you deliberately stopped is the noise
    // people complain about.
    await db.library.update('tmdb:tv:1', { status: 'dropped' });
    await db.episodes.bulkPut([ep(1, 1, { airDate: dateAt(3) })]);
    expect(await getUpcoming(30, now)).toHaveLength(0);
  });

  it('ignores episodes with no air date', async () => {
    await db.episodes.bulkPut([ep(1, 1, { airDate: undefined })]);
    expect(await getUpcoming(30, now)).toHaveLength(0);
  });

  it('sorts by air date', async () => {
    await db.episodes.bulkPut([
      ep(1, 2, { airDate: dateAt(10) }),
      ep(1, 1, { airDate: dateAt(2) }),
    ]);
    const upcoming = await getUpcoming(30, now);
    expect(upcoming.map((u) => u.episode.number)).toEqual([1, 2]);
  });

  it('classifies entries and resolves the series name', async () => {
    await db.episodes.bulkPut([
      ep(1, 1, { airDate: dateAt(2) }),
      ep(1, 2, { airDate: dateAt(9) }),
    ]);
    const upcoming = await getUpcoming(30, now);
    expect(upcoming[0].kind).toBe('premiere');
    expect(upcoming[0].seriesName).toBe('The Long Dark');
    expect(upcoming[1].kind).toBe('series-finale');
  });
});

describe('grouping', () => {
  it('groups by day in chronological order', () => {
    const entry = (day: string) =>
      ({ day, episode: ep(1, 1), seriesId: 'x', seriesName: 'x', kind: 'regular' }) as never;
    const grouped = groupByDay([entry('2026-09-02'), entry('2026-09-01'), entry('2026-09-02')]);
    expect(grouped.map(([day]) => day)).toEqual(['2026-09-01', '2026-09-02']);
    expect(grouped[1][1]).toHaveLength(2);
  });

  it('handles an empty list', () => {
    expect(groupByDay([])).toEqual([]);
  });
});
