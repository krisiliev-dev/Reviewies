import initSqlJs from 'sql.js';
import { createRequire } from 'node:module';
import type { SqlDriver } from '../data/adapters/sqlite';

/**
 * A `SqlDriver` backed by sql.js, so the SQLite implementation can be exercised in
 * tests without a device.
 *
 * This is the whole reason the implementation takes a driver rather than importing
 * `expo-sqlite` directly: the core's real test suite — the same one that runs against
 * Dexie — can be pointed at SQLite here, in CI, rather than being replaced by a second
 * suite written to agree with whatever the new implementation happens to do.
 */
export async function createSqlJsDriver(): Promise<SqlDriver> {
  const wasm = createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm');
  const SQL = await initSqlJs({ locateFile: () => wasm });
  const database = new SQL.Database();

  return {
    execute(sql, params) {
      database.run(sql, params as never);
    },
    select(sql, params) {
      const statement = database.prepare(sql);
      try {
        if (params?.length) statement.bind(params as never);
        const rows: Record<string, unknown>[] = [];
        while (statement.step()) rows.push(statement.getAsObject());
        return rows as never;
      } finally {
        statement.free();
      }
    },
  };
}
