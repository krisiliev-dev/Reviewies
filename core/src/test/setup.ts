import 'fake-indexeddb/auto';
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
