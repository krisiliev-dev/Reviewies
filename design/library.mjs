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
 *
 * Two seasons of the two multi-season fixtures and a run of the long one: enough rows that
 * a list is judged as a list, and enough left unwatched that Up Next has something in it.
 */
/**
 * When this library was watched, relative to today rather than fixed in 2024.
 *
 * The dates used to be a hard-coded `2024-03-nn`, written when that was recent. Absolute
 * dates in a fixture rot: every day the clock moves, the seeded history sits further in
 * the past, and by the time this was looked at the whole library was two calendar years
 * behind. Stats opens on *this year*, so the screen a design review had been judging read
 * "Watched 0m · Episodes 0 · Titles 0" over a hundred and fourteen episodes — which is
 * §6.104's shape again: an instrument answering a question it was not in a position to
 * answer.
 *
 * What it should represent is a real migrant. TV Time shut down on 15 July 2026, so
 * somebody importing has history that ends a few weeks before today and runs back over
 * years. `TAIL_DAYS` is that gap; the per-show offsets spread the three shows across
 * about eighteen months, so more than one year chip exists and Year in Review has
 * something to review. Episodes inside a season are consecutive days, which is what
 * gives the screen a streak to name.
 */
export const TAIL_DAYS = 44;
const dayString = (daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const CSV = (() => {
  const rows = ['show,season,number,name,seen,seen_date,times_watched,air_date,show_id,episode_id'];
  // Season lengths as `core/src/metadata/fixtures.ts` declares them, so nothing is
  // imported that the provider will then say does not exist.
  const shows = [
    { name: 'The Long Dark', seasons: [8, 10] },
    { name: 'Kitchen Nightshift', seasons: [12] },
    { name: 'Hollow Crown Saga', seasons: [96] },
  ];
  shows.forEach((show, i) => {
    show.seasons.forEach((episodes, s) => {
      // Not the whole season: leaving the tail unwatched is what gives Up Next a row and
      // the title page something to cross off.
      const watched = Math.max(1, episodes - 3);
      for (let n = 1; n <= watched; n++) {
        const d = dayString(TAIL_DAYS + i * 200 + s * 60 + (watched - n));
        rows.push(
          `${show.name},${s + 1},${n},Episode ${n},True,${d} 20:00:00,1,${d},${100 + i},${1000 + i * 200 + s * 100 + n}`,
        );
      }
    });
  });
  return rows.join('\n');
})();

export { CSV };
