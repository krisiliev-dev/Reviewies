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
