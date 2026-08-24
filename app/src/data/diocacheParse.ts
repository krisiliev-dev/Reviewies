/**
 * Read a TV Time library out of `DioCache.db`'s JSON payloads.
 *
 * `DioCache.db` is a Dio (the Dart/Flutter HTTP client) response cache: one table,
 * `cache_dio`, whose `content` column holds raw TV Time API responses. TV Time was a
 * Flutter app, so it cached its own API traffic — which is the only reason recovery is
 * possible at all now that the servers are gone.
 *
 * The response shapes here were taken from `Marak123/tvtime-rescue-data`
 * (`tvtime_rescue/extract/parse.py` and its test fixtures), not guessed at. Four
 * distinct shapes matter:
 *
 *   `{ data: { objects: [{ entity_type: 'movie' | 'series', meta, extended, … }] } }`
 *   `{ shows: [{ id, name, watched_episode_count, is_archived, … }] }`
 *   `{ data: { type: 'watch', objects: [{ uuid, watched_at, runtime, … }] }}`
 *   a bare array of episodes carrying `season_number`, `number` and `seen`
 *
 * This module is deliberately pure: SQLite lives next door. A recovered cache is
 * ragged — half-written responses, duplicated pages, shapes that changed across app
 * versions — so everything here skips what it cannot read rather than throwing.
 */

export interface DioMovie {
  title: string;
  year?: number;
  imdbId?: string;
  runtimeMin?: number;
  watched: boolean;
  watchLater: boolean;
  watchedAt?: string;
  rewatchCount: number;
  /** TV Time's ten-point scale. Converted at the point of import, not here. */
  rating?: number;
}

export interface DioSeries {
  id: number;
  title: string;
  watchedEpisodes: number;
  airedEpisodes: number;
  archived: boolean;
  forLater: boolean;
  upToDate: boolean;
  favorite: boolean;
}

export interface DioEpisode {
  episodeId: number;
  showId?: number;
  show: string;
  season: number;
  number: number;
  name: string;
  seen: boolean;
  seenDate?: string;
  timesWatched: number;
}

export interface DioLibrary {
  movies: DioMovie[];
  series: DioSeries[];
  episodes: DioEpisode[];
  /** Cache rows that held no recognisable library data. Reported, not an error. */
  unrecognised: number;
}

type Json = Record<string, unknown>;

const isObject = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x);

const num = (x: unknown): number | undefined =>
  typeof x === 'number' && Number.isFinite(x) ? x : undefined;

const str = (x: unknown): string | undefined =>
  typeof x === 'string' && x.trim() ? x.trim() : undefined;

/** Every object anywhere inside a nested structure. */
function* walk(root: unknown): Generator<Json> {
  const stack: unknown[] = [root];
  while (stack.length) {
    const x = stack.pop();
    if (isObject(x)) {
      yield x;
      stack.push(...Object.values(x));
    } else if (Array.isArray(x)) {
      stack.push(...x);
    }
  }
}

function objectsOf(payload: unknown): Json[] {
  if (!isObject(payload)) return [];
  const data = payload.data;
  if (!isObject(data) || !Array.isArray(data.objects)) return [];
  return data.objects.filter(isObject);
}

export function parseDioCache(payloads: unknown[]): DioLibrary {
  const movies = new Map<string, DioMovie>();
  const series = new Map<number, DioSeries>();
  const episodes = new Map<number, DioEpisode>();
  let recognised = 0;

  for (const payload of payloads) {
    let used = false;

    // --- Movies, from the library listing ---------------------------------
    for (const o of objectsOf(payload)) {
      if (o.entity_type !== 'movie') continue;
      const meta = isObject(o.meta) ? o.meta : {};
      const name = str(meta.name) ?? str(o.name);
      if (!name) continue;

      used = true;
      const key = str(meta.uuid) ?? str(meta.imdb_id) ?? str(o.uuid) ?? name;
      const extended = isObject(o.extended) ? o.extended : {};
      const filters = Array.isArray(o.filter) ? o.filter.map(String) : [];

      const existing = movies.get(key);
      const watchedAt = str(o.watched_at);
      const record: DioMovie = existing ?? {
        title: name,
        watched: false,
        watchLater: false,
        rewatchCount: 0,
      };

      record.watched = record.watched || filters.includes('watched') || extended.is_watched === true;
      record.watchLater = record.watchLater || filters.includes('watch_later');
      // The cache holds the same movie under several responses; the latest date wins.
      if (watchedAt && (!record.watchedAt || watchedAt > record.watchedAt)) {
        record.watchedAt = watchedAt;
      }
      record.rewatchCount = Math.max(record.rewatchCount, num(o.rewatch_count) ?? 0);
      record.rating = Math.max(record.rating ?? 0, num(extended.rating) ?? 0) || undefined;
      record.imdbId ??= str(meta.imdb_id);
      // TV Time stores runtime in seconds.
      record.runtimeMin ??= num(meta.runtime) ? Math.round(num(meta.runtime)! / 60) : undefined;
      record.year ??= Number(String(str(meta.first_release_date) ?? '').slice(0, 4)) || undefined;

      movies.set(key, record);
    }

    // --- Series, from the progress endpoint --------------------------------
    if (isObject(payload) && Array.isArray(payload.shows)) {
      for (const s of payload.shows) {
        const id = isObject(s) ? num(s.id) : undefined;
        if (id === undefined) continue;
        used = true;
        series.set(id, {
          id,
          title: str((s as Json).name) ?? '',
          watchedEpisodes: num((s as Json).watched_episode_count) ?? 0,
          airedEpisodes: num((s as Json).aired_episode_count) ?? 0,
          archived: (s as Json).is_archived === true,
          forLater: (s as Json).is_for_later === true,
          upToDate: (s as Json).is_up_to_date === true,
          favorite: (s as Json).is_favorite === true,
        });
      }
    }

    // --- Episodes, wherever they turn up -----------------------------------
    // These are not a complete episode list: TV Time only cached the episodes near
    // your position. What is here is accurate; it is simply not everything.
    for (const x of walk(payload)) {
      if (!('season_number' in x) || !('number' in x)) continue;
      if (!('seen' in x || 'is_watched' in x || 'seen_date' in x)) continue;
      const episodeId = num(x.id);
      if (episodeId === undefined) continue;

      used = true;
      const show = isObject(x.show) ? x.show : {};
      const seen = x.seen === true || x.is_watched === true;
      const seenDate = str(x.seen_date);
      const times = num(x.nb_times_watched) ?? 0;

      const existing = episodes.get(episodeId);
      if (existing) {
        existing.seen = existing.seen || seen;
        existing.timesWatched = Math.max(existing.timesWatched, times);
        existing.seenDate ??= seenDate;
      } else {
        episodes.set(episodeId, {
          episodeId,
          showId: num(show.id),
          show: str(show.name) ?? '',
          season: num(x.season_number) ?? 0,
          number: num(x.number) ?? 0,
          name: str(x.name) ?? '',
          seen,
          seenDate,
          timesWatched: times,
        });
      }
    }

    if (used) recognised++;
  }

  return {
    movies: [...movies.values()],
    series: [...series.values()].sort((a, b) => a.title.localeCompare(b.title)),
    episodes: [...episodes.values()].sort(
      (a, b) => a.show.localeCompare(b.show) || a.season - b.season || a.number - b.number,
    ),
    unrecognised: payloads.length - recognised,
  };
}
