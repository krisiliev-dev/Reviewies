import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { db } from './db.ts';
import { addToLibrary, getUpNext, stopTracking } from './repo.ts';
import { alreadyHave, shelfFor, shelfOf } from './already.ts';
import { resetSyncState } from '../sync/engine.ts';
import { makeId, type LibraryStatus } from '../domain/types.ts';

/**
 * Stopping, which for the life of this product could not be done.
 *
 * `LibraryStatus` carried four values from the day the schema was written. `Track` writes
 * `watching` and Discover's *seen it* writes `completed`; nothing on either platform,
 * on any screen, ever wrote `paused` or `dropped`. Three readers honoured them anyway —
 * `syncSeriesStatus` skips them with the comment *"a decision the user made, and overriding
 * it is not housekeeping"*, `getUpNext` asks only for `watching`, and
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

  /*
   * The other two, which is now every status that is not `dropped`.
   *
   * There was a third case here — `paused`, deliberately `library` because it meant *not
   * right now* rather than *not any more*. The pause ruling took it out of the union: it never
   * had a writer, and the decision it was waiting on came back no. `domain/types.ts` has
   * the argument. `shelfOf` itself did not change, because it asks *not `dropped`* rather
   * than reciting the statuses that are the library.
   */
  it('is the library for the two statuses that are not a stop', () => {
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
 * `stopTracking`. **The exception list is empty now**, which is the state the version of
 * this comment before the pause ruling said it would reach: `paused` was the one name on it, the
 * decision it was waiting on has been taken, and the answer was that a pause is not worth
 * a third face on the title page's decision row. It left the union rather than staying as
 * a value nothing can produce — `domain/types.ts` carries the argument and names the one
 * thing that would reopen it.
 *
 * ## Two things this clause changed about how it reads the union
 *
 * **The list comes from a record rather than from four names typed here.** A hand-written
 * `LibraryStatus[]` is checked in one direction only: tsc rejects a value the union does
 * not have and says *nothing at all* about one it does. So this clause would have gone on
 * passing, green and silent, over a fifth status nobody had added to the array — an
 * instrument omitting its own subject, `agents.md` §9's whole table. `EVERY_STATUS` below
 * is a `Record<LibraryStatus, true>`, whose keys must be **exactly** the union's: one
 * missing and one extra are both build errors, so `LIBRARY_STATUSES` cannot fall behind the
 * type. Planted by adding a fifth value to the union — the pre-change clause compiled and
 * passed 13 of 13; this one does not build.
 *
 * It lives here and not beside the union because `coreWiring.test.ts` is right that a core
 * export nothing in the *product* reaches is dead weight — a list only a guard reads belongs
 * in the guard.
 *
 * ## What this still cannot see
 *
 * A writer is a string in a source file, so a `status: 'x'` inside a branch nothing can
 * reach satisfies the clause below exactly as a real writer does. That was true of the
 * version this replaces and is true of this one; it is named here rather than left for
 * somebody to discover, and what closes it is a control with a press behind it —
 * `app/src/wiring/decide.test.ts` is where that is asked for this row.
 *
 * **The writers are read from three files rather than two.** It was `repo.ts` and the
 * web's Discover, and the phone's Discover writes `completed` too — so deleting the web's
 * *seen it* would have failed this clause over a value that was still perfectly reachable,
 * which is `agents.md` §4's mirror: a guard that fails on a correct change is also wrong.
 */
describe('every status a reader branches on', () => {
  const WRITERS =
    read('core/src/data/repo.ts') +
    read('app/src/screens/Discover.tsx') +
    read('mobile/app/(tabs)/discover.tsx');

  /**
   * Every value the union has, at runtime, derived so it cannot disagree with the type.
   * See the note above for why it is a record and not an array, and why it is here.
   */
  const EVERY_STATUS: Record<LibraryStatus, true> = { watching: true, completed: true, dropped: true };
  const LIBRARY_STATUSES = Object.keys(EVERY_STATUS).sort() as LibraryStatus[];

  /** Named, not silent. Removing a name here without adding a writer fails the clause. */
  const NO_WRITER_YET: LibraryStatus[] = [];

  it('is either written somewhere or named here as unreachable', () => {
    const unwritten = LIBRARY_STATUSES.filter(
      (s) => !new RegExp(`status: '${s}'|'${s}'\\s*\\)`).test(WRITERS),
    );
    expect(unwritten.sort()).toEqual([...NO_WRITER_YET].sort());
  });

  /*
   * And the mirror, so the exception list cannot outlive its reason: a status listed as
   * unreachable that something *does* write is a stale excuse, which is §6.106's subject.
   * Empty today, and it stays a clause rather than being deleted with its last entry —
   * the next status to be added without a control is what it is for.
   */
  it('does not name a status that has since gained a writer', () => {
    for (const status of NO_WRITER_YET) {
      expect(new RegExp(`status: '${status}'`).test(WRITERS)).toBe(false);
    }
  });

  /**
   * And the half the union cannot enforce on its own: what the server will accept.
   *
   * `library.status` is a `text` column with a check constraint, and that constraint — not
   * this union — is the contract every client of this database shares. They agreed by hand
   * from `0001_init.sql` until `0015_library_status.sql` narrowed both. Nothing checked that they agreed, so
   * narrowing the type alone would have left it claiming a range the server still accepts,
   * and widening the constraint alone would have let a value in that no reader here
   * branches on. Either is the silent kind of defect.
   *
   * Read from the migration text, in filename order, taking the **last** definition —
   * which is what a database that has run all of them holds. The **named** constraint, not
   * any `check (status in …)`: `0001_init.sql` wrote its one inline and unnamed, and
   * `0015_library_status.sql` supersedes it under the name Postgres gave it, so reading the
   * name is what keeps this clause about `library` rather than about the next table that
   * grows a `status` column. A guard that fails on a correct change is also wrong.
   *
   * Two limits, said rather than left to be discovered. This reads what the files say, not
   * what any deployed database holds. And it trusts that the last *named* definition is the
   * effective one, which stops being true if somebody drops the name. What answers both is
   * `app/src/backend/schema.test.ts`: it applies these same files to real Postgres and has
   * a clause that a status outside this set raises 23514, so the constraint is enforced
   * there rather than merely spelled here.
   */
  it('accepts exactly the values the server does', () => {
    const dir = resolve(ROOT, 'supabase/migrations');
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => readFileSync(resolve(dir, f), 'utf8'))
      .join('\n');

    const found = [
      ...sql.matchAll(/library_status_check\s+check\s*\(\s*status in \(([^)]+)\)/g),
    ];
    // Non-vacuity: no match at all would leave the comparison below reading an empty list
    // and passing over nothing, which is `agents.md` §9's whole table.
    expect(
      found.length,
      'no named library status constraint found in the migrations',
    ).toBeGreaterThanOrEqual(1);

    const server = found[found.length - 1][1]
      .split(',')
      .map((value) => value.trim().replace(/^'|'$/g, ''))
      .sort();
    expect(server).toEqual([...LIBRARY_STATUSES].sort());
  });
});
