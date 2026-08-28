import { db } from './db.ts';

/**
 * What you already have of a thing, for the screens that offer to give it to you.
 *
 * Search offered **Track** for a show already in the library, every time, because the
 * only thing it consulted was a `useState` set when you pressed the button. Somebody
 * arriving from TV Time with three hundred imported shows got a search that could not
 * tell them which of the results were already theirs — which is most of the reason to
 * search at all when you have just brought a decade of history with you.
 *
 * The write is idempotent, so pressing it again does no damage; it simply appears to do
 * nothing, which is its own kind of wrong.
 *
 * **By ID, and by name for the rows that have no ID yet.** This is §6.101's rule, and the
 * reasoning is the same: a TV Time export carries names and no provider IDs, so an import
 * lands as `local:tv:tvtime-100` and stays there until matching rewrites it — indefinitely,
 * if the match was ambiguous and the ask goes unanswered. An ID comparison is blind to
 * those rows, and blind in the direction that costs: Search would offer to track a show
 * you imported, and *that* press would write a second library row under the provider's ID
 * for a show you already have under a local one.
 *
 * It stays narrow for the same reason too. Names are consulted only for `local:` rows,
 * because that is exactly where the name is all the row has. A matched row is compared by
 * ID, which is the reliable thing. Two shows share a name often enough — a remake, a
 * translation, a film and the series of it — and deciding they are the same is what the
 * ask-flow exists to refuse to do to somebody's history.
 */
export type Shelf = 'library' | 'watchlist';

export interface AlreadyHave {
  /** Provider IDs, per shelf. */
  ids: Record<Shelf, Set<string>>;
  /** Lowercased names of `local:` rows, per shelf — the ones an ID cannot answer for. */
  names: Record<Shelf, Set<string>>;
}

export async function alreadyHave(): Promise<AlreadyHave> {
  const [library, watchlist, titles] = await Promise.all([
    db.library.toArray(),
    db.watchlist.toArray(),
    db.titles.toArray(),
  ]);
  const nameOf = new Map(titles.map((t) => [t.id, t.name]));

  const have: AlreadyHave = {
    ids: { library: new Set(), watchlist: new Set() },
    names: { library: new Set(), watchlist: new Set() },
  };
  const add = (shelf: Shelf, titleId: string) => {
    if (titleId.startsWith('local:')) {
      const name = nameOf.get(titleId);
      if (name) have.names[shelf].add(name.trim().toLowerCase());
      return;
    }
    have.ids[shelf].add(titleId);
  };

  for (const row of library) add('library', row.titleId);
  for (const row of watchlist) add('watchlist', row.titleId);
  return have;
}

/**
 * Which shelf a search result is already on, if any.
 *
 * The library wins when something is on both: "Tracking" is the stronger statement, and a
 * watchlist entry for something you are already watching is the leftover rather than the
 * fact.
 */
export function shelfFor(
  result: { id: string; name: string },
  have: AlreadyHave | undefined,
): Shelf | undefined {
  if (!have) return undefined;
  const name = result.name.trim().toLowerCase();
  for (const shelf of ['library', 'watchlist'] as const) {
    if (have.ids[shelf].has(result.id) || have.names[shelf].has(name)) return shelf;
  }
  return undefined;
}
