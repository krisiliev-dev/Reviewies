import type { Database } from './store.ts';

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

/**
 * Forwarding, with methods bound to the database rather than to the proxy — and a shipped
 * defect that hid behind the difference.
 *
 * A method reached through a proxy runs with `this` set to **the proxy**, not to the
 * object the proxy forwards to. Both adapters depend on `this` being the real thing, and
 * both were broken by it in ways nothing had ever run:
 *
 * - `SqliteDatabase.transaction` counts nesting in a field. `this.depth = 1` went through
 *   the proxy, which had no `set` trap, so the default put it on the empty target `{}`
 *   while `this.depth` read the adapter's untouched `0`. The counter never counted, so a
 *   nested call took the outermost branch, issued a second `BEGIN`, and the phone threw
 *   **cannot start a transaction within a transaction**.
 * - Dexie compares identity: a nested `transaction()` is only treated as a sub-transaction
 *   when `PSD.trans.db === this`. `this` was the proxy and the parent's `db` was the real
 *   Dexie, so the inner call opened a *second top-level* transaction, which Dexie then
 *   queued behind the parent while the parent awaited it — **PrematureCommitError**.
 *
 * `sqlite.ts` states in its own comment that "the repository legitimately nests", so this
 * has been dead on both stores since the proxy was written.
 *
 * Binding is the fix, and the `set` trap alone was not (§6.135): with only `set` added,
 * SQLite passed and Dexie still threw, because no trap can make a proxy identical to what
 * it wraps. The other three traps stay anyway — a forwarding proxy that reads through and
 * writes to an empty object it never shows anyone is the landmine this paragraph exists
 * because of.
 *
 * Bound methods are cached per database so that `db.transaction === db.transaction`;
 * `bind` returns a fresh function every call, and a proxy whose methods have no stable
 * identity is its own next bug.
 */
const guard = (property: string | symbol): Database => {
  if (!bound) {
    throw new Error(
      `The database has not been set up. Call setDatabase() from your app's entry ` +
        `point before using the core (tried to read "${String(property)}").`,
    );
  }
  return bound;
};

const boundMethods = new WeakMap<object, Map<string | symbol, unknown>>();

function reach(property: string | symbol): unknown {
  const database = guard(property);
  const value = Reflect.get(database as object, property) as unknown;
  if (typeof value !== 'function') return value;

  let cache = boundMethods.get(database as object);
  if (!cache) boundMethods.set(database as object, (cache = new Map()));
  const already = cache.get(property);
  if (already) return already;
  const method = (value as (...args: unknown[]) => unknown).bind(database);
  cache.set(property, method);
  return method;
}

export const db: Database = new Proxy({} as Database, {
  get: (_target, property) => reach(property),
  set: (_target, property, value) => Reflect.set(guard(property) as object, property, value),
  has: (_target, property) => Reflect.has(guard(property) as object, property),
  deleteProperty: (_target, property) => Reflect.deleteProperty(guard(property) as object, property),
});
