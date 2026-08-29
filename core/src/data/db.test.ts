import { describe, expect, it } from 'vitest';
import { clearDatabase, db, setDatabase } from './db.ts';
import { createDexieDatabase } from './adapters/dexie.ts';
import { SqliteDatabase } from './adapters/sqlite.ts';
import { createSqlJsDriver } from '../test/sqlJsDriver.ts';

/**
 * The message somebody meets when the core is used before it is bound.
 *
 * It is the most important error in the codebase: every screen in both apps reads `db`,
 * and a core that has not been given a database can only fail at the first read. The
 * proxy turns that into a sentence naming the missing call and the property that
 * triggered it — and until §6.59 nothing had ever seen it.
 *
 * Which is how this file came to exist. `clearDatabase` sat on the guard's list of
 * exports nothing calls, excused as "only the suites that swap Dexie for SQLite between
 * files need it". They do not: they call `setDatabase`. The reason named a caller that
 * has never existed, in the same words as the function's own doc comment — two
 * statements agreeing with each other, neither checked. Rather than delete the seam,
 * this uses it for what it is actually good for.
 *
 * Vitest isolates module state per file, so unbinding here cannot reach another suite.
 * The rebinding below is for the rest of *this* file.
 */
const rebind = async () => {
  // Whichever store this run is using — the same suite runs twice, and neither branch
  // may be skipped, or half the runs would test nothing.
  if (typeof indexedDB !== 'undefined') setDatabase(createDexieDatabase('unbound-test'));
  else setDatabase(await SqliteDatabase.open(await createSqlJsDriver()));
};

describe('using the core before binding a database', () => {
  it('says which call is missing, and what was being read', () => {
    clearDatabase();
    expect(() => db.watches).toThrow(/has not been set up/);
    expect(() => db.watches).toThrow(/setDatabase\(\)/);
    // The property is in the message because "the database is not set up" without it
    // leaves somebody hunting for which of forty reads ran first.
    expect(() => db.library).toThrow(/"library"/);
  });

  it('works again once something binds one', async () => {
    clearDatabase();
    await rebind();
    expect(await db.watches.count()).toBe(0);
  });
});

/**
 * The traps beyond `get`, and the shipped defect that was hiding behind their absence.
 *
 * A method reached through a proxy runs with `this` bound to **the proxy**, so every
 * assignment an adapter makes to itself goes through a `set` trap. There was none, and
 * the default landed those writes on the empty target `{}` while the matching reads came
 * back through `get` from the untouched adapter.
 *
 * `SqliteDatabase` counts transaction depth in a field, for a reason its own comment
 * states: "the repository legitimately nests — `catchUpTo` writes inside a transaction
 * and each write enqueues — and SQLite has no nested BEGIN." The counter never counted,
 * so the nested call took the outermost branch, issued a second `BEGIN`, and the phone
 * threw **cannot start a transaction within a transaction**. On Dexie nesting is legal
 * and the same code path was fine, which is why the suite never saw it.
 *
 * These clauses run on both stores because the proxy is the same proxy; the second one
 * is the one a SQLite run would have failed.
 */
describe('the proxy in front of the bound database', () => {
  it('forwards a write to the bound object rather than keeping it', async () => {
    await rebind();
    // Not a field any adapter has: the question is only whether the assignment travels.
    (db as unknown as Record<string, unknown>).probeMarker = 'landed';
    expect('probeMarker' in db, 'has() does not reach the bound object').toBe(true);
    expect((db as unknown as Record<string, unknown>).probeMarker).toBe('landed');
    delete (db as unknown as Record<string, unknown>).probeMarker;
    expect('probeMarker' in db, 'deleteProperty does not reach the bound object').toBe(false);
  });

  it('lets a transaction nest, which the repository does', async () => {
    await rebind();
    await db.watches.clear();
    await db.transaction('rw', db.watches, async () => {
      await db.watches.put({
        id: 'nest-outer',
        targetId: 'tmdb:ep:nest-1',
        seriesId: 'tmdb:tv:nest',
        watchedAt: 1_700_000_000_001,
        source: 'manual',
      } as never);
      // The inner call is what `catchUpTo` does: a write inside a transaction that
      // enqueues, and the enqueue opens one of its own.
      await db.transaction('rw', db.watches, async () => {
        await db.watches.put({
          id: 'nest-inner',
          targetId: 'tmdb:ep:nest-2',
          seriesId: 'tmdb:tv:nest',
          watchedAt: 1_700_000_000_002,
          source: 'manual',
        } as never);
      });
    });
    // Both rows, and one commit: an inner transaction that committed on its own would
    // have taken the outer one's rows with it if the outer then failed.
    expect(await db.watches.count(), 'a nested transaction lost rows').toBe(2);
    await db.watches.clear();
  });
});
