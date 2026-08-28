/**
 * A figure and its unit, told apart.
 *
 * §6.112 put `family.data` — IBM Plex Mono — on the Stats tiles, and the screenshot showed
 * **`7  days`**: the whole value string is one `Text`, so a *word* was set in monospace at
 * mono's letter spacing. The direction asks for "every number in tabular mono" and a unit is
 * not a number. Mono on a numeral run buys predictable column widths; mono on "days" buys a
 * gap and a typewriter.
 *
 * ## What the face is actually for
 *
 * Not "numbers". `Data` covers **machine-readable literals** — a figure, a timecode, an
 * episode code, an IP address, a filename: things you read character by character and might
 * type back. That is wider than the direction's "every number in tabular mono", and it is
 * the definition the build converged on rather than one imposed on it: the two sites that
 * were neither a number nor prose, `RemotePanel`'s device address and `ImportFiles`' file
 * name, both wanted mono for the same reason a figure does.
 *
 * The boundary is what it excludes, and stage 3 found four sites on the wrong side of it.
 * `"You look behind the crowd by 12s — tap to correct"`, `"disputed · one person · 3 of 5"`,
 * `"S1E6 · Episode 6"` and an episode's name were all in the mono face because stage 2 gave
 * it to anything containing a digit. **A sentence containing a number is a sentence.** They
 * are in the body face now.
 *
 * `Data` is the component around the split, and it owns four facts that were being written
 * by hand at twenty-three sites and agreed on at none of them:
 *
 * - **the split**, above — called by hand three times on the web and nowhere else;
 * - **the face**, mono for the figure and the body face for the unit;
 * - **the weight**, which is the mono file's and not a choice;
 * - **tabular figures**, which the phone set at 2 of its 13 number sites and the web at 8 of
 *   its 10 — and the web's star rating had `tabular-nums` with *no face* while the phone's
 *   had the face with no tabular, which is the same value drawn two wrong ways.
 *
 * Tabular is the whole argument for mono here. `docs/design/direction.md` asks for it so a
 * column of figures lines up and `S02E07` does not reflow as the numbers change; a
 * proportional face with `tabular-nums` gets half of that and mono without it gets the other
 * half. Neither half is the thing.
 */
export interface Figure {
  /** The part that is a number, and any symbol bound tightly to it: `6.0h`, `2.4`, `7`. */
  figure: string;
  /** The part that is a word: `days`, `episodes`. Empty when there is not one. */
  unit: string;
}

/**
 * Split on the first space that has a letter-word after it.
 *
 * `6.0h` has no space and is all figure. `7 days` splits. `2.4 days` splits. A value that
 * is only a word — which nothing produces today, but an empty state might — comes back as
 * all unit, so nothing sets prose in mono by accident.
 */
export function splitFigure(value: string): Figure {
  const match = /^([\d.,:+-]*[\d%]|[\d.,:+-]*[a-zA-Z]?)\s+(.+)$/.exec(value.trim());
  if (!match) {
    return /\d/.test(value) ? { figure: value, unit: '' } : { figure: '', unit: value };
  }
  return { figure: match[1], unit: match[2] };
}

/** The figure's face. Mono, at the one weight its file has. */
export const DATA_FACE = 'data';

/**
 * The unit's face — the body face, at the same size.
 *
 * Not `data`. That is the whole finding: `7  days` is what monospace does to a word, and a
 * unit is a word. It stays at the figure's size so the pair reads as one value rather than
 * as a number with a caption.
 */
export const DATA_UNIT_FACE = 'body';
