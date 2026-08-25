import { EMOJI_PAD, bare, searchEmoji } from './emoji';

/**
 * What the reaction stream says out loud.
 *
 * The stream was a live region announcing every reaction as it drifted past. At the
 * default density that is twenty-four interruptions a minute, on a screen somebody is
 * holding while watching television — a screen reader would have made the feature this
 * product exists for unusable, and the only sane response to it would be to leave.
 *
 * Deleting the announcements was the easy answer and the wrong one. The stream is the
 * company: "a comment tied to a moment reads as company rather than as a feed", and that
 * is worth *more* to somebody who cannot see, not less. You can hear the episode; what
 * you are missing is everyone else in the room.
 *
 * So it announces moments rather than reactions. A burst is collected and summarised —
 * "four laughing" at the punchline — and between moments it says nothing at all. That is
 * closer to what the drifting emoji actually convey to someone watching them, which is
 * never the individual reaction and always the swell.
 */

/** No more often than this, however busy the episode gets. */
export const ANNOUNCE_EVERY_MS = 10_000;

/**
 * A name for an emoji, preferring the word a person would say.
 *
 * The pad's own labels first — "Funny" rather than "face with tears of joy" — then the
 * full index if it has been loaded, and nothing if neither knows it. Nothing is a real
 * answer: "three reactions" is honest, and inventing a name for an emoji we cannot name
 * would be worse than counting it.
 */
export function labelFor(emoji: string): string | undefined {
  const target = bare(emoji);
  const curated = EMOJI_PAD.find((item) => bare(item.emoji) === target);
  if (curated) return curated.label.toLowerCase();

  // searchEmoji answers from the index once it is loaded, and from the curated set
  // before that — so this is a lookup that improves rather than one that fails.
  const found = searchEmoji(emoji, 1).find((item) => bare(item.emoji) === target);
  return found?.label.toLowerCase();
}

/**
 * One line for a burst of reactions.
 *
 * Named when they agree, counted when they do not. The interesting thing about a moment
 * is rarely which emoji won — it is that several people reacted at once — so a mixed
 * burst says how many and names only the one that led.
 */
export function summarise(emojis: string[]): string {
  if (emojis.length === 0) return '';

  const counts = new Map<string, number>();
  for (const emoji of emojis) {
    const key = bare(emoji);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const [top, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const name = labelFor(top);
  const rest = emojis.length - count;

  const led = name ? `${count} ${name}` : `${count} reaction${count === 1 ? '' : 's'}`;
  if (rest === 0) return led;
  return `${led} and ${rest} other${rest === 1 ? '' : 's'}`;
}
