import { describe, expect, it } from 'vitest';
import { SCHEDULE, airedDaysAgo, CSV } from '../../../design/library.mjs';
import { FixtureProvider } from '@reviewies/core/metadata/fixtures';
import { classify, UPCOMING_DAYS, type EpisodeKind } from '@reviewies/core/calendar/upcoming';
import { dayKey, startOfDay } from '@reviewies/core/time';

/**
 * The design harness's library, held against the provider it is imported into.
 *
 * Two files describe one library. `core/src/metadata/fixtures.ts` says when every episode
 * aired; `design/library.mjs` says which of them were watched. Nothing compared them, and
 * the result was a seed that marked ninety-three episodes of a show watched when forty-one
 * had aired — fifty-two watch records for episodes that do not exist yet, and a calendar
 * whose entire visible content was those same episodes.
 *
 * That is why this file is a wiring test rather than a design one. It is not about how
 * anything looks; it is about an instrument being in a position to answer the question the
 * design track asks it. §6.142, §6.146.
 */

const provider = new FixtureProvider();

/** Every fixture show, by name, with the episodes the provider will actually serve. */
const served = await (async () => {
  const out = new Map<string, Awaited<ReturnType<typeof provider.getEpisodes>>>();
  for (const show of SCHEDULE) {
    const [match] = await provider.search(show.name);
    expect(match, `the provider has never heard of "${show.name}"`).toBeDefined();
    out.set(show.name, await provider.getEpisodes(match.id));
  }
  return out;
})();

describe('the seeded library', () => {
  it('describes the same shows the provider serves', () => {
    for (const show of SCHEDULE) {
      const episodes = served.get(show.name)!;
      const total = show.seasons.reduce((a, b) => a + b, 0);
      expect(episodes.length, `${show.name}: season lengths disagree`).toBe(total);
      // Per season, not only the total: two seasons of 9 is not [8, 10].
      for (const [s, length] of show.seasons.entries()) {
        expect(
          episodes.filter((e) => e.season === s + 1).length,
          `${show.name} season ${s + 1}`,
        ).toBe(length);
      }
    }
  });

  it('agrees with the provider about when every episode aired', () => {
    /*
     * The mirror clause. `airedDaysAgo` reproduces the provider's arithmetic, and if the
     * provider's changes — a different cadence, a different start — this is what says the
     * watch history was written against the old one.
     */
    const today = startOfDay(dayKey(Date.now()));
    for (const show of SCHEDULE) {
      const episodes = served.get(show.name)!;
      for (const [i, episode] of episodes.entries()) {
        const expected = dayKey(today - airedDaysAgo(show, i + 1, episode.season) * 86_400_000);
        expect(episode.airDate, `${show.name} episode ${i + 1}`).toBe(expected);
      }
    }
  });

  it('never claims an episode was watched before it aired', () => {
    /*
     * The finding this file was written for, stated as a property rather than as three
     * numbers: a watch record for an unaired episode is a claim about the future.
     */
    for (const show of SCHEDULE) {
      const aired = served
        .get(show.name)!
        .filter((e) => startOfDay(e.airDate!) <= startOfDay(dayKey(Date.now()))).length;
      expect(
        show.watchedThrough,
        `${show.name}: ${show.watchedThrough} watched, ${aired} aired`,
      ).toBeLessThanOrEqual(aired);
    }

    // And the rows say so too, so a future change to how the CSV is written cannot make
    // the property above true of the table and false of the file.
    const [header, ...rows] = CSV.split('\n');
    const columns = header.split(',');
    for (const row of rows) {
      const cells = row.split(',');
      const seen = cells[columns.indexOf('seen_date')].slice(0, 10);
      const air = cells[columns.indexOf('air_date')];
      expect(seen >= air, `${cells[0]} S${cells[1]}E${cells[2]} seen ${seen}, aired ${air}`).toBe(
        true,
      );
    }
  });

  it('leaves two shows with something aired and unwatched, and one with nothing', () => {
    // Up Next's content, which `capture.mjs` asserts on the screen. Asserted here from the
    // numbers as well, because the screen's clause cannot say *why* a show is missing.
    const behind = SCHEDULE.filter((show) => {
      const aired = served
        .get(show.name)!
        .filter((e) => startOfDay(e.airDate!) <= startOfDay(dayKey(Date.now()))).length;
      return show.watchedThrough < aired;
    }).map((s) => s.name);
    expect(behind.sort()).toEqual(['Kitchen Nightshift', 'The Long Dark']);
  });
});

describe('the calendar the seed produces', () => {
  /** Everything airing in the window `getUpcoming` uses, from the shows the seed tracks. */
  const upcoming = (() => {
    const from = startOfDay(dayKey(Date.now()));
    const until = from + UPCOMING_DAYS * 86_400_000;
    const rows: Array<{ show: string; day: string; kind: EpisodeKind; number: number }> = [];
    for (const show of SCHEDULE) {
      const episodes = served.get(show.name)!;
      for (const episode of episodes) {
        const airs = startOfDay(episode.airDate!);
        if (airs < from || airs > until) continue;
        rows.push({
          show: show.name,
          day: episode.airDate!,
          kind: classify(episode, episodes),
          number: episode.number,
        });
      }
    }
    return rows;
  })();

  /*
   * These four clauses are the ones that would have caught #175, and each is a thing the
   * screen is *for* rather than a number that happens to be true.
   *
   * Every fixture show used to start on the same day, forty weeks back, so a show reached
   * the future only by having more than forty episodes. One of four did. The calendar could
   * therefore only ever show one show, one row per date, and no milestone at all — and the
   * design track photographed it every sprint and judged it a design.
   */

  it('has more than one show on it', () => {
    expect(new Set(upcoming.map((r) => r.show)).size).toBeGreaterThan(1);
  });

  it('has a date carrying more than one row', () => {
    // The reason the screen groups by day. It had never once been shown doing it.
    const perDay = new Map<string, number>();
    for (const row of upcoming) perDay.set(row.day, (perDay.get(row.day) ?? 0) + 1);
    expect([...perDay.values()].filter((n) => n > 1).length).toBeGreaterThan(0);
  });

  it('has a date carrying exactly one row', () => {
    // And the other case, so a fixture that made every date a pile would not pass either.
    const perDay = new Map<string, number>();
    for (const row of upcoming) perDay.set(row.day, (perDay.get(row.day) ?? 0) + 1);
    expect([...perDay.values()].filter((n) => n === 1).length).toBeGreaterThan(0);
  });

  it('has every kind of milestone the screen classifies', () => {
    /*
     * The default notification setting is called *Premieres & finales*. `KIND_LABEL` draws
     * a tag for each, and `regular` is the empty string — so a calendar of regular episodes
     * is a calendar with the classification invisible on it. Every kind, because a clause
     * asking for "at least one milestone" passes on a screen that has never shown a
     * premiere.
     */
    const kinds = new Set(upcoming.map((r) => r.kind));
    for (const kind of ['premiere', 'finale', 'series-finale', 'regular'] as const) {
      expect(kinds.has(kind), `nothing upcoming is a ${kind}`).toBe(true);
    }
  });

  it('leaves the ended show off it', () => {
    expect(upcoming.some((r) => r.show === 'Kitchen Nightshift')).toBe(false);
  });

  it('drops a whole season on one date, which is how streaming releases', () => {
    /*
     * The case the day grouping exists **for**, and the one no fixture could produce: every
     * show was weekly, so a heading had never had more than two rows under it. §6.146 said
     * a fixture that cannot produce a case has an opinion about the screen; this is the
     * next one down. §6.149.
     *
     * Six at least, not "more than two": a drop that came out as three would satisfy a
     * loose bound and would not be a season.
     */
    const byDay = new Map<string, typeof upcoming>();
    for (const row of upcoming) byDay.set(row.day, [...(byDay.get(row.day) ?? []), row]);
    const biggest = [...byDay.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    expect(biggest[1].length, 'no date carries a season').toBeGreaterThanOrEqual(6);

    // One show, so the heading is a *drop* rather than a busy Friday — which is a
    // different screen and a different question.
    expect(new Set(biggest[1].map((r) => r.show)).size).toBe(1);

    // And the whole season, in order, so the within-day sequence is visible at all.
    const numbers = biggest[1].map((r) => r.number);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(numbers[0]).toBe(1);
  });

  it('gives the drop a heading of its own', () => {
    /*
     * Every weekly fixture starts a multiple of seven days back, so they share weekdays;
     * the drop's start is not, so its date belongs to it. Without this the eight rows would
     * be photographed mixed in with two weekly shows, and the case would be a busy day
     * rather than a season landing.
     */
    const dropped = SCHEDULE.find((s) => s.cadence === 'drop');
    expect(dropped, 'nothing in the schedule drops').toBeDefined();
    const day = upcoming.find((r) => r.show === dropped!.name)!.day;
    expect(upcoming.filter((r) => r.day === day).every((r) => r.show === dropped!.name)).toBe(true);
  });

  it('has both cadences in it', () => {
    // Non-vacuity for the pair of clauses above: a schedule that dropped everything would
    // satisfy them and would be a different fixture with the same name.
    const cadences = new Set(SCHEDULE.map((s) => s.cadence));
    expect([...cadences].sort()).toEqual(['drop', 'weekly']);
  });
});
