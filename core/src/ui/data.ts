/**
 * A figure and its unit, told apart.
 *
 * §6.112 put `family.data` — IBM Plex Mono — on the Stats tiles, and the screenshot showed
 * **`7  days`**: the whole value string is one `Text`, so a *word* was set in monospace at
 * mono's letter spacing. The direction asks for "every number in tabular mono" and a unit is
 * not a number. Mono on a numeral run buys predictable column widths; mono on "days" buys a
 * gap and a typewriter.
 *
 * This is the seam `Data` — component 6 of the roster in `docs/design/components.md` — will
 * formalise. It is here rather than there because the defect is live now and the component
 * is several sprints out, and because both renderers need the same split however it is
 * eventually wrapped.
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
