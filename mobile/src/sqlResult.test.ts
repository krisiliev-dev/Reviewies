import { describe, expect, it } from 'vitest';
import { toResultTable } from './sqlResult';

/**
 * The phone could not read a database at all until 6.85: nothing in `mobile/` bound a
 * SQLite loader, so importing a recovered `DioCache.db` failed with "Reading a TV Time
 * cache needs SQLite, which this app has not set up". The binding is native and untestable
 * here. This is the part that is not.
 */
describe('expo-sqlite rows as a sql.js result', () => {
  it('turns row objects into columns and a matrix', () => {
    expect(toResultTable([{ key: 'a', content: 1 }, { key: 'b', content: 2 }])).toEqual([
      { columns: ['key', 'content'], values: [['a', 1], ['b', 2]] },
    ]);
  });

  it('keeps the column order the rows came in', () => {
    // `readDioCache` reads `select content from cache_dio` positionally, by destructuring
    // the first value of each row. Reordering columns would hand it the wrong one.
    const [table] = toResultTable([{ content: 'payload', key: 'k' }]);
    expect(table.columns).toEqual(['content', 'key']);
    expect(table.values).toEqual([['payload', 'k']]);
  });

  it('returns no tables at all for no rows', () => {
    // Not one empty table: `readDioCache` destructures `const [result] = …` and returns an
    // empty cache when there is no result. A `{ columns: [], values: [] }` would be truthy
    // and send it down the reading path with nothing to read.
    expect(toResultTable([])).toEqual([]);
  });

  it('carries a blob through untouched', () => {
    // The `content` column is a BLOB and arrives as bytes; `readDioCache` decodes it only
    // when it is a Uint8Array. Converting it to anything here would lose that branch.
    const bytes = new Uint8Array([123, 34, 97, 34, 125]);
    const [table] = toResultTable([{ content: bytes }]);
    expect(table.values[0][0]).toBe(bytes);
  });

  it('reads a later row through the first row’s columns', () => {
    // SQLite gives every row of one result the same shape, so this is defensive rather
    // than expected — but a missing key must read as absent, not shift the row along.
    const [table] = toResultTable([{ a: 1, b: 2 }, { a: 3 } as Record<string, unknown>]);
    expect(table.values).toEqual([[1, 2], [3, undefined]]);
  });
});
