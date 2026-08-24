import { setConfig } from '../config';
import { setDatabase } from '../data/db';
import { SqliteDatabase } from '../data/adapters/sqlite';
import { setSqlJsLoader } from '../data/sqlWasm';
import { createSqlJsDriver } from './sqlJsDriver';
import { nodeSqlJsLoader } from './sqlLoader.node';

/**
 * The same tests, against SQLite.
 *
 * Run with `npm run test:sqlite`. Every assertion in the suite was written against
 * Dexie's semantics, so anything that fails here is a real difference between the two
 * implementations rather than a test bending to fit the new one. That is the point.
 */
setDatabase(await SqliteDatabase.open(await createSqlJsDriver()));
setSqlJsLoader(nodeSqlJsLoader);

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
setConfig({
  tmdbToken: env.VITE_TMDB_TOKEN,
  supabaseUrl: env.VITE_SUPABASE_URL,
  supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY,
});
