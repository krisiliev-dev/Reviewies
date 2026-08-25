import { useEffect, useState } from 'react';
import { onSyncStatus, requestSync, syncStatus, type SyncStatus } from '@reviewies/core/sync/driver';
import { getSession, onAuthChange } from '@reviewies/core/sync/auth';
import type { Session } from '@supabase/supabase-js';

/**
 * Read the driver's status. Do not own it.
 *
 * This hook used to *be* the driver, and a hook runs for as long as its component is
 * mounted — which meant the queue drained only while somebody was looking at the account
 * panel or the people screen, and every write in the app happens somewhere else. The
 * loop now belongs to the app (see App.tsx and core/sync/driver.ts); this reports on it.
 */
export function useSync(): SyncStatus & { session: Session | null; sync: () => Promise<void> } {
  const [status, setStatus] = useState<SyncStatus>(syncStatus);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => onSyncStatus(setStatus), []);

  // The panels want the session object itself, not just whether there is one.
  useEffect(() => {
    void getSession().then(setSession);
    return onAuthChange(setSession);
  }, []);

  return { ...status, session, sync: requestSync };
}
