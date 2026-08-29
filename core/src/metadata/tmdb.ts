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

  async search(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
    type Multi = {
      results: Array<{
        id: number;
        media_type: string;
        name?: string;
        title?: string;
        overview?: string;
        poster_path?: string;
        first_air_date?: string;
        release_date?: string;
      }>;
    };

    const data = await this.get<Multi>('/search/multi', { query, include_adult: 'false' }, signal);

    return data.results
      .filter((r) => r.media_type === 'tv' || r.media_type === 'movie')
      .map((r) => {
        const isShow = r.media_type === 'tv';
        return {
          id: makeId('tmdb', isShow ? 'tv' : 'movie', r.id),
          kind: isShow ? ('show' as const) : ('film' as const),
          name: (isShow ? r.name : r.title) ?? 'Untitled',
          year: year(isShow ? r.first_air_date : r.release_date),
          posterUrl: poster(r.poster_path),
          overview: r.overview,
        };
      });
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
    const data = await this.get<{ results: TmdbListItem[] }>(
      `/${type === 'tv' ? 'tv' : 'movie'}/${raw}/recommendations`,
      {},
      signal,
    );
    return (data.results ?? []).map((r) => toResult(r, type === 'tv' ? 'tv' : 'movie'));
  }

  async getTrending(signal?: AbortSignal): Promise<SearchResult[]> {
    const data = await this.get<{ results: Array<TmdbListItem & { media_type?: string }> }>(
      '/trending/all/week',
      {},
      signal,
    );
    return (data.results ?? [])
      .filter((r) => r.media_type === 'tv' || r.media_type === 'movie')
      .map((r) => toResult(r, r.media_type === 'tv' ? 'tv' : 'movie'));
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
}

function toResult(r: TmdbListItem, type: 'tv' | 'movie'): SearchResult {
  const isShow = type === 'tv';
  return {
    id: makeId('tmdb', isShow ? 'tv' : 'movie', r.id),
    kind: isShow ? 'show' : 'film',
    name: (isShow ? r.name : r.title) ?? 'Untitled',
    year: year(isShow ? r.first_air_date : r.release_date),
    posterUrl: poster(r.poster_path),
    overview: r.overview,
  };
}

function split(id: string) {
  const [, type, ...rest] = id.split(':');
  return { type, raw: rest.join(':') };
}
