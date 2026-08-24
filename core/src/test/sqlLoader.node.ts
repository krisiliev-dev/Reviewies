import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';
import type { SqlJsLoader } from '../data/sqlWasm';

/**
 * SQLite for the tests.
 *
 * Vite's `?url` import gives a browser path Node cannot open, so the binary is
 * resolved from disk instead. Running the DioCache importer against real SQLite files
 * is the only way to know the write-ahead-log merge works, so this has to load for
 * real rather than be stubbed.
 */
export const nodeSqlJsLoader: SqlJsLoader = async () => {
  const wasm = createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm');
  return (await initSqlJs({ locateFile: () => wasm })) as unknown as Awaited<
    ReturnType<SqlJsLoader>
  >;
};
