/**
 * How an episode is spelled on a row, in one place.
 *
 * `S1E8 · Episode 8`. Every screen that lists an episode printed its code and then its
 * name, and TMDB's name for an episode nobody has named is *Episode 8* — so on a screen
 * of unnamed episodes the row says the number twice, and the spoken name for the title
 * page's row said it three times: *"season 1 episode 8, Episode 8"*.
 *
 * It is not a fixture artefact. TMDB returns `Episode {n}` for anything unnamed, which is
 * most anime, most unaired episodes, and every episode of a show whose contributors have
 * not got to it — and the calendar is a screen made entirely of unaired episodes. §6.146.
 *
 * Here rather than at the six call sites for the reason `compose.ts` gives: a decision
 * spelled at each site is a decision the seventh site gets to make again.
 */

import { COPY } from '../copy.ts';
import { dayHasArrived, formatDay } from '../time.ts';

/** `S1E8`. Six screens built this string themselves. */
export const episodeCode = (season: number, number: number): string => `S${season}E${number}`;

/**
 * The episode's name, or nothing when the name is only its number again.
 *
 * `Episode 8` is what TMDB returns when there is no name; `8` is what some imports write.
 * Both are the number, and a row already carrying `S1E8` gains nothing by repeating it.
 * Anything else is somebody's actual title and is left exactly as written — including a
 * title that happens to contain a number.
 */
export function episodeName(name: string | undefined, number: number): string | undefined {
  const trimmed = name?.trim();
  if (!trimmed) return undefined;
  return new RegExp(`^(episode\\s*)?0*${number}$`, 'i').test(trimmed) ? undefined : trimmed;
}

/**
 * The title page's row: `8. The Ice Storm`, or `Episode 8` when there is no name.
 *
 * Not `8.` on its own — a row reading "8." above a date is a row that lost its noun.
 */
export function episodeHeading(number: number, name: string | undefined): string {
  const named = episodeName(name, number);
  return named ? `${number}. ${named}` : `Episode ${number}`;
}

/**
 * When an episode happened, or will: `Sun, Sep 6`, `Yesterday`, `Airs Tomorrow`, `Airs TBA`.
 *
 * Both title screens printed `episode.airDate` **raw** — the row said `2026-09-06` while
 * the calendar, three tabs away and reading the same field, said `Sun, Sep 6` through
 * `formatDay`, whose docstring is "how a day is named to a person". Same date, same app,
 * two tabs apart, on every episode row of every show — §6.51's shape, on the screen this
 * product's whole episode list hangs off.
 *
 * It is one function rather than a `formatDay` call at each row because the row has two
 * questions in it and only the second is about formatting: whether the episode has
 * happened decides the *sentence*, and the day decides the *words*. Spelled at each site,
 * the third site gets to answer the first question differently — which is exactly how
 * these two came to be character-identical templates that no guard could compare.
 *
 * Not `hasAired` from `data/repo.ts`, which takes a whole `CachedEpisode` and lives behind
 * the database: the same question of the same field, asked where there is no Dexie.
 */
export function episodeWhen(airDate: string | undefined, now: number = Date.now()): string {
  if (!airDate) return COPY.title.airs(COPY.title.tba);
  const named = formatDay(airDate, now);
  return dayHasArrived(airDate, now) ? named : COPY.title.airs(named);
}

/**
 * What a run of episodes is called on a row: `S2E1` alone, or `S2E1–8` for a whole season.
 *
 * An en dash, not a hyphen: it is a range. The second half drops the `E` because the season
 * is already said — `S2E1–E8` reads as two codes rather than one span.
 */
export function runCode(season: number, numbers: number[]): string {
  const first = Math.min(...numbers);
  const last = Math.max(...numbers);
  return first === last ? episodeCode(season, first) : `${episodeCode(season, first)}–${last}`;
}
