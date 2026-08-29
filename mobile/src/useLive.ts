import { useCallback, useEffect, useState } from 'react';
import { addDatabaseChangeListener } from 'expo-sqlite';
import { db } from '@reviewies/core/data/db';

/**
 * Re-run a query whenever the database changes.
 *
 * The web app gets this from `dexie-react-hooks`: writes invalidate reads with no
 * manual bookkeeping, which is what makes marking an episode watched feel instant.
 * expo-sqlite exposes the same idea as a change listener, so this is the native
 * equivalent rather than a different pattern.
 *
 * Deliberately coarse — any write re-runs every live query. With one user's library
 * that is a handful of rows, and the alternative is a dependency graph that gets
 * subtly wrong which screens refresh.
 */
export function useLive<T>(query: () => Promise<T>, deps: unknown[] = []): T | undefined {
  const [value, setValue] = useState<T>();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(query, deps);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void run().then((result) => {
        if (!cancelled) setValue(result);
      });
    };

    load();
    /*
     * Reload once a write settles, as well as on every statement.
     *
     * expo-sqlite fires `addDatabaseChangeListener` **per statement**, and every read here
     * goes through the one connection holding the transaction — so during an import this
     * runs hundreds of times against uncommitted state. §6.135 measured it: an outside
     * read during a ten-row write sees 1 on SQLite and 10 on Dexie, and when the write
     * then fails the reader has been handed a row the store throws away. A **rollback is
     * not a row change**, so nothing woke this afterwards and the screen kept it.
     *
     * The first version of this also *skipped* those mid-write wakes, which is the obvious
     * reading of the measurement and is wrong: an import is one long transaction, so the
     * guard drew nothing at all while it ran. `mobile/smoke.mjs` failed on "the import is
     * visibly under way rather than silent" — the state §6.127 built this screen around —
     * with 0 samples. Progress a failure takes back beats no progress at all.
     *
     * `onSettled` is optional on `Database` and Dexie does not implement it: IndexedDB
     * queues a reader behind a write, so there is nothing it drew that needs correcting.
     */
    const subscription = addDatabaseChangeListener(load);
    const unsubscribe = db.onSettled?.(load);
    return () => {
      cancelled = true;
      subscription.remove();
      unsubscribe?.();
    };
  }, [run]);

  return value;
}
