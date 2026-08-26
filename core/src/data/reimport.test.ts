import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db.ts';
import {
  exportAll,
  importBundle,
  importWatchHistoryCsv,
  type ExportBundle,
} from './transfer.ts';
import { addToWatchlist, markWatched, rate } from './repo.ts';
import { resetSyncState } from '../sync/engine.ts';

/**
 * Importing the same file twice.
 *
 * Every import check in this repository imports once. Doing it twice is not an odd
 * thing to do — a first attempt that failed part-way, a file dropped on the screen
 * again because nothing obviously happened, somebody restoring the same backup onto a
 * second device and then back — and this is a product whose whole pitch is rescuing
 * histories that somebody else deleted. Doubling one is the worst thing it could do
 * quietly. §6.70.
 */

beforeEach(async () => {
  await resetSyncState();
  await Promise.all([
    db.watches.clear(),
    db.ratings.clear(),
    db.watchlist.clear(),
    db.library.clear(),
    db.reactions.clear(),
  ]);
});

describe('a watch history CSV', () => {
  const dated = 'series,season,episode,watched_at\nThe Long Dark,1,1,2026-01-02\nThe Long Dark,1,2,2026-01-03\n';
  const undated = 'series,season,episode\nThe Long Dark,1,1\nThe Long Dark,1,2\n';

  it('lands once when it carries dates', async () => {
    await importWatchHistoryCsv(dated);
    await importWatchHistoryCsv(dated);
    expect(await db.watches.count()).toBe(2);
  });

  it('lands once when it does not', async () => {
    // The id was `${targetId}@${watchedAt}` and `watchedAt` falls back to `Date.now()`,
    // so an undated file produced a fresh set of ids every time: two watches, then
    // four, then six.
    await importWatchHistoryCsv(undated);
    await new Promise((r) => setTimeout(r, 5));
    await importWatchHistoryCsv(undated);
    expect(await db.watches.count()).toBe(2);
  });

  it('and a third time changes nothing either', async () => {
    await importWatchHistoryCsv(undated);
    await new Promise((r) => setTimeout(r, 5));
    await importWatchHistoryCsv(undated);
    await new Promise((r) => setTimeout(r, 5));
    await importWatchHistoryCsv(undated);
    expect(await db.watches.count()).toBe(2);
  });

  it('still tells two undated watches of the same episode apart', async () => {
    // A rewatch we cannot date is still a rewatch. Collapsing them would be a different
    // kind of wrong from doubling them.
    await importWatchHistoryCsv('series,season,episode\nThe Long Dark,1,1\nThe Long Dark,1,1\n');
    expect(await db.watches.count()).toBe(2);
  });

  it('queues what it wrote, not more of it', async () => {
    const outbox = db.outbox as unknown as import('./store.ts').Table<{ key: string }>;
    await importWatchHistoryCsv(undated);
    await importWatchHistoryCsv(undated);
    expect(await outbox.count()).toBe(2);
  });
});

describe('a Reviewies export', () => {
  async function seedAndExport(): Promise<ExportBundle> {
    await markWatched({ targetId: 'tmdb:ep:1', seriesId: 'tmdb:tv:1' });
    await rate('tmdb:tv:1', 4);
    await addToWatchlist('tmdb:tv:2', 'show');
    return exportAll();
  }

  it('restores to the same library however many times it is applied', async () => {
    // Rows carry their own ids and `bulkPut` overwrites, so this was already right —
    // recorded because "already right" is worth knowing as precisely as a bug is.
    const bundle = await seedAndExport();
    await importBundle(bundle);
    await importBundle(bundle);

    expect(await db.watches.count()).toBe(1);
    expect(await db.ratings.count()).toBe(1);
    expect(await db.watchlist.count()).toBe(1);
  });

  it('restores onto a device that already has it without duplicating anything', async () => {
    const bundle = await seedAndExport();
    await importBundle(bundle);
    expect(await db.watches.count()).toBe(1);
  });
});
