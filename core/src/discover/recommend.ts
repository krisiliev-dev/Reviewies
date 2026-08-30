import { db } from '../data/db.ts';
import { getProvider } from '../metadata/index.ts';
import type { SearchResult } from '../metadata/provider.ts';

/**
 * Discovery.
 *
 * The single most repeated complaint on Trakt's roadmap is recommendations that keep
 * suggesting things you have already watched, and the same wish appears on
 * r/Letterboxd ("shove all the ones I've already seen to the bottom"). So exclusion
 * is not a filter bolted on at the end — it is the point of this module.
 *
 * Recommendations are seeded from what you have actually watched most, weighted by
 * time rather than episode count, so a show you finished counts for more than one
 * you sampled.
 */

export interface Suggestion extends SearchResult {
  /** Titles from your library that led here, for "because you watched…". */
  because: string[];
  /**
   * Whether the titles in `because` are ones you have **watched** or only ones you track.
   *
   * The row says a different sentence for each, because only one of them is true: §6.170
   * added tracked titles as seeds and the very first real-data photograph of the feed said
   * *"Because you watched Shōgun"* about a show with no watches against it. True if **any**
   * contributing seed was watched, since that is the stronger claim and the one the listed
   * names then have to support — `mergeSuggestions` keeps the two apart.
   */
  becauseWatched: boolean;
  score: number;
  /**
   * Nothing in the library led here — this is the last-resort trending feed.
   *
   * The fallback used to pass the literal string `'Trending now'` as a `seedName`, so it
   * arrived in `because` and both screens rendered **"Because you watched Trending now"** on
   * every row. A false sentence, and a slightly absurd one, on the screen whose whole claim
   * is that saying *why* is what separates a recommendation from an advert.
   *
   * It had never been seen because it needs a library with nothing *watched* in it — seeds
   * came from watch history, so tracking five shows and watching none of them was exactly
   * the state that reached it, and no fixture pass had ever been in that state. §6.152.
   *
   * **That sentence was a bug report and nobody read it as one.** §6.170 asked why *every*
   * real-data screenshot of Discover was this fallback, and the answer was the state named
   * two lines up: `design/realLibrary.mjs` tracks six titles and marks nothing watched,
   * which is also somebody's first evening with the app. Five stated interests on file and
   * the screen showed what was popular that week. `seedTitles` reads the library now, so
   * this state is a recommendation feed and the fallback means what it says: nothing to
   * build from at all.
   */
  trending?: boolean;
}

/** Everything the user has already seen, is tracking, or has deliberately parked. */
export async function excludedTitleIds(): Promise<Set<string>> {
  const [library, watches, watchlist] = await Promise.all([
    db.library.toArray(),
    db.watches.toArray(),
    db.watchlist.toArray(),
  ]);

  const excluded = new Set<string>();
  for (const item of library) excluded.add(item.titleId);
  // Already on the watchlist is not a discovery: you have decided about it.
  for (const item of watchlist) excluded.add(item.titleId);
  // Films are watched directly, with no parent series, so their target is a title.
  for (const w of watches) {
    if (!w.seriesId) excluded.add(w.targetId);
    else excluded.add(w.seriesId);
  }
  return excluded;
}

/**
 * The other half of the same question, for the rows that have no provider ID yet.
 *
 * A TV Time export carries names and dates and no IDs, so an import lands as
 * `local:tv:tvtime-100` and stays that way until matching rewrites it. Matching runs on
 * the next visit to Up Next — but a show whose match was ambiguous becomes an *ask*, and
 * an ask nobody answers is a library row that keeps its local ID indefinitely.
 *
 * Every screen that compares by ID is blind to those rows, and on this one it is worse
 * than blind: the seeds are resolved through `db.titles` by *name*, so Discover happily
 * printed "Because you watched Hollow Crown Saga" directly above a suggestion **of**
 * Hollow Crown Saga. The two halves of one feature disagreed about what identifies a
 * show, and the half that got it right made the failure louder.
 *
 * By name, and only for local rows, because that is exactly the case where the name is
 * all the row has. Matched rows keep being compared by ID, which is the reliable thing:
 * this is not a general name-matcher and must not become one — guessing that two names
 * are the same show is what the ask-flow exists to avoid doing on somebody's history.
 */
export async function excludedNames(): Promise<Set<string>> {
  const [library, watches, watchlist, titles] = await Promise.all([
    db.library.toArray(),
    db.watches.toArray(),
    db.watchlist.toArray(),
    db.titles.toArray(),
  ]);

  const nameOf = new Map(titles.map((t) => [t.id, t.name]));
  const names = new Set<string>();
  const add = (id: string) => {
    if (!id.startsWith('local:')) return;
    const name = nameOf.get(id);
    if (name) names.add(name.trim().toLowerCase());
  };

  for (const item of library) add(item.titleId);
  for (const item of watchlist) add(item.titleId);
  for (const w of watches) add(w.seriesId ?? w.targetId);
  return names;
}

/**
 * The titles worth seeding recommendations from: what you have given the most time to,
 * and then what you have said you are watching.
 *
 * ## The half that was missing, and how it was found
 *
 * This read `db.watches` and nothing else, while `excludedTitleIds` twenty lines above
 * reads **library, watchlist and watches**. Two functions in one file, answering the two
 * halves of one question off different tables: Discover *excluded* everything you track
 * and *learned* from none of it.
 *
 * What that costs is the first evening. Somebody arrives, tracks five shows, has not
 * pressed the ring yet — and `seedTitles` returns nothing, `mergeSuggestions` comes back
 * empty, and `getSuggestions` falls through to the trending chart. Five stated interests
 * on file and the screen shows what is popular this week. §6.170 found it by asking why
 * *every* real-data screenshot of Discover was the fallback: `design/realLibrary.mjs`
 * tracks its six titles and never marks an episode, which is a perfectly ordinary way to
 * use the app and turned out to be a way the feature does not work.
 *
 * It also made a sentence false. §6.169 had just written *"Nothing to recommend from your
 * library yet"* for the fallback — and the library was not empty; the *watch history* was.
 *
 * ## The order
 *
 * Watched titles first, ranked by the time you have given them, which is the stronger
 * signal and was the whole of this function's original argument. Tracked-but-unwatched
 * after, newest first, because a show you added today is a better guess at what you want
 * next than one you added a year ago and never started. A title that is both appears once,
 * in the watched half.
 */
export async function seedTitles(
  limit = 5,
): Promise<Array<{ titleId: string; name: string; watched: boolean }>> {
  const [watches, library, titleRows] = await Promise.all([
    db.watches.toArray(),
    db.library.toArray(),
    db.titles.toArray(),
  ]);
  const minutesByTitle = new Map<string, number>();

  for (const w of watches) {
    const titleId = w.seriesId ?? w.targetId;
    minutesByTitle.set(titleId, (minutesByTitle.get(titleId) ?? 0) + (w.runtimeMin ?? 30));
  }

  const titles = new Map(titleRows.map((t) => [t.id, t.name]));
  const watched = [...minutesByTitle.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);

  const tracked = library
    .filter((item) => !minutesByTitle.has(item.titleId))
    .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
    .map((item) => item.titleId);

  const seen = new Set(watched);
  return [...watched, ...tracked].slice(0, limit).map((titleId) => ({
    titleId,
    // "something you watched" was the only fallback and it is not true of a tracked title
    // nobody has started — `COPY.discover.because` prints this name in the row's one
    // sentence, so a wrong word here is a false sentence on the card. §6.152.
    name: titles.get(titleId) ?? 'something in your library',
    /**
     * Which sentence the row gets to say, carried rather than guessed at.
     *
     * *"Because you watched Shōgun"* is false about a show you have tracked and not
     * started, and §6.170 photographed exactly that: the first real-data shot of the
     * recommendation feed, produced by a library where nothing is watched, said "you
     * watched" five times about five shows nobody had watched. The screen can only be
     * truthful about this if the seed says which it was.
     */
    watched: seen.has(titleId),
  }));
}

/**
 * Merge recommendation lists, excluding anything already seen.
 *
 * A title recommended by several of your shows scores higher — agreement across
 * different seeds is a stronger signal than one long list.
 */
export function mergeSuggestions(
  lists: Array<{
    seedName: string;
    results: SearchResult[];
    trending?: boolean;
    /** Whether this seed is a title you watched rather than one you only track. §6.170. */
    seedWatched?: boolean;
  }>,
  excluded: Set<string>,
  limit = 30,
  /** Names of library rows that have no provider ID yet — see `excludedNames`. */
  excludedNameSet: Set<string> = new Set(),
): Suggestion[] {
  const merged = new Map<string, Suggestion>();

  for (const { seedName, results, trending, seedWatched = true } of lists) {
    // Position matters: the top of each list is a stronger signal than the tail.
    results.forEach((result, index) => {
      if (excluded.has(result.id)) return;
      // And by name, for the rows whose ID cannot answer yet.
      if (excludedNameSet.has(result.name.trim().toLowerCase())) return;

      const existing = merged.get(result.id);
      const weight = 1 / (index + 1);

      if (existing) {
        existing.score += weight;
        if (!existing.because.includes(seedName)) existing.because.push(seedName);
        // Any watched seed makes the stronger sentence true, and `because` lists the names
        // it is true of: a watched seed is unshifted to the front so the two agree.
        if (seedWatched && !existing.becauseWatched) {
          existing.becauseWatched = true;
          existing.because = [seedName, ...existing.because.filter((n) => n !== seedName)];
        }
      } else {
        merged.set(result.id, {
          ...result,
          // A trending row is not *because* of anything, so it carries no seed at all
          // rather than a seed that is not a title.
          because: trending ? [] : [seedName],
          becauseWatched: !trending && seedWatched,
          score: weight,
          ...(trending ? { trending: true } : {}),
        });
      }
    });
  }

  return [...merged.values()]
    .sort((a, b) => b.because.length - a.because.length || b.score - a.score)
    .slice(0, limit);
}

/**
 * Build the discovery feed.
 *
 * Falls back to trending when there is nothing to recommend from — a new user
 * should not see an empty screen, and trending is still filtered against anything
 * they have already added.
 */
export async function getSuggestions(limit = 30): Promise<Suggestion[]> {
  const [excluded, names, seeds] = await Promise.all([
    excludedTitleIds(),
    excludedNames(),
    seedTitles(),
  ]);

  const lists: Array<{ seedName: string; seedWatched: boolean; results: SearchResult[] }> = [];

  for (const seed of seeds) {
    try {
      lists.push({
        seedName: seed.name,
        seedWatched: seed.watched,
        results: await getProvider().getRecommendations(seed.titleId),
      });
    } catch {
      // One failed seed should not empty the whole feed.
    }
  }

  const merged = mergeSuggestions(lists, excluded, limit, names);
  if (merged.length > 0) return merged;

  try {
    const trending = await getProvider().getTrending();
    return mergeSuggestions(
      [{ seedName: '', results: trending, trending: true, seedWatched: false }],
      excluded,
      limit,
      names,
    );
  } catch (e) {
    // Rethrown rather than swallowed. Both screens already have an error slot and were
    // never given anything to put in it, so a provider outage showed "Nothing new to
    // suggest yet. Track a few things and come back." — which is not only the wrong
    // sentence but the wrong instruction: tracking more will not help.
    //
    // Only the last resort throws. A seed that fails above is one of several and the
    // rest still make a suggestion; this is the point where there is nothing left.
    throw e instanceof Error ? e : new Error('Could not reach the metadata provider');
  }
}
