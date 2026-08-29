import { makeId } from '../domain/types.ts';
import type { CachedEpisode, CachedProviders, CachedTitle } from '../domain/types.ts';
import type { MetadataProvider, SearchResult } from './provider.ts';
import { dayKey } from '../time.ts';

/**
 * Offline provider used when no TMDB token is configured.
 *
 * This exists so the app is runnable and testable without credentials, and so tests
 * never depend on a live third-party service. It generates plausible episode data,
 * including a deliberately long single-season show to exercise the anime case where
 * TMDB collapses a series into one hundred-episode block.
 */

interface FixtureShow {
  id: number;
  kind: 'show' | 'film';
  name: string;
  year: number;
  overview: string;
  seasons?: Array<{ episodes: number; runtime: number }>;
  runtime?: number;
  /** Ended shows exercise the auto-complete path; the others must not trigger it. */
  ended?: boolean;
  /**
   * When episode 1 aired, in days before now. Weekly from there, across seasons.
   *
   * Every show used to start on the same day — `Date.now() - 40 weeks`, written once for
   * all of them — with the consequence that a show only reached the future if it had more
   * than forty episodes. One of these four does, so the calendar could only ever show one
   * show, one row per date, and not a single premiere or finale: the screen whose default
   * notification setting is called *Premieres & finales* had never been photographed with
   * either on it. §6.146.
   *
   * Per show, so the library is a library: one show finishing in three weeks, one airing
   * now with a season boundary just ahead, one long since ended.
   */
  startedDaysAgo: number;
}

const FIXTURES: FixtureShow[] = [
  {
    id: 1,
    kind: 'show',
    name: 'The Long Dark',
    year: 2021,
    overview: 'A survival drama set across three winters in a coastal town.',
    seasons: [
      { episodes: 8, runtime: 52 },
      { episodes: 10, runtime: 55 },
      // Three winters, as the line above has always said. The third is the one still
      // going out: two seasons behind it are fully aired, which is what a catch-up sheet
      // needs to have a season step at all, and the boundary between them is inside the
      // calendar's sixty days — today's season finale, next week's premiere, a series
      // finale six weeks out. All four kinds `classify` knows, on the screen that draws
      // a chip for three of them.
      { episodes: 6, runtime: 55 },
    ],
    startedDaysAgo: 119,
  },
  {
    id: 2,
    kind: 'show',
    name: 'Kitchen Nightshift',
    year: 2023,
    overview: 'A half-hour comedy about the staff of an all-night diner.',
    seasons: [{ episodes: 12, runtime: 22 }],
    ended: true,
    // Long over. An ended show has nothing upcoming, which is a case the calendar has to
    // be right about too — it must not appear.
    startedDaysAgo: 280,
  },
  {
    id: 3,
    kind: 'show',
    name: 'Hollow Crown Saga',
    year: 2019,
    // One long season on purpose: this is how TMDB renders many long-running anime.
    overview: 'A long-running animated epic with continuous episode numbering.',
    seasons: [{ episodes: 96, runtime: 24 }],
    // Ninety-two weeks in, three episodes left. The last of them is a series finale inside
    // the window, and its weekday matches The Long Dark's, so three dates carry two rows —
    // which is the whole reason the calendar groups by day and had never once been shown
    // doing it.
    startedDaysAgo: 644,
  },
  {
    id: 4,
    kind: 'film',
    name: 'Quiet Harbour',
    year: 2024,
    overview: 'Two estranged siblings return to their father’s fishing village.',
    runtime: 118,
    // A film has no episodes, so this is never read. Required rather than optional so the
    // next fixture cannot be added without deciding when it aired.
    startedDaysAgo: 280,
  },
];

const titleId = (f: FixtureShow) => makeId('tmdb', f.kind === 'show' ? 'tv' : 'movie', f.id);

export class FixtureProvider implements MetadataProvider {
  readonly name = 'fixtures';

  async search(query: string): Promise<SearchResult[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return FIXTURES.filter((f) => f.name.toLowerCase().includes(q)).map((f) => ({
      id: titleId(f),
      kind: f.kind,
      name: f.name,
      year: f.year,
      overview: f.overview,
    }));
  }

  async getTitle(id: string): Promise<CachedTitle | undefined> {
    const f = FIXTURES.find((x) => titleId(x) === id);
    if (!f) return undefined;
    return {
      id,
      kind: f.kind,
      name: f.name,
      year: f.year,
      overview: f.overview,
      runtimeMin: f.runtime ?? f.seasons?.[0]?.runtime,
      seasonCount: f.seasons?.length,
      ended: f.kind === 'show' ? Boolean(f.ended) : undefined,
      fetchedAt: Date.now(),
    };
  }

  async getEpisodes(seriesId: string): Promise<CachedEpisode[]> {
    const f = FIXTURES.find((x) => titleId(x) === seriesId);
    if (!f?.seasons) return [];

    const out: CachedEpisode[] = [];
    // Weekly from the show's own start date, so most have aired and the tail has not. That
    // exercises the "don't offer unaired episodes" rule in Up Next — and, since the start
    // is per show rather than shared, it is what lets more than one show be airing at once.
    const start = Date.now() - f.startedDaysAgo * 24 * 60 * 60 * 1000;
    let n = 0;

    f.seasons.forEach((season, si) => {
      for (let e = 1; e <= season.episodes; e++) {
        const airedAt = start + n * 7 * 24 * 60 * 60 * 1000;
        out.push({
          id: makeId('tmdb', 'ep', `${f.id}-${si + 1}-${e}`),
          seriesId,
          season: si + 1,
          number: e,
          name: `Episode ${e}`,
          // The viewer's calendar, so a fixture episode dated "today" really is today
          // wherever the run happens. The UTC spelling put the boundary in a different
          // place from the code reading it back. §6.66.
          airDate: dayKey(airedAt),
          runtimeMin: season.runtime,
          fetchedAt: Date.now(),
        });
        n++;
      }
    });
    return out;
  }

  async getRecommendations(id: string): Promise<SearchResult[]> {
    // Everything except the title asked about, so discovery has something to
    // filter and the exclusion logic is exercised offline.
    return FIXTURES.filter((f) => titleId(f) !== id).map((f) => ({
      id: titleId(f),
      kind: f.kind,
      name: f.name,
      year: f.year,
      overview: f.overview,
    }));
  }

  async getTrending(): Promise<SearchResult[]> {
    return FIXTURES.map((f) => ({
      id: titleId(f),
      kind: f.kind,
      name: f.name,
      year: f.year,
      overview: f.overview,
    }));
  }

  async getWatchProviders(id: string, country: string): Promise<CachedProviders | undefined> {
    /*
     * Nothing for a title this provider has never heard of, which is what a real one does.
     *
     * This returned availability for *any* ID, so the one screen that makes a claim about
     * the outside world made it for shows that do not exist here — and a fixture that
     * never says "no" hides every bug that depends on being told no. §6.43 swept for
     * fixtures smaller than reality; this is the same shape pointing the other way.
     */
    if (!FIXTURES.some((f) => titleId(f) === id)) return undefined;
    return {
      id,
      country,
      flatrate: ['Example Streaming'],
      rent: [],
      buy: [],
      fetchedAt: Date.now(),
    };
  }
}
