import { describe, expect, it } from 'vitest';
import { createSqlJsDriver } from '../../test/sqlJsDriver.ts';
import { SqliteDatabase, type SqlDriver } from './sqlite.ts';
import { TABLES, quote } from './schema.ts';

/**
 * Opening a database that an older build wrote.
 *
 * Every suite in this repository starts from nothing, which is the one thing no real
 * install ever does: a person's second launch opens a database written by the version
 * they had yesterday. That path had never been executed here — on either store — and on
 * this one there was nothing to execute, because `open()` only ever issued
 * `CREATE TABLE IF NOT EXISTS`. A brand new table therefore appeared; a new *column* on
 * an existing table never did, and every query that filtered or sorted by it would have
 * failed on an upgraded phone with `no such column` while passing here for ever.
 *
 * The fixtures below are what an older build's file looks like: the tables it had, the
 * columns it had, and rows in them. Losing those rows is the worst failure this product
 * has available — the pitch to somebody arriving from a dead app is that their history
 * is safe here.
 */

/** A table as an older build would have created it: fewer columns, no indexes for them. */
async function createOldTable(
  driver: SqlDriver,
  name: string,
  primaryKey: string,
  columns: string[],
): Promise<void> {
  const spec = [
    `${quote(primaryKey)} TEXT PRIMARY KEY`,
    ...columns.map((c) => `${quote(c)} ANY`),
    'doc TEXT NOT NULL',
  ];
  await driver.execute(`CREATE TABLE ${quote(name)} (${spec.join(', ')})`);
}

async function insert(
  driver: SqlDriver,
  name: string,
  columns: string[],
  values: unknown[],
  doc: Record<string, unknown>,
): Promise<void> {
  const all = [...columns, 'doc'];
  await driver.execute(
    `INSERT INTO ${quote(name)} (${all.map(quote).join(', ')}) ` +
      `VALUES (${all.map(() => '?').join(', ')})`,
    [...values, JSON.stringify(doc)],
  );
}

const columnsOf = async (driver: SqlDriver, table: string): Promise<string[]> => {
  const rows = await driver.select<{ name: string }>(`PRAGMA table_info(${quote(table)})`);
  return rows.map((r) => r.name);
};

describe('opening a database an older build wrote', () => {
  it('keeps the rows, and adds what is missing', async () => {
    const driver = await createSqlJsDriver();

    // The shape before `status` was lifted out of the document, before the anime ID
    // cache, and before the outbox and sync cursor moved in from their own database —
    // which is to say, roughly the first version anybody could have installed.
    await createOldTable(driver, 'library', 'titleId', ['kind', 'addedAt']);
    await createOldTable(driver, 'watches', 'id', ['targetId', 'seriesId', 'watchedAt']);
    await createOldTable(driver, 'titles', 'id', ['kind', 'fetchedAt']);

    await insert(
      driver,
      'library',
      ['titleId', 'kind', 'addedAt'],
      ['tmdb:1', 'show', 1000],
      { titleId: 'tmdb:1', kind: 'show', status: 'watching', addedAt: 1000 },
    );
    await insert(
      driver,
      'watches',
      ['id', 'targetId', 'seriesId', 'watchedAt'],
      ['w1', 'tmdb:ep:1', 'tmdb:1', 2000],
      { id: 'w1', targetId: 'tmdb:ep:1', seriesId: 'tmdb:1', watchedAt: 2000 },
    );

    const db = await SqliteDatabase.open(driver);

    // Nothing lost.
    expect(await db.table('library').count()).toBe(1);
    expect(await db.table('watches').count()).toBe(1);
    expect((await db.table('library').get('tmdb:1'))?.status).toBe('watching');

    // The column an older build never had, present and filled in from the document
    // rather than left null — a library row with a null status is a show that has
    // silently stopped being watched.
    expect(await columnsOf(driver, 'library')).toContain('status');
    const watching = await db.table('library').where('status').equals('watching').toArray();
    expect(watching.map((r) => r.titleId)).toEqual(['tmdb:1']);

    // The tables a later version added.
    expect(await db.table('animeIds').count()).toBe(0);
    expect(await db.table('outbox').count()).toBe(0);
    await db.table('syncState').put({ key: 'cursor', value: 5 });
    expect((await db.table('syncState').get('cursor'))?.value).toBe(5);
  });

  it('gives every table every column the current code queries', async () => {
    // Not just the one above: the check is the whole schema, so a future field lifted
    // out of the document is covered without anybody remembering to add a case.
    const driver = await createSqlJsDriver();
    await createOldTable(driver, 'library', 'titleId', []);
    await createOldTable(driver, 'episodes', 'id', ['seriesId']);
    await SqliteDatabase.open(driver);

    for (const spec of TABLES) {
      const columns = await columnsOf(driver, spec.name);
      for (const field of [spec.primaryKey, ...spec.indexed, 'doc']) {
        expect(columns, `${spec.name}.${field}`).toContain(field);
      }
    }
  });

  it('is idempotent, because a launch is not the first launch', async () => {
    const driver = await createSqlJsDriver();
    await createOldTable(driver, 'library', 'titleId', ['kind', 'addedAt']);
    await insert(
      driver,
      'library',
      ['titleId', 'kind', 'addedAt'],
      ['tmdb:1', 'show', 1000],
      { titleId: 'tmdb:1', kind: 'show', status: 'dropped', addedAt: 1000 },
    );

    await SqliteDatabase.open(driver);
    const db = await SqliteDatabase.open(driver);
    const again = await SqliteDatabase.open(driver);

    expect(await db.table('library').count()).toBe(1);
    expect((await again.table('library').get('tmdb:1'))?.status).toBe('dropped');
    // And the backfill has not overwritten a value written since the upgrade.
    await again.table('library').update('tmdb:1', { status: 'completed' });
    await SqliteDatabase.open(driver);
    expect((await again.table('library').get('tmdb:1'))?.status).toBe('completed');
  });
});
