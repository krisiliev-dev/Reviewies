/**
 * The library both design harnesses import, so the phone and the web are judged on the
 * same shows.
 *
 * It lived in `capture.mjs` and was private to it, which was fine while the phone was the
 * only thing photographed. §6.132 gave the web its own pass and the choice was to copy this
 * or to share it — and a fixture copied is a fixture that drifts, which is the whole of what
 * §6.98 found about `COPY` and §6.131 about the JSX walker. A lesson recorded is not a
 * lesson applied.
 */

/**
 * A library, built here rather than read from a file somebody has to already have.
 *
 * **The names are the fixture provider's, and that is the whole point.** This seeded
 * twelve real shows — Dark, Andor, Chernobyl — into a build with no TMDB token, whose
 * provider knows four invented titles and nothing else. So matching ran, matched nothing,
 * and every screenshot below was of an app with an empty library: three sprints of design
 * review looking at the empty state, which is exactly the failure this file's header warns
 * about arriving by a different door. An import only fills a library if the provider it is
 * matched against has heard of what is in it.
 */

/**
 * The schedule, mirrored from `core/src/metadata/fixtures.ts`.
 *
 * This file used to say only how *many* episodes of each show were watched — `episodes - 3`
 * — and knew nothing about when any of them aired. The provider knew when they aired and
 * nothing about what was watched. Two descriptions of one library, in two files, and
 * nothing compared them: the seed marked ninety-three episodes of Hollow Crown Saga watched
 * when forty-one had aired, so fifty-two watch records were for episodes that do not exist
 * yet, and the calendar's whole visible content was those same unaired-but-watched
 * episodes. §6.146.
 *
 * `app/src/wiring/designLibrary.test.ts` holds this against the provider — the numbers
 * below are a mirror, and a mirror nothing checks is the drift this file's own header
 * warns about.
 */
export const SCHEDULE = [
  {
    name: 'The Long Dark',
    seasons: [8, 10, 6],
    startedDaysAgo: 119,
    /**
     * All of season 1 and four of season 2, of the eighteen episodes that have aired.
     *
     * Six aired episodes left unwatched is what puts this show in Up Next, and it puts
     * the row mid-season rather than on a premiere. It cannot exceed eighteen without
     * claiming to have watched something unaired.
     */
    watchedThrough: 12,
  },
  {
    name: 'Kitchen Nightshift',
    seasons: [12],
    startedDaysAgo: 280,
    /** Over long ago and three episodes behind: the other Up Next row. */
    watchedThrough: 9,
  },
  {
    name: 'Hollow Crown Saga',
    seasons: [96],
    startedDaysAgo: 644,
    /**
     * Every episode that has aired, which is what keeps this show *out* of Up Next — the
     * fact `capture.mjs`'s settle test is built around. Its last three episodes are the
     * calendar's, ending in a series finale three weeks out.
     */
    watchedThrough: 93,
  },
];

/** Weekly from the show's start, the same arithmetic `FixtureProvider.getEpisodes` does. */
export const airedDaysAgo = (show, index) => show.startedDaysAgo - (index - 1) * 7;

/**
 * When an episode was watched: after it aired, not before.
 *
 * The dates used to be a hard-coded `2024-03-nn`, written when that was recent. Absolute
 * dates in a fixture rot: every day the clock moves, the seeded history sits further in
 * the past, and by the time this was looked at the whole library was two calendar years
 * behind. Stats opens on *this year*, so the screen a design review had been judging read
 * "Watched 0m · Episodes 0 · Titles 0" over a hundred and fourteen episodes — which is
 * §6.104's shape again: an instrument answering a question it was not in a position to
 * answer.
 *
 * Then they were spread by hand — a per-show offset in days, unrelated to when anything
 * aired — which fixed the rot and left the incoherence. Derived from the air date now, so
 * a migrant's history is a history: episodes watched a day or two after they went out,
 * running back over the twenty-one months the oldest show has been on.
 */
const LAG = (index) => index % 3;

const dayString = (daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const CSV = (() => {
  const rows = ['show,season,number,name,seen,seen_date,times_watched,air_date,show_id,episode_id'];
  SCHEDULE.forEach((show, i) => {
    let index = 0;
    show.seasons.forEach((episodes, s) => {
      for (let n = 1; n <= episodes; n++) {
        index++;
        if (index > show.watchedThrough) continue;
        const aired = airedDaysAgo(show, index);
        const seen = dayString(Math.max(0, aired - LAG(index)));
        rows.push(
          `${show.name},${s + 1},${n},Episode ${n},True,${seen} 20:00:00,1,${dayString(aired)},${100 + i},${1000 + i * 200 + s * 100 + n}`,
        );
      }
    });
  });
  return rows.join('\n');
})();

export { CSV };
