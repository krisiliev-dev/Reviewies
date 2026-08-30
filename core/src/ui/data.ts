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
 * ## The caller knows; the string does not
 *
 * Stage 2's rule — mono for anything containing a digit — ran in both directions, and only
 * one of them was ever found. The false positive was the sentence, corrected above. The
 * false negative is `letterboxd.csv`: the split asked whether the value contained a digit
 * and, finding none, handed the whole filename back as a *unit*, which is the body face. So
 * one import report drew `watched-2024.csv` in mono and `letterboxd.csv` in the same face as
 * the `— skipped` beside it, one line apart, and `livingroom.local` reached the prose face
 * for the same reason that `192.168.1.4` did not. Both renderers were identically wrong,
 * which is what puts this here rather than in either of them.
 *
 * No better predicate closes that, because the fact is not in the string. `data` is a
 * filename and `data` is a word; they arrive spelled the same and mean different faces. The
 * caller is the one that knows — `ImportFiles` is holding a file it just read, `RemotePanel`
 * an address it just dialled — so `kind` is on the contract and the guess is gone.
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
  /**
   * The part that is a number, and any symbol bound tightly to it: `6.0h`, `2.4`, `7` — or
   * the whole of a `literal`, which is a figure in every way the face cares about.
   */
  figure: string;
  /** The part that is a word: `days`, `episodes`. Empty when there is not one. */
  unit: string;
}

/**
 * What the caller is holding, since the string will not say.
 *
 * - **`measure`** — a quantity and any unit word after it: `7 days`, `6.0h`, `12:34`, `4.5`,
 *   `2024`. Its figure is numerals, so the split can find it by reading rather than by being
 *   told, and the word after it is the only part that is prose.
 * - **`literal`** — the value *is* the literal: `letterboxd.csv`, `livingroom.local`,
 *   `192.168.1.4`, `S02E07`. Nothing to split, so nothing to guess at; all of it is figure.
 *
 * `measure` is the default because nineteen of the twenty-two sites are one — eleven on the
 * web and eleven on the phone, three of them holding a literal — and because the split's own
 * rule is honest inside a measure and only there; see `splitFigure`. A caller whose value is
 * a name or an address says so, and that is the whole of the contract.
 */
export type DataKind = 'measure' | 'literal';

/**
 * Split on the first space that has a letter-word after it.
 *
 * `6.0h` has no space and is all figure. `7 days` splits. `2.4 days` splits. A `measure`
 * with no digit anywhere in it is an empty state's word — `Nothing yet` — and comes back as
 * all unit, so nothing sets prose in mono by accident.
 *
 * That last rule is true of a measure and was false of everything else, which is the defect
 * `kind` exists for: asked of `letterboxd.csv` it said "prose", and asked of
 * `watched-2024.csv` it said "figure", about two files in one list. A `literal` never
 * reaches it, because a caller holding a filename has already answered the question the
 * digit was standing in for.
 */
export function splitFigure(value: string, kind: DataKind = 'measure'): Figure {
  const trimmed = value.trim();
  if (kind === 'literal') return { figure: trimmed, unit: '' };
  const match = /^([\d.,:+-]*[\d%]|[\d.,:+-]*[a-zA-Z]?)\s+(.+)$/.exec(trimmed);
  if (!match) {
    return /\d/.test(trimmed) ? { figure: trimmed, unit: '' } : { figure: '', unit: trimmed };
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
