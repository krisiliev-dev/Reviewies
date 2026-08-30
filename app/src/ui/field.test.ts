import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { FIELD_BOX, FIELD_LINES, FIELD_SIZE } from '@reviewies/core/ui/field';
import { border, leading, radius, size, space, text } from '@reviewies/core/tokens';
import { COPY } from '@reviewies/core/copy';
import { stripComments } from '@reviewies/core/test/source';

/**
 * `Field`, and the ring that seventeen sites switched off.
 *
 * Eleven inputs on the web wore eight different treatments and twelve on the phone wore
 * five — two grounds, a border or none, four paddings, two sizes. But the defect worth the
 * sprint is not the drift: **every web input carried `outline-none`**, and nothing put a
 * ring back at any of them. `index.css` draws a careful two-ring `:focus-visible` — the
 * inner ring in the ground, because a near-white ring around a near-white fill is 1.00:1 —
 * and every place a person types switched it off.
 *
 * And not one input in either app had a label. Every single one relied on its placeholder,
 * which is gone the moment somebody types into it.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist', '.expo'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(path, out);
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

describe('a field', () => {
  it('never switches off the focus ring', () => {
    /*
     * The clause this component exists for. `outline-none` on a text input is a keyboard
     * user losing their place, and it was on every one of them — so the fix is not a sweep,
     * it is that `Field` cannot write it and nothing else renders an input.
     *
     * A container that takes focus programmatically is a different thing and keeps its own
     * `outline-none`; the rule is drawn round *what element it is on*, not a name.
     */
    const offenders: string[] = [];
    let inputs = 0;
    for (const file of filesUnder('app/src')) {
      const source = read(file);
      for (const m of source.matchAll(/<(input|textarea|select)\b[\s\S]*?(?:\/>|>)/g)) {
        inputs++;
        if (/outline-none/.test(m[0])) offenders.push(`${file}: ${m[1]}`);
      }
    }
    expect(inputs, 'no input was scanned, so this proved nothing').toBeGreaterThan(2);
    expect(offenders).toEqual([]);
    /*
     * The component's *code*, with its prose removed — not its rendered element.
     *
     * The first version of this clause scanned `<input …>` for the literal, and `Field`
     * writes `className={classes}`, so putting `outline-none` back into the `BOX` constant
     * left every clause in this file green. That is the plant surviving the guard written
     * for exactly it, on the one rule the component exists to enforce.
     */
    const component = read('app/src/ui/Field.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(component, 'the component can suppress its own ring').not.toContain('outline-none');

    // And the rule it must not switch off is still the two-ring one, reading the tokens.
    const css = read('app/src/index.css');
    expect(css).toContain('outline: var(--border-width-mark) solid var(--focus-ring)');
    expect(css, 'the inner ring went, and a near-white ring on a near-white fill is 1.00:1')
      .toContain('var(--focus-inset)');
  });

  it('is the only thing on either platform that renders somewhere to type', () => {
    /*
     * A raw `<input type="text">` or `<TextInput>` is the twenty-fourth treatment. File and
     * checkbox inputs are not fields — they are a picker and a switch wearing an `<input>`,
     * and neither has a placeholder, a padding or a ring to get wrong.
     */
    const web: string[] = [];
    for (const file of filesUnder('app/src')) {
      if (file.endsWith('ui/Field.tsx')) continue;
      for (const m of read(file).matchAll(/<(input|textarea)\b[\s\S]*?(?:\/>|>)/g)) {
        if (/type="(?:file|checkbox|radio)"/.test(m[0])) continue;
        web.push(`${file}: ${m[0].slice(0, 60)}`);
      }
    }
    expect(web).toEqual([]);

    const phone: string[] = [];
    let scanned = 0;
    for (const file of [...filesUnder('mobile/app'), ...filesUnder('mobile/src')]) {
      if (file.endsWith('ui/Field.tsx')) continue;
      scanned++;
      for (const m of read(file).matchAll(/<TextInput\b/g)) phone.push(`${file}: ${m[0]}`);
    }
    expect(scanned, 'no phone files scanned, so this proved nothing').toBeGreaterThan(20);
    expect(phone).toEqual([]);
  });

  it('is named out loud, and its name is not its placeholder', () => {
    /*
     * Not one input in either app had a label — every one relied on the placeholder, which
     * disappears as soon as there is anything to read it against. `Field` requires `label`
     * in its type, so this clause is about the *words*: written at the call sites, the two
     * platforms said "New list name" and "Name for a new list" for the same box within
     * minutes of each other. `copy.test.ts` caught it; `COPY.fields` is where they live now.
     */
    for (const key of ['search', 'listName', 'handle', 'email', 'comment'] as const) {
      expect(COPY.fields[key], `COPY.fields.${key} is empty`).toBeTruthy();
    }
    const offenders: string[] = [];
    for (const file of [...filesUnder('app/src'), ...filesUnder('mobile/app'), ...filesUnder('mobile/src')]) {
      for (const m of read(file).matchAll(/<Field\b[\s\S]*?\/>/g)) {
        if (!/\blabel=/.test(m[0])) offenders.push(`${file}: a field with no name`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('is a ruled box rather than a filled one, at two densities', () => {
    /*
     * §6.90 spent 822 sites turning fills into rules, and the inputs kept two grounds and a
     * border between them — three answers to a question with one. The direction lists the
     * search field's border among the strokes that *mean* something, so it is
     * `stroke.signal` at 4.87:1 rather than `stroke.hairline` at 1.42, which WCAG 1.4.11
     * does not consider to exist.
     */
    expect(FIELD_BOX.radius).toBe(radius.none);
    expect(FIELD_BOX.stroke).toBe(border.hairline);
    expect(FIELD_BOX.strokeFocused).toBe(border.mark);
    expect(FIELD_BOX.colour).toBe('strokeSignal');
    const web = read('app/src/ui/Field.tsx');
    expect(web).toContain('border border-stroke-signal');
    expect(web, 'a field went back to being a fill').toContain('bg-transparent');

    // Two densities, the same split `Button` has: a screen's own input against an inline one.
    expect(FIELD_SIZE.page.label).toBe(text.s16);
    expect(FIELD_SIZE.row.label).toBe(text.s14);
    for (const density of ['page', 'row'] as const) {
      expect(FIELD_SIZE[density].minHeight, `${density} is under the target floor`)
        .toBeGreaterThanOrEqual(size.target);
      expect(Object.values(space), `${density}'s padding is off the scale`)
        .toContain(FIELD_SIZE[density].paddingX);
      expect(Object.values(space), `${density}'s padding is off the scale`)
        .toContain(FIELD_SIZE[density].paddingY);
    }
  });

  it('means the same four lines on both platforms, and says how tall a line is', () => {
    /*
     * `FIELD_LINES = 4` was four of nothing in particular, and each renderer
     * supplied the missing number for itself. Measured on the EpisodeComments compose box,
     * `size="page"`, 390 viewport, both builds served from this checkout:
     *
     * | | line box | box |
     * | --- | --- | --- |
     * | web | 24pt — Tailwind's preflight `1.5`, inherited | 358x**122** |
     * | phone | 23pt — `leadingOf(16, l143)` | 358x**176** |
     *
     * 54pt apart on one control. The phone's is the louder half and the plainer error:
     * `metrics.minHeight * FIELD_LINES` multiplies the 44pt **target floor** — what a
     * finger needs — by a line count, and lands at 2.2x the 80pt the core's own comment
     * says was being replaced by hand.
     *
     * The cause is one property up, and `tokens.ts` had already named it: the phone sets a
     * line height and *the web sets none*. A box measured in lines cannot have a height
     * until the table says how tall a line is, so `FIELD_BOX.leading` says it, and four
     * lines means four of those plus the padding and the two strokes on both platforms.
     * Re-measured on the same two builds afterwards: **358x117.5** on the web and
     * **358x118** on the phone. The half point is each platform's rounding of one line box
     * — CSS computes 1.43x16 = 22.88 and `leadingOf` rounds to 23 — and is what the numbers
     * below can and cannot say: the arithmetic is checked here, the rendered box is not.
     */
    expect(FIELD_LINES).toBe(4);
    expect(FIELD_BOX.leading, 'the table does not say how tall a line is').toBe(leading.l143);

    /*
     * The arithmetic, with the number it replaces named beside it. `Math.round` is
     * `leadingOf`'s, whose single owner is `mobile/src/ui/theme.ts` — a fractional line
     * height on a device is a fractional baseline — and `note.test.ts` pins that expression
     * in the file that owns it.
     */
    const lineBox = Math.round(FIELD_SIZE.page.label * FIELD_BOX.leading);
    const floor = lineBox * FIELD_LINES + FIELD_SIZE.page.paddingY * 2 + FIELD_BOX.stroke * 2;
    expect(lineBox).toBe(23);
    expect(floor).toBe(118);
    expect(floor, 'four lines is the target floor four times over again')
      .not.toBe(FIELD_SIZE.page.minHeight * FIELD_LINES);

    /*
     * The web wears the leading and takes its height from `rows`, which is what CSS
     * computes a textarea's content box from: `rows` line boxes, and nothing else. Those
     * two classes are the whole of the web's side of the agreement — so the multi-line
     * branch may add `resize-y` and no third geometry class, or the browser's answer stops
     * being four lines while both halves above still read correctly.
     */
    const webField = stripComments(read('app/src/ui/Field.tsx'));
    expect(webField, 'the textarea inherits whatever line height the body had')
      .toContain('leading-l143');
    expect(webField).toContain('rows={FIELD_LINES}');
    /*
     * Exactly that and nothing after it. The first version of this read `toContain`, and a
     * plant that appended `min-h-[300px]` to the same string walked through every clause in
     * this file: `rows` and the leading were both still correct and the box was 300.
     */
    expect(webField, 'the multi-line branch sets its own height beside `rows`')
      .toMatch(/className=\{`\$\{classes\} resize-y`\}/);
    /*
     * And the box floor is the token's name rather than the number that happens to equal it:
     * `--spacing-target` is `size.target`, and `min-h-11` was the same 44 arrived at twice.
     * Counted rather than contained, because both densities have to carry it and a clause
     * that reads the whole file for one copy passes on a file with one.
     */
    expect(webField.match(/min-h-target/g) ?? [], 'a density lost its floor')
      .toHaveLength(Object.keys(FIELD_SIZE).length);
    expect(webField, 'a bare Tailwind number where the table has a name')
      .not.toMatch(/min-h-\d/);

    /*
     * The phone composes the same terms and holds no number of its own. `FIELD_LINE` is
     * named once and used twice — the line height and the floor are the same line box, and
     * `_LINE` is the shape `note.test.ts` already blesses for exactly that.
     *
     * A plant that keeps the composition and redefines `FIELD_LINE` as the target floor
     * reproduces 176 with every clause above still green, so the definition is read too.
     */
    const phoneField = stripComments(read('mobile/src/ui/Field.tsx'));
    expect(phoneField, 'the phone multiplies the target floor by a line count')
      .not.toContain('minHeight * FIELD_LINES');
    expect(phoneField).toMatch(
      /FIELD_LINE\[size\] \* FIELD_LINES \+ metrics\.paddingY \* 2 \+ FIELD_BOX\.stroke \* 2/,
    );
    expect(phoneField, 'FIELD_LINE is not the line box the leading asks for')
      .toContain('leadingOf(FIELD_SIZE.page.label, FIELD_BOX.leading)');
    expect(phoneField).toContain('leadingOf(FIELD_SIZE.row.label, FIELD_BOX.leading)');
    // Worn, not merely declared: §6.182's lesson, which the focus clause below makes again.
    expect(phoneField).toMatch(/lineHeight: FIELD_LINE\[size\]/);
    expect(phoneField, 'the leading is a number the phone chose rather than the table\u2019s')
      .not.toMatch(/leadingOf\(metrics\.label, leading\./);
  });

  it('shows the phone where focus is, which React Native does not do for it', () => {
    /*
     * There is no `:focus-visible` on this platform, so a focused field would differ from an
     * unfocused one only by a caret. It thickens to `border.mark` in the focus colour — the
     * same two channels the web's ring uses and the same thickening a button uses for a
     * press. Drawn in the component because a screen cannot be trusted to remember it, which
     * is the whole finding on the other side.
     */
    const phone = read('mobile/src/ui/Field.tsx');
    expect(phone).toContain('onFocus');
    expect(phone).toContain('onBlur');
    const focused = /\n {2}focused: \{([^{}]*)\},/.exec(phone)?.[1] ?? '';
    expect(focused, 'no focused style to read').toBeTruthy();
    /*
     * And it has to be *worn*. §6.182: everything above is satisfied by a `styles.focused`
     * nothing references — delete `focused ? styles.focused : null` from the element's style
     * array and `onFocus`, `onBlur` and both tokens are still here, with no focus ring on the
     * one platform whose framework does not draw one for you.
     */
    expect(phone, 'the focused style is declared and never worn')
      .toMatch(/style=\{\[[\s\S]{0,400}focused \? styles\.focused/);
    expect(focused).toContain('FIELD_BOX.strokeFocused');
    expect(focused).toContain('FIELD_BOX.colourFocused');
  });
});
