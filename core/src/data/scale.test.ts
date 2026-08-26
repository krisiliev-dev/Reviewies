import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from './db.ts';
import { getStats, getUpNext, markWatched, watchedEpisodeIds } from './repo.ts';
import { enqueueAll, pendingCount } from '../sync/engine.ts';
import { getUpcoming } from '../calendar/upcoming.ts';
import { availableYears, getSummary } from '../stats/compute.ts';
import { excludedTitleIds, seedTitles } from '../discover/recommend.ts';


/**
 * The app with a real library in it.
 *
 * Everything else here runs against a handful of rows, which is not what the product is
 * for: the pitch is to somebody leaving a tracker they used for years, arriving with two
 * hundred shows and a decade of history. Nothing had ever opened it with that in it, so
 * every claim about it being quick was a claim about ten rows.
 *
 * This is the same suite on both stores — Dexie under `npm test`, SQLite under
 * `npm run test:sqlite` — which is the interesting part: the SQLite adapter falls back to
 * `json_extract` for any sort on a field that is not a real column, and that had never
 * been timed against anything large enough to notice.
 *
 * The budgets are deliberately loose. A container's timings say nothing exact about a
 * phone, and a tight budget here would fail on a busy CI box rather than on a regression.
 * What they catch is the shape of a mistake — a query that went from indexed to scanning,
 * or from one round trip per show to one per episode — which shows up as an order of
 * magnitude, not as fifty milliseconds.
 */

const SHOWS = Number(process.env.SCALE_SHOWS ?? 120);
const SEASONS = Number(process.env.SCALE_SEASONS ?? 4);
const PER_SEASON = 12;
const EPISODES = SHOWS * SEASONS * PER_SEASON;
/** Roughly two thirds watched, which is what a long-running library looks like. */
const WATCHED_FRACTION = 0.66;
const REACTIONS = 2000;

const YEAR = 365 * 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 0, 15);

/**
 * Timings are collected and reported together at the end rather than logged as they
 * happen: vitest swallows console output from a jsdom environment, and a measurement
 * nobody can read is not a measurement. `SCALE_REPORT=1` prints the table.
 */
const timings: Array<[string, number]> = [];

const took = async (label: string, work: () => Promise<unknown>): Promise<number> => {
  const started = performance.now();
  await work();
  const ms = performance.now() - started;
  timings.push([label, ms]);
  return ms;
};

describe('a library somebody has actually used', () => {
  beforeAll(async () => {
    const titles = [];
    const episodes = [];
    const library = [];
    const watches = [];

    for (let s = 0; s < SHOWS; s++) {
      const seriesId = `tmdb:${1000 + s}`;
      titles.push({
        id: seriesId,
        kind: 'show' as const,
        name: `Show Number ${s}`,
        year: 2005 + (s % 20),
        runtimeMin: 42,
        fetchedAt: NOW,
      });
      library.push({
        titleId: seriesId,
        kind: 'show' as const,
        // A real library is mostly things you are part-way through, with a tail of
        // finished and abandoned ones.
        status: (s % 5 === 0 ? 'completed' : s % 7 === 0 ? 'paused' : 'watching') as
          | 'completed'
          | 'paused'
          | 'watching',
        addedAt: NOW - (s % 10) * YEAR,
      });

      for (let season = 1; season <= SEASONS; season++) {
        for (let number = 1; number <= PER_SEASON; number++) {
          const index = (season - 1) * PER_SEASON + number;
          const id = `tmdb:ep:${s}:${season}:${number}`;
          // Spread across a decade, with the last season of some shows still to come —
          // Up Next has to exclude those, and Calendar has to find them.
          const airedAt = NOW - 10 * YEAR + index * 21 * 24 * 60 * 60 * 1000 + s * 3600_000;
          episodes.push({
            id,
            seriesId,
            season,
            number,
            name: `Episode ${number}`,
            airDate: new Date(airedAt).toISOString().slice(0, 10),
            runtimeMin: 42,
            fetchedAt: NOW,
          });

          if (index / (SEASONS * PER_SEASON) <= WATCHED_FRACTION) {
            watches.push({
              id: `w:${s}:${season}:${number}`,
              targetId: id,
              seriesId,
              watchedAt: airedAt + 86_400_000,
              runtimeMin: 42,
            });
          }
        }
      }
    }

    await db.titles.bulkPut(titles as never);
    await db.episodes.bulkPut(episodes as never);
    await db.library.bulkPut(library as never);
    await db.watches.bulkPut(watches as never);

    await db.reactions.bulkPut(
      Array.from({ length: REACTIONS }, (_, i) => ({
        id: `r${i}`,
        targetId: 'tmdb:ep:0:1:1',
        tMs: (i * 2_520_000) / REACTIONS,
        emoji: '😀',
        createdAt: NOW,
      })) as never,
    );

    console.log(
      `\n  seeded ${SHOWS} shows, ${EPISODES} episodes, ${watches.length} watches, ${REACTIONS} reactions`,
    );
  });

  afterAll(() => {
    if (!process.env.SCALE_REPORT) return;
    const lines = timings.map(([label, ms]) => `  ${label.padEnd(34)} ${ms.toFixed(0)}ms`);
    // Through stderr, which vitest does pass through.
    process.stderr.write(`\n[scale] ${SHOWS} shows, ${EPISODES} episodes\n${lines.join('\n')}\n`);
  });

  it('seeded what it says it seeded', async () => {
    // Non-vacuity: a budget met against an empty database is not a measurement.
    expect(await db.episodes.count()).toBe(EPISODES);
    expect(await db.watches.count()).toBeGreaterThan(3000);
  });

  it('opens the home screen quickly enough to feel instant', async () => {
    const ms = await took('getUpNext', () => getUpNext(NOW));
    const entries = await getUpNext(NOW);
    // It has to have done the work, not returned nothing quickly.
    expect(entries.length).toBeGreaterThan(50);
    expect(ms).toBeLessThan(4000);
  });

  it('answers each stats window', async () => {
    expect(await took('getStats(30d)', () => getStats('30d', NOW))).toBeLessThan(1500);
    expect(await took('getStats(ytd)', () => getStats('ytd', NOW))).toBeLessThan(1500);
    expect(await took('getStats(all)', () => getStats('all', NOW))).toBeLessThan(2000);
    expect((await getStats('all', NOW)).episodes).toBeGreaterThan(3000);
  });

  it('builds the summary the stats screen actually asks for', async () => {
    // `getStats` above is the small one; the screen calls `getSummary`, which reads
    // every watch event and computes streaks, a per-day tally and a top ten from it.
    // Measuring the cheap one and shipping the expensive one is how a screen ends up
    // sitting on "Loading…" with nothing in the suite to show for it.
    expect(await took('getSummary(ytd)', () => getSummary('ytd', { now: NOW }))).toBeLessThan(3000);
    expect(await took('getSummary(all)', () => getSummary('all', { now: NOW }))).toBeLessThan(4000);
    expect(await took('availableYears', availableYears)).toBeLessThan(2000);
    expect((await getSummary('all', { now: NOW })).episodes).toBeGreaterThan(3000);
  });

  it('finds what is coming', async () => {
    expect(await took('getUpcoming', () => getUpcoming(60, NOW))).toBeLessThan(3000);
  });

  it('excludes what you have seen, before suggesting anything', async () => {
    const ms = await took('excludedTitleIds', excludedTitleIds);
    expect((await excludedTitleIds()).size).toBeGreaterThan(100);
    expect(ms).toBeLessThan(2000);
    expect(await took('seedTitles', () => seedTitles())).toBeLessThan(2000);
  });

  it('reads one episode’s reactions, which Watching Mode does on every tick', async () => {
    // The query Watching Mode's live view makes, spelled as the screen spells it.
    const read = () => db.reactions.where('targetId').equals('tmdb:ep:0:1:1').toArray();
    const ms = await took('reactions for one episode', read);
    expect((await read()).length).toBe(REACTIONS);
    expect(ms).toBeLessThan(1500);
  });

  it('marks an episode watched, which has to feel instant', async () => {
    // The claim in `platform.ts` — write-ahead logging "is what makes marking an episode
    // feel instant" — had never been measured against a library with anything in it.
    // One mark is one write plus one outbox row; if it is reading the history to do it,
    // this is where that shows.
    const ms = await took('markWatched', () =>
      markWatched({ targetId: 'tmdb:ep:5:4:12', seriesId: 'tmdb:1005', runtimeMin: 42 }),
    );
    expect(ms).toBeLessThan(500);
  });

  it('queues an import into the outbox without a read per row twice over', async () => {
    // `enqueueAll` is deliberately sequential — each row reads the existing entry so a
    // stale write cannot clobber a newer one — and the import path sends thousands of
    // rows through it. Sequential is not the same as quadratic, and this is the check
    // that keeps it that way.
    const rows = Array.from({ length: 3000 }, (_, i) => ({
      id: `imported:${i}`,
      targetId: `tmdb:ep:imported:${i}`,
      seriesId: 'tmdb:1000',
      watchedAt: NOW,
    }));
    const ms = await took('enqueueAll (3000 rows)', () => enqueueAll('watches', rows));
    expect(await pendingCount()).toBeGreaterThan(2999);
    expect(ms).toBeLessThan(20_000);
    // The budget above is twenty seconds and vitest's default is five, so on a machine
    // running the three core configurations at once this was killed by the runner rather
    // than failed by its own measurement — a red that says "timed out" where the number
    // it is actually asserting was nowhere near breached. §6.75 hit it twice while
    // measuring something else entirely. The runner is told the same number the test is.
  }, 30_000);

  it('looks up one show’s watched episodes without reading everybody else’s', async () => {
    // The per-show query Up Next makes, on its own: if this is linear in the *whole*
    // history rather than in one show's, Up Next is quadratic and the number above only
    // hides it behind a loose budget.
    const ms = await took('watchedEpisodeIds', () => watchedEpisodeIds('tmdb:1000'));
    expect(ms).toBeLessThan(400);
  });
});
