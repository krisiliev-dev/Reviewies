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
