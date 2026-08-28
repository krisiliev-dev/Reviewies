import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { FIELD_BOX, FIELD_SIZE } from '@reviewies/core/ui/field';
import { border, radius, size, space, text } from '@reviewies/core/tokens';
import { COPY } from '@reviewies/core/copy';

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
    expect(focused).toContain('FIELD_BOX.strokeFocused');
    expect(focused).toContain('FIELD_BOX.colourFocused');
  });
});
