/**
 * Where a season sits in a list, and what it is called.
 *
 * TMDB numbers specials — OVAs, recaps, Christmas episodes, behind-the-scenes — as season
 * **0**, so a numeric sort puts them at the top of every show. `core/src/data/repo.ts`
 * already knows they are not part of the run and says so three times, naming this show:
 *
 * > *"Season 0 is specials — OVAs, recaps, Christmas episodes. They sort before season 1,
 * > so including them would make 'Up Next' for One Piece a recap special rather than
 * > episode 1. **They remain visible on the show page.**"*
 *
 * Up Next excludes them, the catch-up sheet excludes them, `airedSeasonSizes` excludes
 * them, and `classify` refuses to call one a premiere. The show page — the one place the
 * sentence above says they *should* appear — sorted them first and headed them `Season 0`,
 * which is a database row number rather than a thing anybody says out loud.
 *
 * Nothing had ever seen it: no fixture has a season 0, so thirty sprints of design review
 * photographed shows that cannot have one. §6.151's pass put a real one on screen in its
 * first run. §6.152.
 */

/** TMDB's number for the specials bucket. */
export const SPECIALS = 0;

/**
 * Last, not first.
 *
 * The three call sites that exclude specials are all saying the same thing — they are not
 * part of the sequence — and a list that opens on them contradicts every one of them. A
 * reader arriving at a show wants episode 1; the specials are what they go looking for
 * afterwards, if at all.
 */
export function bySeason(a: number, b: number): number {
  if (a === SPECIALS) return b === SPECIALS ? 0 : 1;
  if (b === SPECIALS) return -1;
  return a - b;
}

/** `Specials`, or `Season 3`. Both platforms wrote `Season {n}` inline and neither had a word for zero. */
export function seasonLabel(season: number): string {
  return season === SPECIALS ? 'Specials' : `Season ${season}`;
}

/**
 * One season, as a collapsed row says it.
 *
 * §6.156. A title page rendered every episode of every season at once, which for One Piece
 * is 1,220 rows — **170,844 points of scroll, two hundred viewports**, with no pagination,
 * no collapsing and no way to jump. The fixture's longest show is 1,443 points, so thirty
 * sprints of design review had never seen the case. §6.151's real-data pass put it on
 * screen in its first run.
 */
export interface SeasonSummary {
  season: number;
  /** How many episodes the season has, aired or not. */
  episodes: number;
  watched: number;
  /** `Specials`, `Season 3`. */
  label: string;
  /** The row's second line: what is left of the season, in words. */
  progress: string;
}

/**
 * What a collapsed season row says about itself.
 *
 * A count, not a bar and not a percentage: the same argument `RowContract.count` makes for
 * Up Next's *17 more episodes*, and the same complaint it answers. Somebody scanning
 * twenty-one collapsed rows for where they are needs the number.
 */
export function summariseSeasons(
  groups: ReadonlyArray<readonly [number, ReadonlyArray<{ id: string }>]>,
  watched: ReadonlySet<string>,
): SeasonSummary[] {
  return groups.map(([season, list]) => {
    const seen = list.filter((e) => watched.has(e.id)).length;
    return {
      season,
      episodes: list.length,
      watched: seen,
      label: seasonLabel(season),
      progress:
        seen === 0
          ? `${list.length} episode${list.length === 1 ? '' : 's'}`
          : seen === list.length
            ? `All ${list.length} watched`
            : `${seen} of ${list.length} watched`,
    };
  });
}

/**
 * Which season a show opens on.
 *
 * **The first one you have not finished**, in `bySeason` order — which is the season the
 * episode Up Next is offering lives in, arrived at from the other direction. Opening on
 * season 1 would be right exactly once per show and wrong every time after; opening on the
 * last would put a person watching season 3 of five at the end of season 5.
 *
 * Specials sort last, so a viewer part-way through the run never lands on them — the same
 * decision `bySeason` makes and the three call sites that exclude specials already make.
 *
 * A show with nothing watched opens on its first season, and a show entirely watched opens
 * on its last, both by the same rule rather than by a special case. A single-season show is
 * therefore always open, which is the point: collapsing is for the shows that need it and
 * must cost nothing on the shows that do not.
 */
export function openSeason(summaries: ReadonlyArray<SeasonSummary>): number | undefined {
  return (summaries.find((s) => s.watched < s.episodes) ?? summaries.at(-1))?.season;
}
