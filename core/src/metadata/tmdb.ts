import { makeId } from '../domain/types.ts';
import type { CachedEpisode, CachedProviders, CachedTitle } from '../domain/types.ts';
import type { MetadataProvider, SearchResult } from './provider.ts';
import { getConfig } from '../config.ts';

/**
 * TMDB's own hosts, and what `config.tmdbBase` / `config.tmdbImage` replace.
 *
 * Read through a function rather than captured in a module constant: the config is bound
 * lazily — §6.47 found this module resolving against an empty one at import time — and a
 * constant would be the same mistake at a different address.
 */
export const TMDB_BASE = 'https://api.themoviedb.org/3';
export const TMDB_IMAGE = 'https://image.tmdb.org/t/p';

/*
 * Function declarations, not `const` arrows. `injection.test.ts` refuses a module-scope
 * `const` whose initialiser names an injected getter and exempts a `function` — and its
 * comment says why: "a `const` initialiser is not exempt — that is the shape the bug had".
 * These are not called at evaluation either way, and the guard is right not to try to tell
 * the difference from a line of text. §6.47, §6.151.
 */
function base() {
  return getConfig().tmdbBase ?? TMDB_BASE;
}
function image() {
  return getConfig().tmdbImage ?? TMDB_IMAGE;
}

/** Posters are streamed from TMDB's CDN rather than cached — iOS caps the Cache API at ~50 MB. */
const poster = (path?: string | null) => (path ? `${image()}/w342${path}` : undefined);
const backdrop = (path?: string | null) => (path ? `${image()}/w780${path}` : undefined);
const still = (path?: string | null) => (path ? `${image()}/w300${path}` : undefined);
const year = (date?: string | null) => (date ? Number(date.slice(0, 4)) || undefined : undefined);

/**
 * TMDB implementation.
 *
 * The read token is passed in rather than read from the environment here, so that a
 * server-side proxy can supply it later without touching this file. Calling TMDB
 * directly from the client exposes the key, which is acceptable for a personal
 * non-commercial build and is the first thing a backend should fix.
 */
export class TmdbProvider implements MetadataProvider {
  readonly name = 'tmdb';
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async get<T>(path: string, params: Record<string, string> = {}, signal?: AbortSignal) {
    const url = new URL(base() + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await fetch(url, {
      signal,
      headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`TMDB ${res.status} on ${path}`);
    return (await res.json()) as T;
  }

  /**
   * The genre id → name table, fetched once and kept for the life of the provider.
   *
   * A list endpoint returns `genre_ids: [18, 10765]` and a detail endpoint returns
   * `genres: [{id, name}]`, so the boundary can only hand out *names* — which is what
   * `SearchResult.genres` promises — if it holds the table. Two requests, once, cached on
   * the instance: the lists are about forty rows each and change roughly never.
   *
   * **A failure here is not a search failure.** The genre is the third line on a box; the
   * box is not worth losing over it. So the promise is cached even when it resolves to an
   * empty map, and the caller carries on with no genres rather than throwing — which is
   * the difference between "we could not label it" and "we could not look", and §6.57 is
   * the rule that they must not be the same thing.
   */
  private genreTable?: Promise<Map<number, string>>;

  private genres(signal?: AbortSignal): Promise<Map<number, string>> {
    this.genreTable ??= (async () => {
      type List = { genres?: Array<{ id: number; name: string }> };
      const table = new Map<number, string>();
      try {
        const lists = await Promise.all([
          this.get<List>('/genre/tv/list', {}, signal),
          this.get<List>('/genre/movie/list', {}, signal),
        ]);
        for (const list of lists) for (const g of list.genres ?? []) table.set(g.id, g.name);
      } catch {
        // Left empty on purpose — see the header. Not re-thrown and not retried per call.
      }
      return table;
    })();
    return this.genreTable;
  }

  async search(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
    type Multi = { results: Array<TmdbListItem & { media_type: string }> };

    /*
     * The search first and the genre table beside it, rather than after. The table is
     * cached after the first call, so this is one extra round trip in a session and none
     * thereafter — and running it in parallel means it costs nothing even then.
     */
    const [data, genres] = await Promise.all([
      this.get<Multi>('/search/multi', { query, include_adult: 'false' }, signal),
      this.genres(signal),
    ]);

    return data.results
      .filter((r) => r.media_type === 'tv' || r.media_type === 'movie')
      .map((r) => toResult(r, r.media_type === 'tv' ? 'tv' : 'movie', genres));
  }

  async getTitle(id: string, signal?: AbortSignal): Promise<CachedTitle | undefined> {
    const { type, raw } = split(id);
    const isShow = type === 'tv';

    type Detail = {
      id: number;
      name?: string;
      title?: string;
      overview?: string;
      poster_path?: string;
      backdrop_path?: string;
      first_air_date?: string;
      release_date?: string;
      runtime?: number;
      episode_run_time?: number[];
      number_of_seasons?: number;
      status?: string;
      in_production?: boolean;
      external_ids?: { imdb_id?: string; tvdb_id?: number };
      /** Named here, unlike the list endpoints, so this one needs no lookup table. */
      genres?: Array<{ id: number; name: string }>;
    };

    const d = await this.get<Detail>(
      `/${isShow ? 'tv' : 'movie'}/${raw}`,
      { append_to_response: 'external_ids' },
      signal,
    );

    return {
      id,
      kind: isShow ? 'show' : 'film',
      name: (isShow ? d.name : d.title) ?? 'Untitled',
      year: year(isShow ? d.first_air_date : d.release_date),
      overview: d.overview,
      posterUrl: poster(d.poster_path),
      backdropUrl: backdrop(d.backdrop_path),
      runtimeMin: d.runtime ?? d.episode_run_time?.[0],
      seasonCount: d.number_of_seasons,
      genres: d.genres?.length ? d.genres.map((g) => g.name) : undefined,
      // TMDB's tv status is one of Returning Series / Planned / In Production /
      // Ended / Canceled / Pilot. Only the last two mean no more episodes.
      ended: isShow ? d.status === 'Ended' || d.status === 'Canceled' : undefined,
      externalIds: {
        tmdb: d.id,
        imdb: d.external_ids?.imdb_id,
        tvdb: d.external_ids?.tvdb_id,
      },
      fetchedAt: Date.now(),
    };
  }

  async getEpisodes(seriesId: string, signal?: AbortSignal): Promise<CachedEpisode[]> {
    const { raw } = split(seriesId);
    // Iterate the seasons TMDB actually reports rather than assuming 1..N. Shows
    // have a season 0 for specials, and long-running series have gaps; guessing the
    // range either misses seasons or 404s on ones that do not exist.
    const detail = await this.get<{ seasons?: Array<{ season_number: number }> }>(
      `/tv/${raw}`,
      {},
      signal,
    );
    const seasonNumbers = (detail.seasons ?? []).map((s) => s.season_number).sort((a, b) => a - b);

    type Season = {
      episodes: Array<{
        id: number;
        season_number: number;
        episode_number: number;
        name?: string;
        overview?: string;
        air_date?: string;
        runtime?: number;
        still_path?: string;
      }>;
    };

    const out: CachedEpisode[] = [];
    // Seasons are fetched sequentially rather than in parallel to stay well under
    // TMDB's rate limit — One Piece alone has 23 seasons.
    for (const s of seasonNumbers) {
      const season = await this.get<Season>(`/tv/${raw}/season/${s}`, {}, signal);
      for (const e of season.episodes ?? []) {
        out.push({
          // TMDB's per-episode ID, which survives the season renumbering that would
          // break a positional key.
          id: makeId('tmdb', 'ep', e.id),
          seriesId,
          season: e.season_number,
          number: e.episode_number,
          name: e.name ?? `Episode ${e.episode_number}`,
          overview: e.overview,
          airDate: e.air_date,
          runtimeMin: e.runtime,
          stillUrl: still(e.still_path),
          fetchedAt: Date.now(),
        });
      }
    }
    return out;
  }

  async getWatchProviders(
    id: string,
    country: string,
    signal?: AbortSignal,
  ): Promise<CachedProviders | undefined> {
    const { type, raw } = split(id);

    type Res = {
      results: Record<
        string,
        {
          link?: string;
          flatrate?: Array<{ provider_name: string }>;
          rent?: Array<{ provider_name: string }>;
          buy?: Array<{ provider_name: string }>;
        }
      >;
    };

    const data = await this.get<Res>(
      `/${type === 'tv' ? 'tv' : 'movie'}/${raw}/watch/providers`,
      {},
      signal,
    );
    const region = data.results?.[country];
    if (!region) return undefined;

    const names = (list?: Array<{ provider_name: string }>) =>
      (list ?? []).map((p) => p.provider_name);

    return {
      id,
      country,
      flatrate: names(region.flatrate),
      rent: names(region.rent),
      buy: names(region.buy),
      // TMDB returns no deep links, only a link to their own /watch page.
      link: region.link,
      fetchedAt: Date.now(),
    };
  }

  async getRecommendations(id: string, signal?: AbortSignal): Promise<SearchResult[]> {
    const { type, raw } = split(id);
    const [data, genres] = await Promise.all([
      this.get<{ results: TmdbListItem[] }>(
        `/${type === 'tv' ? 'tv' : 'movie'}/${raw}/recommendations`,
        {},
        signal,
      ),
      this.genres(signal),
    ]);
    return (data.results ?? []).map((r) => toResult(r, type === 'tv' ? 'tv' : 'movie', genres));
  }

  async getTrending(signal?: AbortSignal): Promise<SearchResult[]> {
    const [data, genres] = await Promise.all([
      this.get<{ results: Array<TmdbListItem & { media_type?: string }> }>(
        '/trending/all/week',
        {},
        signal,
      ),
      this.genres(signal),
    ]);
    return (data.results ?? [])
      .filter((r) => r.media_type === 'tv' || r.media_type === 'movie')
      .map((r) => toResult(r, r.media_type === 'tv' ? 'tv' : 'movie', genres));
  }
}

interface TmdbListItem {
  id: number;
  name?: string;
  title?: string;
  overview?: string;
  poster_path?: string;
  first_air_date?: string;
  release_date?: string;
  /** Ids, not names. `TmdbProvider.genres` is the table that turns them into words. */
  genre_ids?: number[];
  /** Out of ten. Filters the shelf and is never drawn — `provider.ts` says why. */
  vote_average?: number;
}

/**
 * One list row, normalised.
 *
 * `search` had its own copy of this inline and the two drifted the moment a field was
 * added to one of them — which is what happened here, so the copy is gone and the three
 * list endpoints go through one function.
 */
function toResult(r: TmdbListItem, type: 'tv' | 'movie', genres?: Map<number, string>): SearchResult {
  const isShow = type === 'tv';
  const named = (r.genre_ids ?? [])
    .map((id) => genres?.get(id))
    .filter((name): name is string => !!name);
  return {
    id: makeId('tmdb', isShow ? 'tv' : 'movie', r.id),
    kind: isShow ? 'show' : 'film',
    name: (isShow ? r.name : r.title) ?? 'Untitled',
    year: year(isShow ? r.first_air_date : r.release_date),
    posterUrl: poster(r.poster_path),
    overview: r.overview,
    // Undefined rather than `[]`: "nothing came back" and "this has no genres" are the
    // same fact here, and an empty array reads on the box as a line that failed to fill.
    genres: named.length ? named : undefined,
    // 0 is TMDB's "nobody has voted", not a score of zero.
    rating: r.vote_average || undefined,
  };
}

function split(id: string) {
  const [, type, ...rest] = id.split(':');
  return { type, raw: rest.join(':') };
}
