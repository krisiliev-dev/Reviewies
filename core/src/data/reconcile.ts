import { db } from './db.ts';
import { enqueue } from '../sync/engine.ts';
import { getProvider } from '../metadata/index.ts';
import { getEpisodesCached, getTitleCached } from '../metadata/index.ts';
import type { SearchResult } from '../metadata/provider.ts';
import type { CachedEpisode, CachedTitle, InternalId, MediaKind } from '../domain/types.ts';

/**
 * Matching an imported history to the metadata provider.
 *
 * An export carries names and dates and no provider IDs, so an import lands under local
 * ones — `local:tv:tvtime-900` — that TMDB has never heard of. Until they are matched
 * there is no artwork, no air dates, no episode list beyond what was watched, and Up
 * Next has nothing to offer for any of it.
 *
 * The whole design turns on one asymmetry: an unmatched row is visibly unfinished and
 * costs nothing, while a wrong match silently rewrites somebody's history onto the wrong
 * show and there is no way for them to notice. So the bar for matching without asking is
 * deliberately high, and everything else is put in front of a person.
 */

/**
 * How sure we have to be to move somebody's history without asking.
 *
 * Both numbers were guesses until they were measured against live TMDB with thirty real
 * show names — see reconcile.live.test.ts, which records what each one does. The margin
 * started at 0.2 and was wrong: "Ghost in the Shell" matched confidently onto a 2026
 * entry of that exact name, over the 2002 series somebody's history would actually be,
 * on a margin of 0.21. One confidently wrong match is the whole failure this design
 * exists to prevent, so the threshold has to sit above the one that was observed.
 *
 * The cost, measured on the same thirty: 0.2 matched 13 and asked 15; 0.25 matches 11
 * and asks 17. The two given up are the wrong one and "Twin Peaks", which was right by
 * luck. That is the trade this is meant to make.
 */
const CONFIDENT = 0.94;
/** And how far clear of the runner-up, so two plausible shows are never guessed between. */
const MARGIN = 0.25;

export interface MatchCandidate extends SearchResult {
  score: number;
}

export interface Proposal {
  localId: InternalId;
  name: string;
  kind: MediaKind;
  year?: number;
  candidates: MatchCandidate[];
  /** Present only when one candidate is clearly right; see CONFIDENT and MARGIN. */
  confident?: MatchCandidate;
}

/**
 * Names as people write them versus as providers list them.
 *
 * Case, punctuation, and a leading article are all noise — "The Office" and "Office,
 * The" and "the office" are the same show. A trailing year in parentheses is noise too:
 * TV Time wrote it into some titles and TMDB does not.
 */
export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(\d{4}\)\s*$/, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^(the|a|an) /, '')
    .replace(/ (the|a|an)$/, '')
    .trim();
}

/** Similarity by shared bigrams — Dice's coefficient. Cheap, and forgiving of a word. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const pairs = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const pair = s.slice(i, i + 2);
      out.set(pair, (out.get(pair) ?? 0) + 1);
    }
    return out;
  };

  const first = pairs(a);
  const second = pairs(b);
  let shared = 0;
  let total = 0;
  for (const count of first.values()) total += count;
  for (const [pair, count] of second) {
    total += count;
    shared += Math.min(count, first.get(pair) ?? 0);
  }
  return total === 0 ? 0 : (2 * shared) / total;
}

/**
 * How well one search result answers for an imported title.
 *
 * The year is a tiebreaker rather than a requirement: an export often has none, and
 * refusing to match without one would leave most of a library unmatched. A year that
 * disagrees by more than a year is treated as evidence against, because remakes and
 * reboots share their names exactly and are the case most likely to go wrong.
 */
export function scoreCandidate(
  want: { name: string; kind: MediaKind; year?: number },
  candidate: SearchResult,
): number {
  if (candidate.kind !== want.kind) return 0;

  let score = similarity(normaliseName(want.name), normaliseName(candidate.name));
  if (want.year && candidate.year) {
    const apart = Math.abs(want.year - candidate.year);
    if (apart === 0) score += 0.06;
    else if (apart === 1) score += 0.02;
    else score -= 0.35;
  }
  return Math.max(0, Math.min(1, score));
}

/**
 * The one candidate we are willing to act on unasked, or nothing.
 *
 * Two conditions, both required. High absolute confidence, so a bad set of results
 * cannot promote its own best guess. And a clear margin over the runner-up, because the
 * dangerous case is not a weak match — it is two strong ones, which is what a remake, a
 * spin-off, or a show with a regional twin looks like from here.
 */
export function chooseConfident(candidates: MatchCandidate[]): MatchCandidate | undefined {
  const [best, next] = [...candidates].sort((a, b) => b.score - a.score);
  if (!best || best.score < CONFIDENT) return undefined;
  if (next && best.score - next.score < MARGIN) return undefined;
  return best;
}

/** Library rows that came from an import and have never been matched. */
export async function unmatchedTitles(): Promise<CachedTitle[]> {
  const rows = await db.library.toArray();
  const local = rows.filter((row) => row.titleId.startsWith('local:'));
  const titles = await Promise.all(local.map((row) => db.titles.get(row.titleId)));
  return titles.filter((title): title is CachedTitle => Boolean(title));
}

/**
 * Ask the provider about one imported title.
 *
 * A title already matched once answers from its own record rather than the network: a
 * re-import writes the local rows again, and asking somebody the same question twice
 * about the same show is how a migration stops being worth finishing.
 */
export async function proposeMatch(
  title: CachedTitle,
  /**
   * How to ask. Defaulted rather than imported at the call site so this can be tested
   * without a network — `provider` is resolved once at module load from the config, so
   * a suite with a token in its environment would otherwise make live searches.
   */
  search: (query: string) => Promise<SearchResult[]> = (query) => getProvider().search(query),
): Promise<Proposal> {
  const base = {
    localId: title.id,
    name: title.name,
    kind: title.kind,
    year: title.year,
  };

  if (title.matchedTo) {
    const known: MatchCandidate = {
      id: title.matchedTo,
      kind: title.kind,
      name: title.name,
      year: title.year,
      score: 1,
    };
    return { ...base, candidates: [known], confident: known };
  }

  const results = await search(title.name);
  const candidates = results
    .map((result) => ({ ...result, score: scoreCandidate(title, result) }))
    .filter((candidate) => candidate.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return { ...base, candidates, confident: chooseConfident(candidates) };
}

export interface MigrationReport {
  watches: number;
  ratings: number;
  episodesMapped: number;
  /** Watches whose episode has no counterpart in the provider's listing. */
  orphanedWatches: number;
}

/**
 * Move a history from a local ID onto a matched one.
 *
 * Episode watches are remapped by season and number, which is why the importers write
 * the episodes at all — TV Time's own episode ID survives in the local ID and says
 * nothing about where in the run it sits.
 *
 * A watch whose episode the provider does not list is left where it is rather than
 * dropped or guessed at. That happens with specials, with numbering that disagrees, and
 * with anime whose seasons TMDB flattens; losing the record silently would be the worst
 * outcome available, and the report says how many.
 */
export interface Lookup {
  /** Pulls the real title into the cache. */
  title: (id: InternalId) => Promise<unknown>;
  /** The provider's episode list, which the remapping is done against. */
  episodes: (id: InternalId) => Promise<CachedEpisode[]>;
}

/**
 * Exported so a test can assert which episode listing this remaps against, which is not
 * a detail for anime.
 *
 * TMDB flattens some series into one long season; `getEpisodesCached` re-cuts those
 * using AniList before returning them, and `provider.getEpisodes` does not. An imported
 * anime history carries the seasons the way an anime fan counts them — season 2, episode
 * 1 — so remapping it against the flattened listing would place nothing at all and
 * orphan an entire history in one go.
 */
export const DEFAULT_LOOKUP: Lookup = { title: getTitleCached, episodes: getEpisodesCached };

export async function acceptMatch(
  localId: InternalId,
  providerId: InternalId,
  /** Injected for the same reason `proposeMatch` takes its search: no live calls. */
  lookup: Lookup = DEFAULT_LOOKUP,
): Promise<MigrationReport> {
  const report: MigrationReport = {
    watches: 0,
    ratings: 0,
    episodesMapped: 0,
    orphanedWatches: 0,
  };

  // Pulls the real title and episode list into the cache, and gives us the map to
  // migrate against.
  await lookup.title(providerId);
  const providerEpisodes = await lookup.episodes(providerId);
  const byNumber = new Map(providerEpisodes.map((e) => [`${e.season}:${e.number}`, e.id]));

  const localEpisodes = await db.episodes.where('seriesId').equals(localId).toArray();
  const episodeMap = new Map<InternalId, InternalId>();
  for (const episode of localEpisodes) {
    const match = byNumber.get(`${episode.season}:${episode.number}`);
    if (match) episodeMap.set(episode.id, match);
  }
  report.episodesMapped = episodeMap.size;

  const watches = await db.watches.where('seriesId').equals(localId).toArray();
  const ratings = await db.ratings.toArray();
  const libraryRow = await db.library.get(localId);
  const watchlistRow = await db.watchlist.get(localId);

  await db.transaction(
    'rw',
    db.watches,
    db.ratings,
    db.library,
    db.watchlist,
    db.titles,
    db.episodes,
    db.outbox,
    async () => {
      for (const watch of watches) {
        const target = episodeMap.get(watch.targetId);
        if (!target) {
          report.orphanedWatches++;
          continue;
        }
        // Deleted and re-added rather than updated: the ID encodes the target, and
        // leaving a stale one would break re-import's deduplication.
        const moved = {
          ...watch,
          id: watch.id.replace(watch.targetId, target),
          targetId: target,
          seriesId: providerId,
        };
        await db.watches.delete(watch.id);
        await db.watches.put(moved);
        // Both halves replicate, or the server keeps the row under the ID this just
        // retired and the next pull resurrects a history split across two sets of them.
        // The whole row: a tombstone is an upsert, and one carrying only the key
        // cannot be inserted for a row the server never received. §6.70.
        await enqueue('watches', watch as unknown as Record<string, unknown>, { deleted: true });
        await enqueue('watches', moved as unknown as Record<string, unknown>);
        report.watches++;
      }

      for (const rating of ratings) {
        const target =
          rating.targetId === localId ? providerId : episodeMap.get(rating.targetId);
        if (!target) continue;
        // A rating already on the matched ID wins: it was made against the real show.
        if (!(await db.ratings.get(target))) {
          const at = { ...rating, targetId: target };
          await db.ratings.put(at);
          await enqueue('ratings', at as unknown as Record<string, unknown>);
          report.ratings++;
        }
        await db.ratings.delete(rating.targetId);
        await enqueue('ratings', rating as unknown as Record<string, unknown>, { deleted: true });
      }

      if (libraryRow) {
        const existing = await db.library.get(providerId);
        await db.library.delete(localId);
        await enqueue('library', libraryRow as unknown as Record<string, unknown>, {
          deleted: true,
        });
        // Anything already tracked under the real ID is the deliberate row and wins.
        if (!existing) {
          const at = { ...libraryRow, titleId: providerId };
          await db.library.put(at);
          await enqueue('library', at as unknown as Record<string, unknown>);
        }
      }

      if (watchlistRow) {
        const existing = await db.watchlist.get(providerId);
        await db.watchlist.delete(localId);
        await enqueue('watchlist', watchlistRow as unknown as Record<string, unknown>, {
          deleted: true,
        });
        if (!existing) {
          const at = { ...watchlistRow, titleId: providerId };
          await db.watchlist.put(at);
          await enqueue('watchlist', at as unknown as Record<string, unknown>);
        }
      }

      // The placeholder episodes have served their purpose; the provider's list is
      // authoritative from here.
      for (const id of episodeMap.keys()) await db.episodes.delete(id);

      // The local title stays, pointing at the match. It is the only thing that stops a
      // re-import asking the same question again — the rows come back under the same
      // local ID, and this is what tells the next run where they belong.
      const local = await db.titles.get(localId);
      if (local) await db.titles.put({ ...local, matchedTo: providerId });
    },
  );

  return report;
}

export interface RunProgress {
  /** Titles looked at so far in this run. */
  done: number;
  /** Titles still to look at, including the one in flight. */
  left: number;
  /** Matched without asking. */
  matched: number;
  /** Waiting on a person, because more than one answer looked right. */
  asks: Proposal[];
}

/**
 * Work through the unmatched library, a few at a time.
 *
 * Resumable by construction rather than by bookkeeping: what is left to do is derived
 * from the database on every call, and each accepted match removes its own row from
 * that set. Closing the app mid-run loses nothing except the searches in flight, and
 * starting again picks up exactly where it stopped — which matters, because two hundred
 * shows is two hundred searches.
 *
 * `pace` exists because a provider will rate-limit a burst of them and the honest
 * response to that is to go slower, not to lose the tail of somebody's library.
 */
export async function runMatching(options: {
  /** How many titles to look at in this call. */
  limit?: number;
  /** Milliseconds between searches. */
  pace?: number;
  onProgress?: (progress: RunProgress) => void;
  signal?: AbortSignal;
  search?: (query: string) => Promise<SearchResult[]>;
  lookup?: Lookup;
  sleep?: (ms: number) => Promise<void>;
} = {}): Promise<RunProgress> {
  const {
    limit = Infinity,
    pace = 350,
    onProgress,
    signal,
    search,
    lookup,
    sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = options;

  const pending = await unmatchedTitles();
  const queue = pending.slice(0, limit === Infinity ? pending.length : limit);
  const progress: RunProgress = {
    done: 0,
    left: queue.length,
    matched: 0,
    asks: [],
  };

  for (const [index, title] of queue.entries()) {
    if (signal?.aborted) break;
    // Between searches rather than before the first: a run of one should not wait.
    if (index > 0 && pace > 0) await sleep(pace);

    try {
      const proposal = await proposeMatch(title, search);
      if (proposal.confident) {
        await acceptMatch(title.id, proposal.confident.id, lookup);
        progress.matched++;
      } else {
        progress.asks.push(proposal);
      }
    } catch {
      // One title the provider will not answer for must not end the run. It stays
      // unmatched, which is the state it was already in, and the next run tries again.
    }

    progress.done++;
    progress.left = queue.length - progress.done;
    onProgress?.({ ...progress, asks: [...progress.asks] });
  }

  return progress;
}
