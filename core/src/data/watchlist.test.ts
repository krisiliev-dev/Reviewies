import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db.ts';
import { addToWatchlist, removeFromWatchlist, setWatchlistNote } from './repo.ts';
import { resetSyncState } from '../sync/engine.ts';
import { makeId } from '../domain/types.ts';

/**
 * The watchlist, which nothing had ever executed.
 *
 * Found by measuring rather than by reading: §6.68 ran coverage across every workspace
 * for the first time and `addToWatchlist`, `setWatchlistNote` and `removeFromWatchlist`
 * came back with zero calls. They are three of the plainest functions in the product —
 * no session, no network, no browser — and they sit under a headline feature, which is
 * exactly the combination that makes something feel too obvious to test.
 *
 * What they must do is not obvious at all. Every one of them has to reach the outbox as
 * well as the table: a row written locally and never queued exists on one device and no
 * other (§6.68's ancestor, doc 9 §6.30), and a delete that skips the outbox is worse —
 * the next pull puts it straight back, which is the bug `clearRating` was fixed for.
 */

const TITLE = makeId('tmdb', 'tv', 1);

const outbox = () =>
  db.outbox as unknown as import('./store.ts').Table<{
    key: string;
    deleted: boolean;
    row: Record<string, unknown>;
  }>;

beforeEach(async () => {
  await resetSyncState();
  await db.watchlist.clear();
});

describe('putting something on the watchlist', () => {
  it('writes the row', async () => {
    await addToWatchlist(TITLE, 'show');
    expect(await db.watchlist.get(TITLE)).toMatchObject({ titleId: TITLE, kind: 'show' });
  });

  it('queues it for the server', async () => {
    await addToWatchlist(TITLE, 'show');
    expect(await outbox().get(`watchlist:${TITLE}`)).toMatchObject({ deleted: false });
  });

  it('keeps a note if one was given', async () => {
    await addToWatchlist(TITLE, 'film', 'recommended by Sam');
    expect((await db.watchlist.get(TITLE))?.note).toBe('recommended by Sam');
  });

  it('records when it was added, so the list can be ordered', async () => {
    await addToWatchlist(TITLE, 'show');
    const added = (await db.watchlist.get(TITLE))?.addedAt;
    expect(typeof added).toBe('number');
    expect(Math.abs((added as number) - Date.now())).toBeLessThan(60_000);
  });

  it('adding twice leaves one row rather than two', async () => {
    await addToWatchlist(TITLE, 'show');
    await addToWatchlist(TITLE, 'show');
    expect(await db.watchlist.toArray()).toHaveLength(1);
  });
});

describe('a note added afterwards', () => {
  it('is kept', async () => {
    await addToWatchlist(TITLE, 'show');
    await setWatchlistNote(TITLE, 'season 2 first');
    expect((await db.watchlist.get(TITLE))?.note).toBe('season 2 first');
  });

  it('reaches the server with the rest of the row, not on its own', async () => {
    // The whole row, because the server upserts: queueing `{ titleId, note }` alone
    // would arrive as a row whose kind and addedAt are missing.
    await addToWatchlist(TITLE, 'film');
    await setWatchlistNote(TITLE, 'season 2 first');
    const queued = await outbox().get(`watchlist:${TITLE}`);
    expect(queued?.row).toMatchObject({ titleId: TITLE, kind: 'film', note: 'season 2 first' });
  });

  it('does nothing at all for a title that is not on the list', async () => {
    // Rather than queueing a half-row for something the server has never heard of.
    await setWatchlistNote(TITLE, 'orphan');
    expect(await db.watchlist.get(TITLE)).toBeUndefined();
    expect(await outbox().get(`watchlist:${TITLE}`)).toBeUndefined();
  });
});

describe('taking something off the watchlist', () => {
  it('removes the row', async () => {
    await addToWatchlist(TITLE, 'show');
    await removeFromWatchlist(TITLE);
    expect(await db.watchlist.get(TITLE)).toBeUndefined();
  });

  it('tells the server, rather than letting the next pull put it back', async () => {
    // This is the `clearRating` bug: a delete that only happens locally looks like it
    // worked and then quietly undoes itself on the next sync.
    await addToWatchlist(TITLE, 'show');
    await removeFromWatchlist(TITLE);
    expect(await outbox().get(`watchlist:${TITLE}`)).toMatchObject({ deleted: true });
  });

  it('supersedes the add that is still queued, rather than sending both', async () => {
    await addToWatchlist(TITLE, 'show');
    await removeFromWatchlist(TITLE);
    const entries = await outbox().toArray();
    expect(entries.filter((e) => e.key === `watchlist:${TITLE}`)).toHaveLength(1);
  });
});
