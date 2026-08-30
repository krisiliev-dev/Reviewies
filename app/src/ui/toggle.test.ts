import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOGGLE, toggleState } from '@reviewies/core/ui/toggle';
import { SURFACE_OFF } from '@reviewies/core/ui/surface';
import { border, color, radius, size, text } from '@reviewies/core/tokens';

/**
 * The one setting in the product is drawn by this build, not by the platform.
 *
 * §6.165 photographed the two states of not owning a control: a **teal** sliding switch on the
 * phone (`<Switch value={openComments} />`, no colour props) and a white square with a black
 * tick on the web (`accent-color` is a hint the browser may ignore, at 20px against a 44pt
 * floor). Neither was a decision anybody made.
 *
 * `reveals.test.ts` and `emptyStates.test.ts` are the shape: a register in the core, and a
 * clause whose second half sweeps for the thing coming back. Here the sweep is the important
 * half — a component nobody uses is not the failure mode, a `<Switch>` or an `<input
 * type="checkbox">` reappearing is.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const withoutProse = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const RENDERERS = ['app/src/ui/Toggle.tsx', 'mobile/src/ui/Toggle.tsx'];
/** Every screen either platform draws. A platform control could reappear on any of them. */
const SCREENS = ['app/src', 'mobile/app', 'mobile/src'];

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist', 'dist-signedin', 'dist-real', '.expo'].includes(entry.name)) continue;
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) filesUnder(path, out);
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

describe('a setting that is on or off', () => {
  it('takes its box and its mark from the tokens, not from a number', () => {
    // The box is the target floor and the stroke is the drawn weight §6.85 chose. A control
    // that agrees with the tokens by coincidence is a control that stops agreeing.
    expect(TOGGLE.size).toBe(size.target);
    expect(TOGGLE.stroke).toBe(border.icon);
    expect(TOGGLE.radius).toBe(radius.plate);
    // And the mark is the same 20 `CrossOff` draws. Both renderers spell 20 out — Tailwind
    // cannot read an interpolated class and StyleSheet has no reason to — so this is what
    // holds the literal and the token together.
    expect(TOGGLE.mark).toBe(20);
    expect(TOGGLE.mark, 'the mark is no longer a type size the build has').toBe(text.s20);

    /*
     * Both halves of that, per renderer, and this clause used to make neither.
     *
     * It asserted `TOGGLE.size === size.target` — a statement about the table about itself,
     * in which no renderer participates — and then swept both renderers for
     * `size-5|size={TOGGLE.mark}`. The web's `size-5` is 20px *as a rule*, so the clause read
     * as an agreement; the rendered mark measures **16x16**, because `Tick` sizes
     * itself in `em` and the winner between two utilities setting the same property is
     * Tailwind's emission order, not the order they are written in. See the clause below.
     *
     * So: the box is the token's name (`--spacing-target`, which is `size.target`) and not a
     * bare number that happens to equal it, and no width or height utility appears anywhere
     * in the web renderer.
     *
     * This was scoped to this component because nothing swept the rest: `h-11 w-11` on
     * `CrossOff` and `min-h-12` on `Button` were the same 44 and 48 arrived at twice, and
     * `space.test.ts`'s `UTILITY` regex covered none of `size`/`h`/`w`/`min-h`. §6.186
     * widened it and the scope argument is spent — twenty-three sites in eleven files, and
     * the sentence above that *"the others agree with the table"* was wrong about all of
     * them: Tailwind's own numeric steps compile to `calc(var(--spacing) * n)` with
     * `--spacing` at `0.25rem`, so `h-11` is 2.75rem and agrees with 44 at exactly one text
     * size. The box clause in `space.test.ts` asks the whole tree for the name now; what is
     * left here is this component's own two lines, which is what a component's file is for.
     */
    const web = withoutProse(read('app/src/ui/Toggle.tsx'));
    expect(web, 'the box is a bare number where the table has a name').toContain('size-target');
    expect(web, 'a Tailwind number stands where a token name belongs')
      .not.toMatch(/\b(?:size|w|h|min-w|min-h)-\d/);

    const phone = withoutProse(read('mobile/src/ui/Toggle.tsx'));
    expect(phone, 'the phone stopped reading the box out of the table').toContain('TOGGLE.size');
    expect(phone, `${'mobile/src/ui/Toggle.tsx'} does not draw the mark at TOGGLE.mark`)
      .toContain('size={TOGGLE.mark}');
  });

  it('draws the mark at the size the table says, which on the web is a font size', () => {
    /*
     * The finding only a browser could make. §6.184.
     *
     * `Tick` is `h-[1em] w-[1em] shrink-0 ${className}` — it sizes itself in `em` and takes
     * the caller's class *after* its own. `size-5` and `h-[1em]` set the same two properties
     * at the same specificity, so the winner is whichever Tailwind emits last, which is a
     * fact about the compiled stylesheet and not about this file. Measured in `app/dist`:
     * `.size-5` at byte 10020, `.h-[1em]` at 10364. The `em` rule wins, and the toggle's span
     * carries no `text-*` class, so its `1em` is the inherited body 16px.
     *
     * | | on Settings, 390 viewport | expected |
     * | --- | --- | --- |
     * | web toggle tick | **16x16** | 20x20 |
     * | phone toggle tick | 20x20 | 20x20 |
     * | web `CrossOff` tick, `text-s20` | 20x20 | 20x20 |
     *
     * A tick a fifth smaller than every other tick in the product, on the only setting there
     * is, passing a clause named for taking its mark from the tokens.
     *
     * The rule that came out of it — on the web a mark is sized by the **font size** of the
     * thing it sits in, never by a box utility, because `Mark.tsx` has already decided the
     * mark is one em — was a sweep of every `Tick` and `Chevron` in the tree, sitting here.
     * It is in `mark.test.ts` now, which owns `Mark.tsx`; this paragraph's own last line
     * said that was where it belonged and that it was here because the defect was found
     * here. Six of the seven call sites had it right, and the seventh is this one, so what
     * stays behind is the assertion about *this* component. §6.186.
     */
    // The premise, read rather than remembered: if `Mark.tsx` stops sizing in `em` this
    // whole clause is about a collision that no longer happens, and should be re-measured.
    // `mark.test.ts` reads it too — it is the premise of the sweep as much as of this line.
    expect(withoutProse(read('app/src/ui/Mark.tsx')), 'the mark no longer sizes itself in em')
      .toContain('h-[1em] w-[1em]');
    const web = withoutProse(read('app/src/ui/Toggle.tsx'));
    expect(web, 'the mark is sized by a box utility again, and `h-[1em]` will win')
      .toContain(`<Tick className="text-s${TOGGLE.mark}" />`);
  });

  it('says what an unavailable mark is drawn in, rather than letting each renderer pick', () => {
    /*
     * The second finding (§6.184), and the one this file had already written the warning for:
     * *"the same size as the other mark is exactly the sort of agreement two files reach by
     * hand and then lose"* — one property over.
     *
     * `TOGGLE.unavailable` was the single string `'strokeHairline'` and its own comment said
     * *the border*. A setting that is on and unavailable still draws a tick, nothing stated
     * its colour, and both renderers reached for `dimInk`: `text-dim-ink` on the web and
     * `theme[disabled ? 'dimInk' : …]` on the phone. Those two lines were the only mention of
     * `dimInk` anywhere in either app outside `tokens.ts`, and `tokens.ts` called it *"Watching
     * Mode's auto-dim, as a palette rather than an opacity"* — not a disabled colour, and
     * wrong in both directions: 9.31:1 on the dark ground, which is a *louder* mark than the
     * ink beside it for a control you cannot use, and 1.78:1 in light, which is no mark at all.
     *
     * There is no `dimInk` at all now. A later sprint read Watching Mode on both platforms, found no
     * auto-dim of any kind to belong to, and deleted the three dim roles and `linger.dimAfter`
     * with them. The two clauses below are kept as memory rather than retired: a name that has
     * been wrong once is the name somebody reaches for again.
     *
     * The build's off ink is `SURFACE_OFF.ink`, which is what `Key` and `PadCell` already draw
     * an unavailable control's contents in. Read, not copied.
     */
    expect(TOGGLE.unavailable.border).toBe('strokeHairline');
    expect(TOGGLE.unavailable.mark).toBe(SURFACE_OFF.ink);
    expect(TOGGLE.unavailable.mark, "Watching Mode's dim is not a disabled colour")
      .not.toBe('dimInk');
    // Named colours, not invented ones — the `transparent` trap this table already records.
    for (const role of [TOGGLE.unavailable.border, TOGGLE.unavailable.mark]) {
      expect(color.dark, `${role} is a name that looks like a token`).toHaveProperty(role);
    }

    /*
     * And neither renderer names a colour of its own. The web's literal is held to the token
     * by spelling rather than by hand: Tailwind needs a written-out class, so the class is
     * derived from the table here and compared, which is `ui/button#SIZE`'s arrangement.
     */
    const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    const web = withoutProse(read('app/src/ui/Toggle.tsx'));
    expect(web).toContain(`text-${kebab(TOGGLE.unavailable.mark)}`);
    expect(web).toContain(`border-${kebab(TOGGLE.unavailable.border)}`);
    const phone = withoutProse(read('mobile/src/ui/Toggle.tsx'));
    expect(phone).toContain('TOGGLE.unavailable.mark');
    expect(phone).toContain('TOGGLE.unavailable.border');
    for (const file of RENDERERS) {
      expect(withoutProse(read(file)), `${file} names a colour the table does not state`)
        .not.toMatch(/dimInk|dim-ink/);
    }
  });

  it('says the same thing about its state on both platforms', () => {
    // The **prop**, not the value: §6.172 found that `{ checked }` is React Native's
    // `accessibilityState` shape and that react-native-web 0.21 does not read it, so the
    // phone spread it and announced nothing. `aria-checked` is read by both.
    expect(toggleState(true)).toEqual({ 'aria-checked': true });
    expect(toggleState(false)).toEqual({ 'aria-checked': false });
    // Both call sites read it rather than spelling `{ checked: … }` themselves, which is the
    // one thing two platforms must not answer separately — and the reason this file exists.
    for (const file of ['app/src/screens/Settings.tsx', 'mobile/app/data.tsx']) {
      expect(withoutProse(read(file)), `${file} spells its own switch state`).toContain('toggleState');
    }
  });

  it('draws the mark and lets the row be the control', () => {
    for (const file of RENDERERS) {
      const source = withoutProse(read(file));
      // Hidden from the reading order: the row announces the setting once. A mark that is
      // also focusable is the "label and a separate unlabelled switch" this replaced.
      expect(source, `${file} is not hidden from the reading order`).toMatch(/aria-hidden/);
      expect(source, `${file} handles a press, so it is a second control`).not.toMatch(
        /onPress|onClick/,
      );
    }
  });

  it('has no platform-drawn switch or checkbox left on any screen', () => {
    /*
     * The half that matters. A `Switch` from react-native or an `<input type="checkbox">` is
     * a control whose colour, size and shape belong to the platform — which is how a teal
     * switch and a white square got into a product that has neither colour.
     *
     * `type="radio"` is deliberately not swept: `Choice` renders those and owns them.
     */
    const found: string[] = [];
    for (const dir of SCREENS) {
      for (const file of filesUnder(dir)) {
        const source = withoutProse(read(file));
        if (/<Switch\b/.test(source)) found.push(`${file} draws a react-native Switch`);
        if (/type="checkbox"/.test(source)) found.push(`${file} draws a browser checkbox`);
      }
    }
    expect(found, 'a screen hands a control back to the platform').toEqual([]);
  });
});
