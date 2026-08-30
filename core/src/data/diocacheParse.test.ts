import { describe, expect, it } from 'vitest';
import { parseDioCache } from './diocacheParse.ts';

/**
 * Fixtures mirror the response shapes documented by the rescue tool's own test file
 * (`tests/test_parse.py` in Marak123/tvtime-rescue-data), because getting these wrong
 * means silently failing to recover the only surviving copy of someone's history.
 */

const MOVIE_RESPONSE = {
  status: 'success',
  data: {
    type: 'list',
    objects: [
      {
        uuid: 'm1',
        entity_type: 'movie',
        rewatch_count: 1,
        watched_at: '2026-06-01T10:00:00Z',
        filter: ['watched'],
        extended: { is_watched: true, rating: 8 },
        meta: {
          uuid: 'm1',
          name: 'Quiet Harbour',
          first_release_date: '2020-05-01',
          imdb_id: 'tt0000001',
          runtime: 6000,
        },
      },
    ],
  },
};

const SHOWS_RESPONSE = {
  shows: [
    {
      id: 12345,
      name: 'The Long Dark',
      watched_episode_count: 20,
      aired_episode_count: 24,
      status: 'Continuing',
      is_favorite: true,
      is_archived: false,
      is_for_later: false,
      is_up_to_date: false,
    },
  ],
};

/**
 * The shape a real recovered cache actually holds its series in.
 *
 * Taken from a `DioCache.db` pulled off a phone in August 2026, keys intact and only the
 * names changed. That cache held **0** payloads with a top-level `shows` array — the one
 * place this parser looked for series — and **940** objects like this one, 235 distinct,
 * sitting in `data.objects` beside the movies it read without trouble. The whole
 * television half of a library came back empty while every number on the screen agreed the
 * import had gone well.
 *
 * `type: 'follow'` is the difference from `SHOWS_RESPONSE`: this is the library listing,
 * not the progress endpoint, so it carries no episode counts. It does carry the two things
 * that decide where a show lands — `meta.id` and `meta.name` — and a `filter` array whose
 * real values across that cache were `all`, `continuing`, `stopped`, `up_to_date`,
 * `not_started_yet` and `watch_later`.
 */
const FOLLOWED_SERIES_RESPONSE = {
  status: 'success',
  data: {
    user_id: 1,
    type: 'list',
    objects: [
      {
        uuid: 's-uuid-1',
        type: 'follow',
        entity_type: 'series',
        created_at: '2023-06-15T14:08:37.465400Z',
        updated_at: '2024-03-30T21:31:47.879089Z',
        filter: ['all', 'up_to_date'],
        extended: { rating: 9, rating_count: 10, follower_count: 5, comment_count: 2 },
        meta: { uuid: 's-uuid-1', id: 275274, name: 'The Long Dark', is_ended: false },
      },
      {
        uuid: 's-uuid-2',
        type: 'follow',
        entity_type: 'series',
        filter: ['all', 'watch_later'],
        meta: { uuid: 's-uuid-2', id: 305089, name: 'Quiet Harbour: The Series' },
      },
    ],
  },
};

const EPISODES_RESPONSE = [
  {
    id: 5001,
    name: 'Pilot',
    number: 1,
    season_number: 1,
    seen: true,
    seen_date: '2026-01-02 20:00:00',
    nb_times_watched: 2,
    show: { id: 12345, name: 'The Long Dark' },
  },
  {
    id: 5002,
    name: 'Thaw',
    number: 2,
    season_number: 1,
    seen: false,
    seen_date: '',
    nb_times_watched: 0,
    show: { id: 12345, name: 'The Long Dark' },
  },
];

describe('movies', () => {
  it('reads a watched film with its rating and rewatches', () => {
    const { movies } = parseDioCache([MOVIE_RESPONSE]);

    expect(movies).toHaveLength(1);
    expect(movies[0]).toMatchObject({
      title: 'Quiet Harbour',
      watched: true,
      rewatchCount: 1,
      rating: 8,
      year: 2020,
      imdbId: 'tt0000001',
    });
  });

  it('converts runtime out of seconds', () => {
    // TV Time stores it in seconds; recording 6000 minutes would wreck every stat.
    expect(parseDioCache([MOVIE_RESPONSE]).movies[0].runtimeMin).toBe(100);
  });

  it('reads watch_later from the filter list', () => {
    const later = structuredClone(MOVIE_RESPONSE);
    later.data.objects[0].filter = ['watch_later'];
    later.data.objects[0].extended.is_watched = false;

    const [movie] = parseDioCache([later]).movies;
    expect(movie.watchLater).toBe(true);
    expect(movie.watched).toBe(false);
  });

  it('merges the same film appearing in several cached responses', () => {
    // The cache holds one movie under many endpoints; each is a partial view.
    const second = structuredClone(MOVIE_RESPONSE);
    second.data.objects[0].watched_at = '2026-07-01T10:00:00Z';
    second.data.objects[0].rewatch_count = 3;

    const { movies } = parseDioCache([MOVIE_RESPONSE, second]);
    expect(movies).toHaveLength(1);
    expect(movies[0].rewatchCount).toBe(3);
    expect(movies[0].watchedAt).toBe('2026-07-01T10:00:00Z');
  });

  it('keeps the latest watch date rather than the last one seen', () => {
    const earlier = structuredClone(MOVIE_RESPONSE);
    earlier.data.objects[0].watched_at = '2020-01-01T00:00:00Z';

    expect(parseDioCache([MOVIE_RESPONSE, earlier]).movies[0].watchedAt).toBe(
      '2026-06-01T10:00:00Z',
    );
  });

  it('treats an absent rating as absent rather than zero', () => {
    const unrated = structuredClone(MOVIE_RESPONSE);
    unrated.data.objects[0].extended.rating = 0;
    expect(parseDioCache([unrated]).movies[0].rating).toBeUndefined();
  });

  it('ignores a movie with no name at all', () => {
    const nameless = structuredClone(MOVIE_RESPONSE);
    nameless.data.objects[0].meta.name = '';
    expect(parseDioCache([nameless]).movies).toHaveLength(0);
  });
});

describe('series', () => {
  it('reads progress and flags', () => {
    const [show] = parseDioCache([SHOWS_RESPONSE]).series;
    expect(show).toMatchObject({
      id: 12345,
      title: 'The Long Dark',
      watchedEpisodes: 20,
      airedEpisodes: 24,
      favorite: true,
      archived: false,
    });
  });

  it('lets a later response correct an earlier one', () => {
    const newer = structuredClone(SHOWS_RESPONSE);
    newer.shows[0].watched_episode_count = 24;
    newer.shows[0].is_up_to_date = true;

    const { series } = parseDioCache([SHOWS_RESPONSE, newer]);
    expect(series).toHaveLength(1);
    expect(series[0].watchedEpisodes).toBe(24);
    expect(series[0].upToDate).toBe(true);
  });
});

describe('episodes', () => {
  it('finds episodes wherever they are nested', () => {
    const { episodes } = parseDioCache([{ anything: { deeply: { nested: EPISODES_RESPONSE } } }]);
    expect(episodes).toHaveLength(2);
  });

  it('keeps the watched flag and the rewatch count', () => {
    const [first] = parseDioCache([EPISODES_RESPONSE]).episodes;
    expect(first).toMatchObject({ seen: true, timesWatched: 2, season: 1, number: 1 });
  });

  it('does not invent a watch for an unseen episode', () => {
    const { episodes } = parseDioCache([EPISODES_RESPONSE]);
    expect(episodes.find((e) => e.number === 2)?.seen).toBe(false);
  });

  it('never downgrades a watched episode when a staler copy says otherwise', () => {
    // The cache genuinely contains both, from responses of different ages. Trusting
    // the last one seen would randomly erase watches.
    const stale = structuredClone(EPISODES_RESPONSE);
    stale[0].seen = false;
    stale[0].nb_times_watched = 0;

    const { episodes } = parseDioCache([EPISODES_RESPONSE, stale]);
    expect(episodes[0].seen).toBe(true);
    expect(episodes[0].timesWatched).toBe(2);
  });

  it('links episodes to their show', () => {
    expect(parseDioCache([EPISODES_RESPONSE]).episodes[0].showId).toBe(12345);
  });

  it('ignores something that merely looks episode-shaped', () => {
    // No seen/is_watched/seen_date means it is a catalogue entry, not history.
    expect(parseDioCache([[{ id: 1, season_number: 1, number: 1 }]]).episodes).toHaveLength(0);
  });
});

describe('ragged input', () => {
  it('reports how many cached rows held nothing usable', () => {
    const { unrecognised } = parseDioCache([{ status: 'success' }, null, 42, MOVIE_RESPONSE]);
    expect(unrecognised).toBe(3);
  });

  it('survives a mixture of everything at once', () => {
    const library = parseDioCache([MOVIE_RESPONSE, SHOWS_RESPONSE, EPISODES_RESPONSE, null]);
    expect(library.movies).toHaveLength(1);
    expect(library.series).toHaveLength(1);
    expect(library.episodes).toHaveLength(2);
  });

  it('returns empty rather than throwing on nothing at all', () => {
    expect(parseDioCache([])).toMatchObject({ movies: [], series: [], episodes: [] });
  });
});

/**
 * Series in the library listing, which is where a recovered cache actually keeps them.
 *
 * The parser read movies out of `data.objects` and series only out of a `shows` array, so
 * a cache holding one and not the other lost every show it had. Found by importing a real
 * one: 235 series in the file, 0 in the result, and an "Imported 115 watches" message over
 * the top of it.
 */
describe('series from the library listing rather than the progress endpoint', () => {
  it('reads a followed series that no `shows` array mentions', () => {
    const library = parseDioCache([FOLLOWED_SERIES_RESPONSE]);
    expect(library.series.map((s) => s.title).sort()).toEqual([
      'Quiet Harbour: The Series',
      'The Long Dark',
    ]);
  });

  it('keeps the id, because that is what the show is filed under', () => {
    // `tvtimeSeriesId` builds the library key from it; without it two shows with the same
    // name collapse into one, and a re-import cannot correct anything.
    const { series } = parseDioCache([FOLLOWED_SERIES_RESPONSE]);
    expect(series.find((s) => s.title === 'The Long Dark')?.id).toBe(275274);
  });

  it('carries the two filter values the importer acts on', () => {
    const { series } = parseDioCache([FOLLOWED_SERIES_RESPONSE]);
    const long = series.find((s) => s.id === 275274);
    const quiet = series.find((s) => s.id === 305089);
    // `up_to_date` decides completed against watching; `watch_later` decides the watchlist.
    expect(long?.upToDate, 'up_to_date not carried through').toBe(true);
    expect(long?.forLater).toBe(false);
    expect(quiet?.forLater, 'watch_later not carried through').toBe(true);
    expect(quiet?.upToDate).toBe(false);
  });

  it('claims no episode counts it was never told', () => {
    // A follow object has no progress in it. Zero here means "not stated", and the
    // importer must not read it as "you have watched none of it".
    const { series } = parseDioCache([FOLLOWED_SERIES_RESPONSE]);
    for (const s of series) {
      expect(s.watchedEpisodes).toBe(0);
      expect(s.airedEpisodes).toBe(0);
    }
  });

  it('still reads the progress endpoint where a cache has one', () => {
    // The shape that already worked has to keep working: some caches hold both.
    const { series } = parseDioCache([SHOWS_RESPONSE, FOLLOWED_SERIES_RESPONSE]);
    expect(series.map((s) => s.id).sort((a, b) => a - b)).toEqual([12345, 275274, 305089]);
    expect(series.find((s) => s.id === 12345)?.watchedEpisodes).toBe(20);
  });

  it('does not mistake a followed movie for a series', () => {
    const { series, movies } = parseDioCache([MOVIE_RESPONSE, FOLLOWED_SERIES_RESPONSE]);
    expect(series).toHaveLength(2);
    expect(movies).toHaveLength(1);
  });
});
