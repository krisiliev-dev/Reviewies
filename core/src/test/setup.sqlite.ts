import { setConfig } from '../config.ts';
import { resetProvider } from '../metadata/index.ts';
import { setDatabase } from '../data/db.ts';
import { SqliteDatabase } from '../data/adapters/sqlite.ts';
import { setSqlJsLoader } from '../data/sqlWasm.ts';
import { createSqlJsDriver } from './sqlJsDriver.ts';
import { nodeSqlJsLoader } from './sqlLoader.node.ts';

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

/**
 * And forget any provider chosen before this ran.
 *
 * `getProvider()` keeps its answer, which is right in an app and wrong across a suite
 * where the config is bound after some other file has already asked. §6.47 was that
 * ordering going unnoticed for the life of the product; this is the same hazard, in a
 * place where it would look like a test being flaky.
 */
resetProvider();
