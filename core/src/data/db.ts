import type { Database } from './store';

/**
 * The database the core writes to, bound at startup by whichever app is running.
 *
 * This is a proxy rather than a function returning the database, and the reason is
 * worth stating: every call site in the core reads `db.watches.toArray()` and so does
 * every test. Making the core platform-agnostic should not require touching hundreds
 * of expressions and thousands of lines of tests — that would be a large, risky diff
 * whose only purpose was plumbing, and it would make the tests less trustworthy at
 * exactly the moment they matter most.
 *
 * So `db` stays a plain object to its callers, and forwards to whatever was bound.
 */
let bound: Database | undefined;

export function setDatabase(database: Database): void {
  bound = database;
}

/** Mainly for tests, which swap implementations between suites. */
export function clearDatabase(): void {
  bound = undefined;
}

export const db: Database = new Proxy({} as Database, {
  get(_target, property) {
    if (!bound) {
      throw new Error(
        `The database has not been set up. Call setDatabase() from your app's entry ` +
          `point before using the core (tried to read "${String(property)}").`,
      );
    }
    return Reflect.get(bound as object, property) as unknown;
  },
});
