import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db.ts';
import { markWatched, rate } from '../data/repo.ts';

/**
 * A local write and its queue entry: both, or neither.
 *
 * Every syncable change in the product is a pair, and the local half goes first so the
 * interface never waits on the queue. Eleven sites did that as two bare `await`s. §6.155
 * took the tab away in between — in a real browser, on the tap the whole product is built
 * around — and **9 of 18 runs left the watch with no queue entry**. That is not a lost
 * write. It is an episode marked on one device for ever, with nothing in the product that
 * could show you: the outbox is the only record that a row still needs sending, so a row
 * missing from it is a row already sent, as far as anything here can tell.
 *
 * `app/smoke.mjs` holds the browser half and `writes.test.ts` holds the source half. This
 * is the one that says what the *mechanism* does when the second write fails, on both
 * stores, without needing a race to reproduce it.
 */

/** The outbox, broken. A queue entry that cannot be written is the second half failing. */
let restore: (() => void) | undefined;
function breakTheOutbox(): void {
  const table = db.outbox as unknown as { put: (row: unknown) => Promise<unknown> };
  const real = table.put.bind(table);
  table.put = () => Promise.reject(new Error('the queue is gone'));
  restore = () => {
    table.put = real;
  };
}

beforeEach(async () => {
  await Promise.all([db.watches.clear(), db.ratings.clear(), db.outbox.clear()]);
});

afterEach(() => {
  restore?.();
  restore = undefined;
});

describe('a syncable write whose queue entry fails', () => {
  it('leaves no rating behind', async () => {
    breakTheOutbox();
    await expect(rate('tmdb:tv:1', 4)).rejects.toThrow();
    expect(await db.ratings.get('tmdb:tv:1'), 'a rating nothing will ever send').toBeUndefined();
  });

  it('leaves no watch behind', async () => {
    /*
     * The one that matters most. A watch is the product: it is what Up Next reads, what
     * Stats counts, and the only thing a second device is really there for.
     */
    breakTheOutbox();
    await expect(markWatched({ targetId: 'tmdb:ep:1', seriesId: 'tmdb:tv:1' })).rejects.toThrow();
    expect(await db.watches.toArray(), 'a watch nothing will ever send').toEqual([]);
  });

  it('and both land when the queue works, which is what makes the two above mean something', () => {
    // Non-vacuity: an assertion that a table is empty passes beautifully against a
    // function that never wrote anything. §6.121.
    return (async () => {
      await markWatched({ targetId: 'tmdb:ep:2', seriesId: 'tmdb:tv:1' });
      expect(await db.watches.toArray()).toHaveLength(1);
      expect(await db.outbox.toArray()).toHaveLength(1);
    })();
  });
});
