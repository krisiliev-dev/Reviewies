import { useCallback, useEffect, useState } from 'react';
import { addDatabaseChangeListener } from 'expo-sqlite';

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
    const subscription = addDatabaseChangeListener(load);
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [run]);

  return value;
}
