import 'fake-indexeddb/auto';
import { setConfig } from '../config';
import { setDatabase } from '../data/db';
import { createDexieDatabase } from '../data/adapters/dexie';
import { setSqlJsLoader } from '../data/sqlWasm';
import { nodeSqlJsLoader } from './sqlLoader.node';

/**
 * Bind a database for the core's tests.
 *
 * Dexie on fake-indexeddb, because these tests were written against Dexie's exact
 * semantics — `add` rejecting a duplicate key, how `sortBy` orders, what `update`
 * returns — and swapping the implementation underneath them at the same time as
 * moving them would mean any failure could be either a bad move or a bad adapter.
 *
 * The point of the interface is that the *same* suite can later be pointed at SQLite,
 * which is what will prove that port rather than a second set of tests written to
 * agree with it.
 */
setDatabase(createDexieDatabase());

// The DioCache importer needs real SQLite; see sqlLoader.node.ts.
setSqlJsLoader(nodeSqlJsLoader);

/**
 * Credentials, from the workspace .env, through the same injection the apps use.
 *
 * Reading `import.meta.env` directly in the live suites would test a path no app
 * takes — and would not compile, since the core deliberately has no Vite types.
 */
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
setConfig({
  tmdbToken: env.VITE_TMDB_TOKEN,
  supabaseUrl: env.VITE_SUPABASE_URL,
  supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY,
  vapidPublicKey: env.VITE_VAPID_PUBLIC_KEY,
});
