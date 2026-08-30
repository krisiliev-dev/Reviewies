/**
 * WCAG 2.1 contrast, with one owner.
 *
 * ## Why this is a module rather than four copies
 *
 * `app/src/ui/contrast.test.ts` has carried this arithmetic since it was written, checked
 * against a published value — `#777777` on white is 4.48 — which is the right way to hold
 * maths that decides whether text is readable. `palette.test.ts` had its own copy before
 * that, and §6.185 was about to write a third inside `design/capture.mjs` to answer a
 * question no source clause can: what a *pressed* control's label measures against the
 * ground the press paints under it.
 *
 * Three copies of one formula agree only while somebody keeps them agreeing, which is
 * §6.160's argument for collapsing `shoot`/`reveal` and §6.182's for `design/measure.mjs`.
 * The published-value check lives with the formula now, so a reader of any consumer can
 * find the one place it is proved.
 *
 * ## Two spellings, because the two questions arrive differently
 *
 * A token is a hex string and a browser hands back `rgb(r, g, b)`. `parse` takes either,
 * so a guard comparing two entries in `tokens.ts` and a harness comparing two computed
 * styles are asking the same function the same question.
 *
 * Alpha is deliberately not handled. `rgba(0, 0, 0, 0)` is what a browser reports for *no
 * fill*, which is a different fact from a colour and is the caller's to notice — the press
 * harness treats it as "this control does not paint" rather than compositing it against a
 * guess about what is behind.
 */

/** `#RRGGBB`, `#RGB` or `rgb(r, g, b)` to three 0–255 channels. Throws rather than guessing. */
export function parse(colour: string): [number, number, number] {
  const text = colour.trim();
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(text);
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3])];
  const hex = text.replace('#', '');
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`not a colour: ${colour}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG 2.1 relative luminance. */
export function luminance(colour: string): number {
  const linear = parse(colour)
    .map((c) => c / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/** The ratio, larger first, so the order of the arguments does not matter. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The floor for body text, and the one number in this file that is a decision.
 *
 * WCAG 1.4.3 AA. `contrast.test.ts` states the system has no headroom above it on purpose,
 * so it is spelled once here rather than typed at each comparison.
 */
export const TEXT_FLOOR = 4.5;
