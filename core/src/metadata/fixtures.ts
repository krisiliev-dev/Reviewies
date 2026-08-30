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
  /**
   * What it is, in words — the third line on a browse box. `docs/design/architecture.md` section 5.
   *
   * Required rather than optional, and the five differ from each other on purpose: a
   * genre filter that every fixture answers to is a control this repository's harness can
   * photograph and cannot test. Two of the five share `Drama`, so the filter is a real
   * partition rather than five singletons.
   */
  genres: string[];
  /**
   * The crowd's score out of ten, which filters and is never printed.
   *
   * Spread deliberately across `WELL_RATED`: three fixtures clear it and two do not, so
   * turning the filter on visibly changes the shelf. A fixture set where every row passes
   * a filter is a fixture set that cannot show the filter working.
   */
  rating: number;
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
  /**
   * How the episodes come out.
   *
   * `weekly` is one a week from `startedDaysAgo`, counting across seasons. `drop` is a
   * whole season at once — a streaming original — with `DROP_GAP` between seasons.
   *
   * Every fixture was weekly, so the calendar's day grouping had never had more than two
   * rows to group: the case it exists **for** — eight episodes under one heading — could
   * not be produced. §6.146's finding, one layer down. Required rather than optional, so
   * the next fixture cannot be added without deciding. §6.149.
   */
  cadence: 'weekly' | 'drop';
}

/**
 * A year between dropped seasons, which is what the streamers do.
 *
 * A number rather than a per-season field: the point of the fixture is the *shape* — a
 * whole season on one date — and a second knob would be a second thing to get wrong.
 */
const DROP_GAP = 365;

const FIXTURES: FixtureShow[] = [
  {
    id: 1,
    kind: 'show',
    name: 'The Long Dark',
    year: 2021,
    overview: 'A survival drama set across three winters in a coastal town.',
    genres: ['Drama'],
    rating: 8.2,
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
    cadence: 'weekly',
  },
  {
    id: 2,
    kind: 'show',
    name: 'Kitchen Nightshift',
    year: 2023,
    overview: 'A half-hour comedy about the staff of an all-night diner.',
    genres: ['Comedy'],
    rating: 6.4,
    seasons: [{ episodes: 12, runtime: 22 }],
    ended: true,
    // Long over. An ended show has nothing upcoming, which is a case the calendar has to
    // be right about too — it must not appear.
    startedDaysAgo: 280,
    cadence: 'weekly',
  },
  {
    id: 3,
    kind: 'show',
    name: 'Hollow Crown Saga',
    year: 2019,
    // One long season on purpose: this is how TMDB renders many long-running anime.
    overview: 'A long-running animated epic with continuous episode numbering.',
    genres: ['Animation', 'Adventure'],
    rating: 7.9,
    seasons: [{ episodes: 96, runtime: 24 }],
    // Ninety-two weeks in, three episodes left. The last of them is a series finale inside
    // the window, and its weekday matches The Long Dark's, so three dates carry two rows —
    // which is the whole reason the calendar groups by day and had never once been shown
    // doing it.
    //
    // `ended` because it is: TMDB marks a show `Ended` once the last season is the last one,
    // which is often before the finale has aired. It is the **only** airing fixture that is
    // over, so the other two are the case §6.150 is about — a last known episode that is a
    // season finale and not the end of anything.
    ended: true,
    startedDaysAgo: 644,
    cadence: 'weekly',
  },
  {
    id: 4,
    kind: 'film',
    name: 'Quiet Harbour',
    year: 2024,
    overview: 'Two estranged siblings return to their father’s fishing village.',
    genres: ['Drama'],
    rating: 7.1,
    runtime: 118,
    // A film has no episodes, so neither of these is ever read. Required rather than
    // optional so the next fixture cannot be added without deciding.
    startedDaysAgo: 280,
    cadence: 'weekly',
  },
  {
    id: 5,
    kind: 'show',
    name: 'Salt Flats',
    year: 2024,
    overview: 'A border-town crime series released a season at a time.',
    genres: ['Crime', 'Drama'],
    rating: 8.6,
    seasons: [
      { episodes: 8, runtime: 47 },
      { episodes: 8, runtime: 47 },
    ],
    /*
     * The case no fixture could produce: a whole season on one date.
     *
     * Season 1 dropped 361 days ago and is watched through; season 2 drops in **four**,
     * eight episodes at once, on a date no other show is using — 361 is not a multiple of
     * seven, and every other fixture is weekly from a multiple of seven, so the drop gets
     * a heading to itself. That is the shape the calendar groups by day *for*, and it had
     * never been rendered.
     *
     * Nothing of it has aired unwatched, so it stays out of Up Next — a show you finished
     * and are waiting on, which is also the state a person in this position is actually in.
     *
     * ## Four rather than twenty-four, and why it took four sprints
     *
     * §6.178 filed `formatDay`'s 2–6 day branch as unphotographed — it returns a bare
     * weekday, *"Sunday"*, no date — and §6.179 and §6.180 each carried it forward calling
     * it "cheap to reach by moving a fixture's air date". §6.181 worked out why nobody had:
     * it is not cheap on a weekly show, it is **impossible**. A weekly cadence puts every
     * air date at `7n - startedDaysAgo` days out, so one show can only ever produce day
     * offsets from a single residue class mod 7, and this library has exactly one airing
     * weekly show — The Long Dark, at 119, whose whole comment above is about the today
     * and next-week headings that residue buys. Moving it would trade one photographed
     * state for another.
     *
     * A *drop* has no such arithmetic: its date is one number. 341 was chosen so the drop
     * would land on a day of its own, and 361 does that just as well — 361 mod 7 is 4, so
     * it still misses every weekly date — while landing inside the window that had never
     * been drawn. The calendar now shows a bare weekday heading with eight episodes under
     * it, which is two states in one row rather than one.
     */
    startedDaysAgo: 361,
    cadence: 'drop',
  },
];

const titleId = (f: FixtureShow) => makeId('tmdb', f.kind === 'show' ? 'tv' : 'movie', f.id);

/**
 * A fixture as the boundary hands it out.
 *
 * Written once rather than three times. It was three — `search`, `getRecommendations` and
 * `getTrending` each spelled the same five fields — and the moment a sixth was added it
 * would have gone into one of them, which is the drift `tmdb.ts`'s own `toResult` exists
 * to stop one file over.
 */
const result = (f: FixtureShow): SearchResult => ({
  id: titleId(f),
  kind: f.kind,
  name: f.name,
  year: f.year,
  overview: f.overview,
  genres: f.genres,
  rating: f.rating,
});

export class FixtureProvider implements MetadataProvider {
  readonly name = 'fixtures';

  async search(query: string): Promise<SearchResult[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return FIXTURES.filter((f) => f.name.toLowerCase().includes(q)).map(result);
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
      genres: f.genres,
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
    const DAY = 24 * 60 * 60 * 1000;
    let n = 0;

    f.seasons.forEach((season, si) => {
      for (let e = 1; e <= season.episodes; e++) {
        // Weekly counts across seasons, so a season boundary is just the next week; a drop
        // puts every episode of a season on one date and moves a year for the next.
        const airedAt =
          f.cadence === 'drop' ? start + si * DROP_GAP * DAY : start + n * 7 * DAY;
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
    return FIXTURES.filter((f) => titleId(f) !== id).map(result);
  }

  async getTrending(): Promise<SearchResult[]> {
    return FIXTURES.map(result);
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
