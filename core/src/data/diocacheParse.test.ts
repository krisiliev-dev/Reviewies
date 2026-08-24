import { describe, expect, it } from 'vitest';
import { parseDioCache } from './diocacheParse';

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
