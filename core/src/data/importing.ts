/**
 * Whether an import is running.
 *
 * §6.79 handed the phone a 266-row rescue CSV and navigated part-way through. For five
 * and a half seconds Up Next said **"Nothing here yet. 7 shows came from an import and
 * have no episode lists until they are matched"**, then the same sentence with 12, and
 * only then the panel saying the import had finished. Three things wrong at once, and
 * only the first is wording:
 *
 * - "Nothing here yet" is a claim about a settled empty library.
 * - The count was still growing. Seven was never true of anything.
 * - It offered **Match imported shows** — a repair action over a library still being
 *   written. Tapping it at 606ms matches seven shows and leaves the rest behind.
 *
 * §6.57 separated "nothing" from "I could not look". This is the third state, "still
 * working", and no screen knew it existed.
 *
 * ## Why this is in memory rather than the database
 *
 * A persisted flag would outlive the thing it describes. An import only ever runs in
 * the page that started it, so if that page is closed or reloaded the import is dead —
 * but a row saying `importing: true` would survive, and every screen would wait for a
 * run that no longer exists. That is §6.71's stuck queue with the sign flipped: there,
 * a queue that could not drain looked like an empty one; here, a dead import would look
 * like a live one, for ever. In memory, a reload is the truth.
 *
 * The cost is that this says nothing about an import running in *another tab*. That is
 * the honest answer rather than a limitation: the other tab's import will land in the
 * shared database and the live queries will show it arriving, which is the same thing a
 * person sees when a sync writes.
 */

/** One import, from the moment it starts until it settles. */
export interface ImportRun {
  /** What is being read, for the sentence: 'TV Time export', 'your backup'. */
  source: string;
  startedAt: number;
}

const active = new Set<ImportRun>();
const listeners = new Set<() => void>();

function announce(): void {
  // Copied before iterating: a listener that unsubscribes itself while being notified
  // would otherwise mutate the set mid-loop.
  for (const listener of [...listeners]) listener();
}

/**
 * The runs in flight, oldest first. Empty when nothing is importing.
 *
 * The only way to ask. There was an `importInProgress()` beside this for a while and
 * nothing used it: every caller wants to *name* what is being read, not merely know
 * that something is, so the boolean was a second answer to a question with one.
 */
export function activeImports(): ImportRun[] {
  return [...active].sort((a, b) => a.startedAt - b.startedAt);
}

/**
 * Watch for imports starting and finishing.
 *
 * Shaped for `useSyncExternalStore`, which both platforms have: subscribe returns its
 * own unsubscribe, and the snapshot is read separately. Kept free of React so the
 * decision about what counts as importing lives in one place and neither app owns it.
 */
export function subscribeToImports(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Run an import, with the rest of the app able to see that it is happening.
 *
 * The `finally` is the whole point: an import that throws is over, and a screen left
 * saying "still working" after a failure is worse than one that never said it.
 */
export async function whileImporting<T>(source: string, run: () => Promise<T>): Promise<T> {
  const entry: ImportRun = { source, startedAt: Date.now() };
  active.add(entry);
  announce();
  try {
    return await run();
  } finally {
    active.delete(entry);
    announce();
  }
}

/** Only for tests, which need each case to start from nothing in flight. */
export function resetImports(): void {
  active.clear();
  announce();
}
