import { useSyncExternalStore } from 'react';
import { activeImports, subscribeToImports } from '@reviewies/core/data/importing';

/**
 * Whether an import is running, for any screen that would otherwise describe a settled
 * library. The decision lives in core (§6.80); this is only the subscription.
 */
export function useImporting(): string | undefined {
  // The snapshot has to be a primitive: `activeImports()` builds a fresh array every
  // call, and returning that would make useSyncExternalStore re-render for ever.
  return useSyncExternalStore(subscribeToImports, source, () => undefined);
}

/** The oldest run's source, which is what the sentence names. */
function source(): string | undefined {
  return activeImports()[0]?.source;
}
