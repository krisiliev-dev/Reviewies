import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { db } from './db.ts';
import { addToLibrary, getUpNext, stopTracking } from './repo.ts';
import { alreadyHave, shelfFor, shelfOf } from './already.ts';
import { resetSyncState } from '../sync/engine.ts';
import { makeId } from '../domain/types.ts';
import type { LibraryStatus } from '../domain/types.ts';

/**
 * Stopping, which for the life of this product could not be done.
 *
 * `LibraryStatus` has carried four values since the schema was written. `Track` writes
 * `watching` and Discover's *seen it* writes `completed`; nothing on either platform,
 * on any screen, ever wrote `paused` or `dropped`. Three readers honoured them anyway —
 * `syncSeriesStatus` skips them with the comment *"Those are decisions the user made,
 * and overriding them is not housekeeping"*, `getUpNext` asks only for `watching`, and
 * `calendar/refresh.ts` filters to `watching` or `completed`.
 *
 * So the data layer was written correctly around a decision the interface gave nobody a
 * way to make. The title page's button disabled itself, read **Tracking**, and stayed
 * that way for the life of the row: a title could enter the library and never leave it.
 *
 * These are the clauses that would have caught it, and the last one is the general shape:
 * a value in a union with readers and no writer is a feature nobody can reach.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

const TITLE = makeId('tmdb', 'tv', 1);

const outbox = () =>
  db.outbox as unknown as import('./store.ts').Table<{
    key: string;
    deleted: boolean;
    row: Record<string, unknown>;
  }>;

beforeEach(async () => {
  resetSyncState();
  await Promise.all([
    db.library.clear(),
    db.watchlist.clear(),
    db.titles.clear(),
    db.episodes.clear(),
    db.watches.clear(),
    outbox().clear(),
  ]);
});

describe('stopping a show', () => {
  it('leaves the row behind at dropped rather than deleting it', async () => {
    await addToLibrary(TITLE, 'show');
    await stopTracking(TITLE);
    const row = await db.library.get(TITLE);
    expect(row).toBeDefined();
    expect(row?.status).toBe('dropped');
  });

  /*
   * The row is what `alreadyHave` and `recommend` read to know you have met this show
   * before. Deleting it would answer *"I have never seen this"*, which is not true, and
   * would put the show back in Discover's feed to be suggested at you again.
   */
  it('keeps addedAt, so the row still remembers when you met it', async () => {
    await addToLibrary(TITLE, 'show');
    const before = (await db.library.get(TITLE))?.addedAt;
    await stopTracking(TITLE);
    expect((await db.library.get(TITLE))?.addedAt).toBe(before);
  });

  /*
   * A watch is an event keyed by `targetId` and does not live in the library row. The
   * screen's own comment used to defer this decision on exactly this ground — *"inventing
   * one on the screen that would need to explain what happens to your watch history is a
   * bigger decision than this one"*. Nothing happens to it, and this is where that is
   * checked rather than asserted.
   */
  it('does not touch the history', async () => {
    await addToLibrary(TITLE, 'show');
    await db.watches.add({
      id: 'w1',
      targetId: makeId('tmdb', 'tv', 1),
      seriesId: TITLE,
      watchedAt: 1,
    } as never);
    await stopTracking(TITLE);
    expect(await db.watches.count()).toBe(1);
  });

  /*
   * A row written locally and never queued exists on one device and no other. `watchlist.
   * test.ts`'s header is the long version; this is the same requirement for a writer that
   * did not exist when that was written.
   */
  it('reaches the outbox, so a second device stops it too', async () => {
    await addToLibrary(TITLE, 'show');
    await stopTracking(TITLE);
    const queued = await outbox().get(`library:${TITLE}`);
    expect(queued?.row).toMatchObject({ status: 'dropped' });
  });

  /*
   * The reversibility the title page depends on. `addToLibrary` on an existing row is an
   * `update`, so the same button that stopped it starts it again — which is why the screen
   * has one control with two faces rather than two controls, and why there is no
   * confirmation dialog in front of it.
   */
  it('is undone by the same press that started it', async () => {
    await addToLibrary(TITLE, 'show');
    await stopTracking(TITLE);
    await addToLibrary(TITLE, 'show');
    expect((await db.library.get(TITLE))?.status).toBe('watching');
  });

  it('takes the show out of Up Next while it is stopped', async () => {
    await db.titles.add({ id: TITLE, kind: 'show', name: 'The Long Dark', fetchedAt: 1 } as never);
    await db.episodes.add({
      id: makeId('tmdb', 'tv', 2),
      seriesId: TITLE,
      season: 1,
      number: 1,
      name: 'One',
      airDate: '2000-01-01',
    } as never);
    await addToLibrary(TITLE, 'show');
    expect((await getUpNext()).length).toBe(1);
    await stopTracking(TITLE);
    expect(await getUpNext()).toEqual([]);
  });
});

describe('which shelf a stopped show is on', () => {
  it('is not the library, so the button offers the way back in', () => {
    expect(shelfOf({ status: 'dropped' }, undefined)).toBe(undefined);
  });

  it('is still the library when paused, which means not right now', () => {
    expect(shelfOf({ status: 'paused' }, undefined)).toBe('library');
  });

  it('is the library for the two statuses the product writes', () => {
    expect(shelfOf({ status: 'watching' }, undefined)).toBe('library');
    expect(shelfOf({ status: 'completed' }, undefined)).toBe('library');
  });

  /*
   * A dropped title that is also on the watchlist falls through rather than answering
   * `undefined`: you stopped watching it and you still mean to, and both are true.
   */
  it('falls through to the watchlist when a stopped show is also saved', () => {
    expect(shelfOf({ status: 'dropped' }, { titleId: TITLE })).toBe('watchlist');
  });

  it('stops Search labelling a stopped show Tracking', async () => {
    await db.titles.add({ id: TITLE, kind: 'show', name: 'The Long Dark', fetchedAt: 1 } as never);
    await addToLibrary(TITLE, 'show');
    expect(shelfFor({ id: TITLE, name: 'The Long Dark' }, await alreadyHave())).toBe('library');
    await stopTracking(TITLE);
    expect(shelfFor({ id: TITLE, name: 'The Long Dark' }, await alreadyHave())).toBe(undefined);
  });
});

/**
 * The general shape, which is the clause worth keeping.
 *
 * The defect was not that `stopTracking` was missing. It was that `dropped` had three
 * readers and no writer for the whole life of the product, and nothing anywhere could
 * say so. A union value the code branches on and nothing can produce is a branch that has
 * never run and a feature nobody can reach — and it reads, in review, exactly like a
 * feature that works.
 *
 * Every `LibraryStatus` value must be written by something outside a test. `watching` and
 * `completed` come from `addToLibrary`'s default and Discover's argument; `dropped` from
 * `stopTracking`. **`paused` has no writer and this clause names it**, which is the honest
 * state: the readers were written for a pause the interface does not offer, and the
 * decision about what a pause means to somebody — as against a stop — has not been taken.
 * When it is, this list loses its exception.
 */
describe('every status a reader branches on', () => {
  const WRITERS = read('core/src/data/repo.ts') + read('app/src/screens/Discover.tsx');

  /** Named, not silent. Removing a name here without adding a writer fails the clause. */
  const NO_WRITER_YET: LibraryStatus[] = ['paused'];

  const ALL: LibraryStatus[] = ['watching', 'completed', 'paused', 'dropped'];

  it('is either written somewhere or named here as unreachable', () => {
    const unwritten = ALL.filter((s) => !new RegExp(`status: '${s}'|'${s}'\\s*\\)`).test(WRITERS));
    expect(unwritten.sort()).toEqual([...NO_WRITER_YET].sort());
  });

  /*
   * And the mirror, so the exception list cannot outlive its reason: a status listed as
   * unreachable that something *does* write is a stale excuse, which is §6.106's subject.
   */
  it('does not name a status that has since gained a writer', () => {
    for (const status of NO_WRITER_YET) {
      expect(new RegExp(`status: '${status}'`).test(WRITERS)).toBe(false);
    }
  });
});
