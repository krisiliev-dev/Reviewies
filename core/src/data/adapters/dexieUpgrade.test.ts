import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { ReviewiesDB } from './dexie.ts';

/**
 * The same question as `sqliteUpgrade.test.ts`, on the browser store.
 *
 * Dexie migrates declaratively, so the risk here is lower than on SQLite — but "lower"
 * had never been distinguished from "nil", because nothing had opened a database written
 * by an earlier version. The versions are declared in `dexie.ts` and the upgrade runs on
 * open; what follows is that upgrade running, with somebody's history in the file.
 */

let counter = 0;
const freshName = () => `reviewies-upgrade-${process.pid}-${counter++}`;

/** The database as version 1 declared it, before the anime cache and the outbox. */
async function openV1(name: string): Promise<Dexie> {
  const db = new Dexie(name);
  db.version(1).stores({
    library: 'titleId, kind, status, addedAt',
    watches: 'id, targetId, seriesId, watchedAt',
    ratings: 'targetId, ratedAt',
    watchlist: 'titleId, kind, addedAt',
    reactions: 'id, targetId, tMs, [targetId+tMs]',
    titles: 'id, kind, fetchedAt',
    episodes: 'id, seriesId, [seriesId+season], fetchedAt',
    providers: 'id, fetchedAt',
  });
  await db.open();
  return db;
}

/**
 * The whole suite also runs against SQLite (`npm run test:sqlite`), where there is no
 * IndexedDB at all — this file is about the browser store specifically, and the SQLite
 * store's own upgrade is covered next door in `sqliteUpgrade.test.ts`.
 */
describe.skipIf(typeof indexedDB === 'undefined')('opening a version 1 database with the current code', () => {
  it('keeps every row somebody had', async () => {
    const name = freshName();
    const old = await openV1(name);
    await old.table('library').put({ titleId: 'tmdb:1', kind: 'show', status: 'watching', addedAt: 1 });
    await old.table('watches').put({ id: 'w1', targetId: 'tmdb:ep:1', seriesId: 'tmdb:1', watchedAt: 2 });
    await old.table('ratings').put({ targetId: 'tmdb:1', stars: 4, ratedAt: 3 });
    await old.table('watchlist').put({ titleId: 'tmdb:2', kind: 'film', addedAt: 4 });
    await old.table('reactions').put({ id: 'r1', targetId: 'tmdb:ep:1', tMs: 500, emoji: '😀', createdAt: 5 });
    old.close();

    const db = new ReviewiesDB(name);
    await db.open();
    try {
      expect(await db.library.count()).toBe(1);
      expect(await db.watches.count()).toBe(1);
      expect(await db.ratings.count()).toBe(1);
      expect(await db.watchlist.count()).toBe(1);
      expect(await db.reactions.count()).toBe(1);
      // The rescued history is the product's whole pitch to somebody arriving from a
      // dead app; losing it on an upgrade would be the worst failure available.
      expect((await db.watches.get('w1'))?.seriesId).toBe('tmdb:1');
    } finally {
      db.close();
      await Dexie.delete(name);
    }
  });

  it('has the tables and indexes the later versions added', async () => {
    const name = freshName();
    (await openV1(name)).close();

    const db = new ReviewiesDB(name);
    await db.open();
    try {
      expect(db.verno).toBe(3);
      await db.animeIds.put({ id: 'anilist:1', ids: { tmdb: 1 }, fetchedAt: 1 });
      await db.outbox.put({ key: 'watches:w1', table: 'watches', updatedAt: 2 });
      await db.syncState.put({ key: 'cursor', value: 3 });

      // Queried through the index rather than by primary key: an upgrade that created
      // the table without its indexes would pass a `get` and fail the app.
      expect(await db.outbox.where('table').equals('watches').count()).toBe(1);
      expect((await db.syncState.get('cursor'))?.value).toBe(3);
    } finally {
      db.close();
      await Dexie.delete(name);
    }
  });

  it('still answers the queries the screens make', async () => {
    const name = freshName();
    const old = await openV1(name);
    await old.table('library').put({ titleId: 'tmdb:1', kind: 'show', status: 'watching', addedAt: 1 });
    await old.table('library').put({ titleId: 'tmdb:2', kind: 'show', status: 'completed', addedAt: 2 });
    await old.table('reactions').put({ id: 'r1', targetId: 'tmdb:ep:1', tMs: 500, emoji: '😀', createdAt: 5 });
    old.close();

    const db = new ReviewiesDB(name);
    await db.open();
    try {
      // Up Next asks exactly this, and it is the first thing anybody sees.
      const watching = await db.library.where('status').equals('watching').toArray();
      expect(watching.map((r) => r.titleId)).toEqual(['tmdb:1']);
      // Watching Mode asks for one episode's reactions by the compound index.
      const at = await db.reactions.where('[targetId+tMs]').between(['tmdb:ep:1', 0], ['tmdb:ep:1', 1000]).toArray();
      expect(at).toHaveLength(1);
    } finally {
      db.close();
      await Dexie.delete(name);
    }
  });
});
