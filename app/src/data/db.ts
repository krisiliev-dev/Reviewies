import { createDexieDatabase } from '@reviewies/core/data/adapters/dexie';
import { db, setDatabase } from '@reviewies/core/data/db';

/**
 * The web app's database: Dexie over IndexedDB.
 *
 * The schema and the adapter live in the core, because the core's tests run against
 * them. What belongs here is only the choice — this app runs in a browser, so it uses
 * the IndexedDB implementation.
 *
 * Bound at import time rather than from `main.tsx`, because several screens import
 * `db` directly and a missed initialisation would surface as a confusing runtime error
 * deep in a component rather than here.
 */
setDatabase(createDexieDatabase());

export { db };
export type { Database } from '@reviewies/core/data/store';
