/**
 * Key/value storage for preferences, bound at startup like the database.
 *
 * Synchronous on purpose. `localStorage` is synchronous, every existing caller reads a
 * preference during render, and making this async would turn a handful of trivial
 * getters into effects and loading states throughout the UI. React Native's
 * AsyncStorage is not synchronous, so the mobile binding hydrates once at startup and
 * writes through — which is fine, because these values are small, few, and only ever
 * changed by the person looking at them.
 *
 * Everything here is best-effort. A blocked or full store must never be able to break
 * marking an episode watched, so failures fall back to the default rather than throw.
 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** In-memory, and the default: correct behaviour with no persistence beats a crash. */
class MemoryStore implements KeyValueStore {
  private readonly values = new Map<string, string>();
  getItem = (key: string) => this.values.get(key) ?? null;
  setItem = (key: string, value: string) => void this.values.set(key, value);
  removeItem = (key: string) => void this.values.delete(key);
}

let bound: KeyValueStore = new MemoryStore();

export function setStorage(store: KeyValueStore): void {
  bound = store;
}

export function readPreference(key: string): string | null {
  try {
    return bound.getItem(key);
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: string): void {
  try {
    bound.setItem(key, value);
  } catch {
    /* Non-fatal: the default applies. */
  }
}
