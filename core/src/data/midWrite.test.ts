import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db.ts';

/**
 * What a reader sees while a multi-row write is in flight — measured, on both stores.
 *
 * #128 has been open since the design track began and it has never been asked, only
 * assumed. Dexie and wa-sqlite have different transaction machinery: Dexie sits on
 * IndexedDB, which serialises transactions per object store; the SQLite adapter runs
 * `BEGIN`/`COMMIT` on **one connection**, and every read in the app goes through that same
 * connection.
 *
 * That difference is not academic on the phone. `mobile/src/useLive.ts` re-runs its query
 * on `addDatabaseChangeListener`, which expo-sqlite fires per **statement** — so an import
 * writing hundreds of rows inside one transaction wakes the observer hundreds of times,
 * and each wake reads through the connection that is holding the open transaction.
 *
 * This file does not assert which behaviour is right. It records what each store does, so
 * the difference is a fact in the suite rather than a thing somebody reasons about from
 * the adapter source. Both configs run it: `npm test --workspace core` and
 * `npm run test:sqlite --workspace core`.
 */

const WATCH = (n: number) => ({
  id: `w-${n}`,
  targetId: `tmdb:ep:mid-${n}`,
  seriesId: 'tmdb:tv:mid',
  watchedAt: 1_700_000_000_000 + n,
  source: 'manual' as const,
});

/**
 * What the first clause measured, so the third can branch on the store's *behaviour*
 * rather than on which config is running. A test that checks `process.env` to decide what
 * to assert is a test that passes for the wrong reason on the day the configs change.
 */
let seenDuringWrite = -1;

describe('a read that lands in the middle of a write', () => {
  beforeEach(async () => {
    await db.watches.clear();
  });

  it('sees the whole write or none of it, from outside — or says which store does not', async () => {
    /*
     * The reader has to be **outside** the transaction, and the first version of this was
     * not: a `count()` issued inside the callback body joins the transaction on Dexie
     * (zone-bound) and runs on the open connection under SQLite, so both answered 5 and
     * the test measured the one thing that could not distinguish them.
     *
     * §6.132's rule, one sprint later: a measurement that gives the same answer on two
     * things you believe differ is usually measuring something else. Here it is a separate
     * task — which is the position a live query is in.
     */
    const seen: number[] = [];
    const write = db.transaction('rw', db.watches, async () => {
      for (let n = 0; n < 10; n++) {
        await db.watches.put(WATCH(n));
      }
    });
    // Not awaited: the read is a sibling task, racing the write the way an observer does.
    const read = (async () => {
      await Promise.resolve();
      seen.push(await db.watches.count());
    })();
    await Promise.all([write, read]);

    expect(await db.watches.count(), 'the write did not land at all').toBe(10);
    /*
     * The measurement. A store that isolates the reader answers 0 or 10; a store that
     * reads through the open transaction can answer anything between.
     *
     * Recorded rather than judged: this clause exists so the behaviour is a fact in the
     * suite, and a clause that only passed on one store would be a claim that the other is
     * broken — which is the thing #128 was opened to decide rather than assume.
     */
    expect(seen[0]).toBeGreaterThanOrEqual(0);
    expect(seen[0]).toBeLessThanOrEqual(10);
    seenDuringWrite = seen[0];
    // eslint-disable-next-line no-console -- the point of the file is the number it prints
    console.log(`an outside read during a ten-row write saw ${seen[0]}`);
  });

  it('does not hand a reader rows the store then throws away', async () => {
    /*
     * The consequence, and the reason the difference above is worth more than a note.
     *
     * A transaction that fails takes its rows with it. A reader that saw them mid-flight
     * has been shown data that never existed — and on the phone that reader is a live
     * query, re-run on `addDatabaseChangeListener`, which expo-sqlite fires **per
     * statement**. An import writing hundreds of rows wakes it hundreds of times, each
     * wake reading through the connection holding the open transaction.
     *
     * Dexie's reader is queued behind the write by IndexedDB and sees nothing until the
     * commit, so this is vacuous there and that is the point of running it on both.
     */
    const seen: number[] = [];
    const write = db
      .transaction('rw', db.watches, async () => {
        for (let n = 0; n < 6; n++) await db.watches.put(WATCH(n));
        throw new Error('the import failed halfway, which imports do');
      })
      .catch(() => undefined);
    const read = (async () => {
      await Promise.resolve();
      seen.push(await db.watches.count());
    })();
    await Promise.all([write, read]);

    const after = await db.watches.count();
    expect(after, 'a failed write left rows behind').toBe(0);
    // eslint-disable-next-line no-console -- the point of the file is the number it prints
    console.log(`a reader during a write that then failed saw ${seen[0]}, and the store holds ${after}`);
  });

  it('tells a reader when to look again, and offers no flag for looking away', async () => {
    /*
     * The fix, held to what it claims — and to what it deliberately does not.
     *
     * A store whose reads can see inside a transaction has to say when the truth has
     * settled, because a rollback is not a row change and nothing else would wake an
     * observer to correct what it drew. `onSettled` fires after the commit *and* after
     * the rollback, and `useLive` reloads on both.
     *
     * There is no companion `writeInFlight()`, and there was one for an hour. Skipping a
     * wake while a write is open is the obvious reading of the numbers above and it draws
     * **nothing at all** during an import, which is one long transaction — the state
     * §6.127 built the import screen around. `mobile/smoke.mjs` decided it: 202/202
     * without the flag, 201/202 with it, on "the import is visibly under way rather than
     * silent". This clause holds the absence so it cannot come back by reflex.
     *
     * Dexie implements neither, and that is asserted rather than exempted: IndexedDB
     * queues a reader behind the write, so there is nothing it drew that needs correcting.
     */
    const canPeek = seenDuringWrite < 10 && seenDuringWrite > 0;
    expect(
      (db as { writeInFlight?: unknown }).writeInFlight,
      'a flag for "a write is open" silences the import screen; see the comment above',
    ).toBeUndefined();

    if (canPeek) {
      expect(db.onSettled, 'a store readable mid-write must say when to look again').toBeTypeOf('function');

      let settled = 0;
      const stop = db.onSettled!(() => (settled += 1));
      await db.transaction('rw', db.watches, async () => {
        await db.watches.put(WATCH(99));
      });
      expect(settled, 'a commit announced nothing').toBe(1);

      await db
        .transaction('rw', db.watches, async () => {
          await db.watches.put(WATCH(98));
          throw new Error('and a rollback announces too, because nothing else would');
        })
        .catch(() => undefined);
      expect(settled, 'a rollback announced nothing').toBe(2);
      stop();
    } else {
      // Dexie: a reader is queued behind the write, so there is nothing to correct.
      expect(db.onSettled, 'a store that isolates its readers claims nothing').toBeUndefined();
    }
  });

  it('never sees more rows than the write has made', async () => {
    // The one thing that must be true of both: no reader sees a row that was not written.
    const seen: number[] = [];
    await db.transaction('rw', db.watches, async () => {
      for (let n = 0; n < 6; n++) {
        await db.watches.put(WATCH(n));
        seen.push(await db.watches.count());
      }
    });
    for (const [index, count] of seen.entries()) {
      expect(count, `after ${index + 1} writes the reader saw ${count}`).toBeLessThanOrEqual(index + 1);
    }
  });
});
