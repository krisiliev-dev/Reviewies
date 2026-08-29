import { describe, expect, it } from 'vitest';
import { createSqlJsDriver } from '../../test/sqlJsDriver.ts';
import { SqliteDatabase, type SqlDriver } from './sqlite.ts';

/**
 * A bulk write lands whole, or it does not land.
 *
 * `bulkPut` on this store was a bare loop of `INSERT OR REPLACE`, each one its own
 * implicit transaction. Dexie's is a single IndexedDB transaction, so the two stores
 * promised a reader different things through the same method name — the drift §6.128 went
 * looking for and found in `db.transaction`, one method along.
 *
 * §6.154 measured what it costs, in the app, on the phone. Track a show and reload a
 * second later — which is what backgrounding an app is — and The Long Dark had **four**
 * of its twenty-four episodes in the table. Not a missing show: a show with four
 * episodes, whose `fetchedAt` is a second old, so `getEpisodesCached` reads a complete
 * fresh cache and never asks again. Up Next said "2 more episodes" of a show with
 * seventeen, and went on saying it. A write that vanishes is re-run by the next reader.
 * A write that half-lands is an answer, and it is wrong.
 *
 * This is at the adapter rather than through `db` on purpose: the failure has to be
 * injected into the driver, which is the layer where a phone loses a connection, and the
 * clause below would otherwise be measuring whichever store the config happened to pick.
 */

const SPEC = { table: 'episodes', primaryKey: 'id' };

/** A row shaped like the table's spec — the columns `episodes` lifts out of the doc. */
const EPISODE = (n: number) => ({
  id: `tmdb:ep:torn-${n}`,
  seriesId: 'tmdb:tv:torn',
  season: 1,
  number: n,
  name: `Episode ${n}`,
  airDate: '2026-01-01',
  fetchedAt: 1_700_000_000_000,
});

/**
 * A driver that works until the nth write, then stops — the shape of a connection dying
 * under a bulk write, which is the case that produced §6.154.
 */
function failingAfter(inner: SqlDriver, writes: number): SqlDriver & { statements: string[] } {
  let seen = 0;
  const statements: string[] = [];
  return {
    statements,
    async execute(sql, params) {
      statements.push(sql.split(' ').slice(0, 2).join(' '));
      if (/^INSERT/.test(sql) && seen++ >= writes) throw new Error('connection lost');
      return inner.execute(sql, params);
    },
    select: (sql, params) => inner.select(sql, params),
  };
}

describe('a bulk write interrupted part-way', () => {
  it('leaves nothing behind, rather than a prefix that reads as complete', async () => {
    const driver = await createSqlJsDriver();
    await SqliteDatabase.open(driver);
    const failing = failingAfter(driver, 4);
    const db = new SqliteDatabase(failing);

    await expect(
      db.table(SPEC.table).bulkPut(
        Array.from({ length: 24 }, (_, i) => EPISODE(i + 1)),
      ),
    ).rejects.toThrow('connection lost');

    /*
     * Four, before the fix. The number matters: four fresh rows is exactly what the phone
     * had, and it is indistinguishable from a show that really is four episodes long.
     */
    const rows = await driver.select<{ n: number }>('SELECT COUNT(*) AS n FROM "episodes"');
    expect(rows[0]?.n, 'a torn write left rows behind').toBe(0);
  });

  it('opens one transaction for the whole write and rolls it back', async () => {
    /*
     * The count above would also be zero if `bulkPut` had simply never run. This says how
     * the zero was arrived at: one `BEGIN`, no `COMMIT`, a `ROLLBACK`.
     */
    const driver = await createSqlJsDriver();
    await SqliteDatabase.open(driver);
    const failing = failingAfter(driver, 4);
    const db = new SqliteDatabase(failing);

    failing.statements.length = 0;
    await expect(
      db.table(SPEC.table).bulkPut([EPISODE(1), EPISODE(2), EPISODE(3),
        EPISODE(4), EPISODE(5)]),
    ).rejects.toThrow('connection lost');

    const kinds = failing.statements;
    expect(kinds.filter((s) => s === 'BEGIN').length, 'no transaction was opened').toBe(1);
    expect(kinds).toContain('ROLLBACK');
    expect(kinds).not.toContain('COMMIT');
  });

  it('commits once when it succeeds, rather than once per row', async () => {
    const driver = await createSqlJsDriver();
    await SqliteDatabase.open(driver);
    const watched = failingAfter(driver, Number.POSITIVE_INFINITY);
    const db = new SqliteDatabase(watched);

    watched.statements.length = 0;
    await db.table(SPEC.table).bulkPut(
      Array.from({ length: 24 }, (_, i) => EPISODE(i + 1)),
    );

    expect(watched.statements.filter((s) => s === 'BEGIN').length).toBe(1);
    expect(watched.statements.filter((s) => s === 'COMMIT').length).toBe(1);
    const rows = await driver.select<{ n: number }>('SELECT COUNT(*) AS n FROM "episodes"');
    expect(rows[0]?.n).toBe(24);
  });
});
