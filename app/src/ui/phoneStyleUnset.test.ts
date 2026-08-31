import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * `undefined` does not unset a style on the phone's web export, and one control was
 * relying on it to.
 *
 * ## What was measured
 *
 * `design/cost.mjs` walked "record what you thought of something you just watched" on both
 * builds and read the ten half-star targets off the screen:
 *
 * - the web app, `app/src/ui/StarRating.tsx`: ten distinct 24x24 boxes at
 *   x = 16, 40, 66, 90, 116, 140, 166, 190, 216, 240;
 * - the phone's export, `mobile/src/ui/StarRating.tsx`: **five pairs, each pair stacked at
 *   one x** — 16, 16, 66, 66, 116, 116, 166, 166, 216, 216, every box 24x28.
 *
 * Two controls at identical coordinates. The later one in the document wins the tap, so on
 * that build the whole-star values are the only reachable ones and the halves — the feature
 * the component exists for, "the most repeated request on r/Letterboxd" per its own header
 * — cannot be pressed at all.
 *
 * ## Why, and why it is a rule rather than a line
 *
 * The right half was positioned by cancelling the left half's offset:
 *
 *     half:  { position: 'absolute', top: 0, bottom: 0, left: 0, width: MIN_HALF }
 *     right: { left: undefined, right: 0 }
 *
 * On a device that works. React Native flattens the array so `left` becomes `undefined`,
 * and Yoga reads an undefined edge as unset, so the box lays out from `right: 0` at the
 * stated width. **`react-native-web` does not have that step.** It compiles each style
 * object to atomic CSS and omits any declaration whose value is `null` or `undefined` — so
 * `left: undefined` emits nothing, the `left: 0` from the first object survives, and the
 * element ends up with `left: 0; right: 0; width: 24`, which CSS resolves in favour of
 * `left` and `width` and against `right`.
 *
 * This is the same class as every other renderer-difference this repository has paid for —
 * `onLayout` firing on resize rather than on move, `event.nativeEvent.layout.y` always 0,
 * `allowFontScaling` not surviving into the DOM — and the lesson each time was that the
 * export is not the phone. It is worth stating as a **mechanism** rather than as a fix to
 * one file, because the shape recurs: any style array whose later member cancels an earlier
 * property with `undefined` lays out one way on a device and another in every screenshot,
 * smoke check and measurement this repository takes.
 *
 * ## What this does not claim
 *
 * It does not say the shipping phone app is broken; on iOS and Android the layout is
 * correct. It says the **export is**, and the export is the only phone this build has ever
 * been looked at through — `design/capture.mjs`, `mobile/smoke.mjs`, `design/measure.mjs`
 * and `design/cost.mjs` all drive it. A control that overlaps itself there is a control
 * every measurement in the record has been taken of wrongly. The repair — an explicit
 * offset instead of a cancellation — is correct on both platforms and depends on no
 * renderer's treatment of `undefined`, which is the point.
 *
 * A whole style being `undefined` is fine and common (`style={on ? styles.x : undefined}`),
 * and this says nothing about it. The rule is about a *property* inside a style object, so
 * the pattern below requires the name to sit where an object key sits — after a `{` or a
 * `,`. The first draft did not, and failed on `<View style={rows ? styles.rowBody :
 * undefined}>` in `Choice.tsx`, which is a correct line: `styles.rowBody : undefined` reads
 * as `property: undefined` to anything that only looks at the two tokens either side of the
 * colon. A guard that fails on a correct change is wrong in the same way as one that passes
 * on a defect, and the repair belongs in the rule.
 *
 * **What it still cannot see, stated rather than glossed:** a property whose value is a
 * *conditional* that can be `undefined` — `{ left: wide ? 0 : undefined }` — is the same
 * defect and this reads it as a property with a ternary for a value, which it cannot
 * evaluate. There are none today. If one appears it will lay out one way on a device and
 * another in every screenshot, exactly as this one did, and nothing here will say so.
 */
const ROOT = resolve(__dirname, '../../..');

/**
 * The code, with the prose taken out.
 *
 * Required, and it was the second thing this guard got wrong. The repair to `StarRating`
 * puts a comment beside the fixed line quoting the line it replaced — `{ left: undefined,
 * right: 0 }` — because a repair whose reason is not written down is a repair somebody
 * undoes. The guard then read the quotation and failed the fix. A guard that forbids
 * *describing* the defect it forbids is a guard that punishes the only version of the file
 * worth having, which is the same class of wrong as one that passes on the defect.
 *
 * Block comments first, then line comments, both replaced by a space so nothing either side
 * of them joins up into a token that was never there.
 */
const code = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

/**
 * The text inside every `StyleSheet.create(` call in a file, brackets balanced.
 *
 * Balanced rather than a regex, for `phoneTextScaling.test.ts`'s reason one file over: a
 * pattern that stops at the first `}` stops inside the first style entry, and a guard that
 * reads a tenth of its subject passes a live plant. Depth is tracked rather than lines,
 * because a style sheet is nothing but nested braces.
 */
function styleSheets(source: string): string[] {
  const out: string[] = [];
  for (const match of source.matchAll(/StyleSheet\.create\(/g)) {
    let depth = 0;
    const from = match.index + match[0].length;
    let end = from;
    for (; end < source.length; end++) {
      const c = source[end];
      if ('([{'.includes(c)) depth++;
      else if (']}'.includes(c)) depth--;
      else if (c === ')') {
        if (depth === 0) break;
        depth--;
      }
    }
    out.push(source.slice(from, end));
  }
  return out;
}

/**
 * An object key whose value is the literal `undefined`.
 *
 * The `[{,]` is load-bearing: it is what tells a key from the middle of a ternary. See the
 * header for the correct line the first draft failed on.
 */
const KEY_UNDEFINED = /[{,]\s*(\w+)\s*:\s*undefined\b/g;

const phoneSources = () =>
  globSync('mobile/{app,src}/**/*.{ts,tsx}', { cwd: ROOT })
    .filter((path) => !path.includes('.test.'))
    .map((path) => ({ path, source: code(readFileSync(resolve(ROOT, path), 'utf8')) }));

describe('a phone style never unsets a property with undefined', () => {
  it('has no `property: undefined` inside a StyleSheet', () => {
    const offenders: string[] = [];
    for (const { path, source } of phoneSources()) {
      for (const sheet of styleSheets(source)) {
        for (const hit of sheet.matchAll(KEY_UNDEFINED)) {
          offenders.push(`${path}: \`${hit[1]}: undefined\` — react-native-web drops it instead of unsetting it`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * And the same rule where a style is written inline, which is the other half of the
   * subject and the half a `StyleSheet.create` sweep cannot see.
   *
   * `CrossOff`, `Choice` and `Button` all build their pressed and selected states as
   * `style={({ pressed }) => [base, pressed ? {...} : null]}`, so an inline object is where
   * a cancellation would most naturally be written next. Read from `style=` to the end of
   * the attribute, brackets balanced, for the same reason as above.
   */
  it('has no `property: undefined` inside an inline style prop', () => {
    const offenders: string[] = [];
    for (const { path, source } of phoneSources()) {
      for (const match of source.matchAll(/\b\w*[Ss]tyle=\{/g)) {
        let depth = 0;
        const from = match.index + match[0].length;
        let end = from;
        for (; end < source.length; end++) {
          const c = source[end];
          if ('([{'.includes(c)) depth++;
          else if (')]'.includes(c)) depth--;
          else if (c === '}') {
            if (depth === 0) break;
            depth--;
          }
        }
        for (const hit of source.slice(from, end).matchAll(KEY_UNDEFINED)) {
          offenders.push(`${path}: inline \`${hit[1]}: undefined\` — react-native-web drops it instead of unsetting it`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * And that the two clauses above read anything at all.
   *
   * §6.73's rule, and the reason it is here rather than assumed: both clauses are absences,
   * and an absence is satisfied by a bracket-balancer that walked off the end of the first
   * file and returned nothing for the rest. Twenty is well under the count today and well
   * over what a broken extractor produces.
   */
  it('read the phone’s style sheets rather than nothing', () => {
    const sheets = phoneSources().flatMap(({ source }) => styleSheets(source));
    expect(sheets.length).toBeGreaterThan(20);
    // Non-empty, too: a balancer that stops at the opening brace returns as many empty
    // strings as there are call sites and satisfies the count above on its own.
    expect(sheets.filter((s) => s.includes(':')).length).toBeGreaterThan(20);
  });
});
