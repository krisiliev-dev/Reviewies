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
