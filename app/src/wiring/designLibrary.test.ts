import { describe, expect, it } from 'vitest';
import { SCHEDULE, airedDaysAgo, CAUGHT_UP_CSV, CSV, FINISHED_CSV } from '../../../design/library.mjs';
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
const served = new Map<string, Awaited<ReturnType<typeof provider.getEpisodes>>>();
/** The provider's own record of each show, which is where `ended` lives. */
const titles = new Map<string, Awaited<ReturnType<typeof provider.getTitle>>>();
for (const show of SCHEDULE) {
  const [match] = await provider.search(show.name);
  expect(match, `the provider has never heard of "${show.name}"`).toBeDefined();
  served.set(show.name, await provider.getEpisodes(match.id));
  titles.set(show.name, await provider.getTitle(match.id));
}

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
    /*
     * Calendar arithmetic, not `n * 86_400_000`. §6.187.
     *
     * This subtracted a fixed twenty-four hours from a **local** midnight and then asked for
     * a day key, which is UTC-day arithmetic performed on a local-day value. In UTC the two
     * agree and the clause passed for its whole life; at `Europe/Sofia` (+0300) it is off by
     * one — `Kitchen Nightshift episode 1: expected '2025-11-23' to be '2025-11-22'`.
     *
     * Found by a device agent running `npm run verify` on a Mac, which is the only reason it
     * was ever seen: `test:tz` exists precisely for this class and runs 877 cases at
     * `Pacific/Kiritimati`, and this clause sits outside it, in `app`. A repository that
     * takes a failure mode seriously enough to run a whole suite for it can still leave a
     * case in the one workspace that suite does not cover.
     *
     * The provider builds these dates with `setDate(getDate() - n)`, and `design/library.mjs`
     * builds the CSV's the same way. Matching it is the fix, and it is the fix rather than a
     * timezone pin because a day is a calendar fact: subtracting a duration is the wrong
     * operation for it anywhere, and merely correct where no offset happens to intervene.
     */
    const daysBefore = (days: number) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - days);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate(),
      ).padStart(2, '0')}`;
    };

    for (const show of SCHEDULE) {
      const episodes = served.get(show.name)!;
      for (const [i, episode] of episodes.entries()) {
        const expected = daysBefore(airedDaysAgo(show, i + 1, episode.season));
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
          kind: classify(episode, episodes, show.ended),
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

  it('agrees with the provider about which shows are over', () => {
    /*
     * The mirror's third field. `CachedTitle.ended` is what makes a series finale a claim
     * rather than a guess (§6.150), and a schedule that said one thing while the provider
     * said another would put the chip on the wrong row with every clause still green.
     */
    for (const show of SCHEDULE) {
      const details = titles.get(show.name);
      expect(details?.ended, `${show.name}`).toBe(show.ended);
    }
  });

  it('carries a show that is over and a show that is not', () => {
    /*
     * §6.146's discipline, on the field rather than the schedule: a fixture whose every
     * show is ending cannot show what the screen says about one that is not, and the wrong
     * answer was on three rows of the design record before anything asked.
     */
    expect(new Set(SCHEDULE.map((s) => s.ended))).toEqual(new Set([true, false]));

    // And both answers reach the window: a series finale from the show that is over, and a
    // plain season finale from a last known episode that is not the end of anything.
    const running = upcoming.filter((r) => !SCHEDULE.find((s) => s.name === r.show)!.ended);
    expect(running.some((r) => r.kind === 'series-finale'), 'a running show is called over')
      .toBe(false);
    expect(upcoming.some((r) => r.kind === 'series-finale'), 'nothing is over').toBe(true);
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

  it('has a second library that is actually caught up, and only up to today', () => {
    /*
     * `CAUGHT_UP_CSV` is what §6.163 photographed `upNext.allCaughtUp` and `discover.empty`
     * from, and its whole meaning is a comparison: every episode that has **aired** is
     * watched, and nothing that has not. Planted by pointing it back at `watchedThrough`,
     * and nothing failed — the design pass caught it at run time, by name, and no clause did.
     *
     * Two halves, and the second is the one that matters. A library claiming to have watched
     * something unaired is the exact defect §6.146 spent a sprint on, arriving here by the
     * door marked "make it more complete".
     */
    const rows = CAUGHT_UP_CSV.split('\n').slice(1).map((line) => line.split(','));
    const seen = new Set(rows.map((r) => `${r[0]}|${r[1]}|${r[2]}`));

    const missing: string[] = [];
    const unaired: string[] = [];
    for (const show of SCHEDULE) {
      let index = 0;
      show.seasons.forEach((episodes: number, s: number) => {
        for (let n = 1; n <= episodes; n++) {
          index++;
          const aired = airedDaysAgo(show, index, s + 1) >= 0;
          const has = seen.has(`${show.name}|${s + 1}|${n}`);
          if (aired && !has) missing.push(`${show.name} S${s + 1}E${n}`);
          if (!aired && has) unaired.push(`${show.name} S${s + 1}E${n}`);
        }
      });
    }
    expect(missing, 'the caught-up library has aired episodes it has not watched').toEqual([]);
    expect(unaired, 'the caught-up library claims to have watched something unaired').toEqual([]);

    // And that it is a *different* library from the one every other pass uses, or the two
    // shots taken from it are shots of the same thing under another name.
    expect(CAUGHT_UP_CSV.length).toBeGreaterThan(CSV.length);
  });

  it('has a third library with nothing left to air, and it is not the second one', () => {
    /*
     * The two caught-up states are two libraries, not two screens. §6.164.
     *
     * `CAUGHT_UP_CSV` leaves two shows still running, so Up Next says what is next and offers
     * the calendar; `FINISHED_CSV` is the state where nothing is coming and *Find something to
     * watch* is the right question. If the second ever stopped having something upcoming, or
     * the third ever gained something, the two shots would be of the same screen under two
     * names and no clause would say so.
     *
     * The trap is `ended`. Hollow Crown Saga is `ended: true` **and** has three episodes still
     * to air — TMDB marks a show Ended once its last season is the last one, which is often
     * before the finale has gone out, and §6.150 spent a sprint on exactly that. A rule reading
     * only `ended` would have put it in the finished library and photographed the waiting state
     * under the finished state's name.
     */
    const shows = (csv: string) => new Set(csv.split('\n').slice(1).map((l) => l.split(',')[0]));
    const finished = shows(FINISHED_CSV);
    expect(finished.size, 'the finished library is empty').toBeGreaterThan(0);

    const stillToAir = (name: string) => {
      const show = SCHEDULE.find((x: { name: string }) => x.name === name)!;
      let index = 0;
      return show.seasons.some((episodes: number, s: number) => {
        for (let n = 1; n <= episodes; n++) {
          index++;
          if (airedDaysAgo(show, index, s + 1) < 0) return true;
        }
        return false;
      });
    };

    // Nothing in the finished library has anything left to air, or it is not finished.
    expect(
      [...finished].filter(stillToAir),
      'the finished library holds a show that is still airing',
    ).toEqual([]);

    // And the caught-up library does, or the two are the same state twice.
    expect(
      [...shows(CAUGHT_UP_CSV)].some(stillToAir),
      'the caught-up library has nothing coming, so it is the finished one under another name',
    ).toBe(true);

    // Every episode of what is in the finished library is watched — it is caught up as well.
    const seen = new Set(FINISHED_CSV.split('\n').slice(1).map((r) => r.split(',').slice(0, 3).join('|')));
    for (const name of finished) {
      const show = SCHEDULE.find((x: { name: string }) => x.name === name)!;
      show.seasons.forEach((episodes: number, s: number) => {
        for (let n = 1; n <= episodes; n++) {
          expect(seen.has(`${name}|${s + 1}|${n}`), `${name} S${s + 1}E${n} is not watched`).toBe(true);
        }
      });
    }
  });
});
