import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOGGLE, toggleState } from '@reviewies/core/ui/toggle';
import { border, radius, size } from '@reviewies/core/tokens';

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
    for (const file of RENDERERS) {
      expect(withoutProse(read(file)), `${file} does not draw the mark at TOGGLE.mark`).toMatch(
        /size-5|size=\{TOGGLE\.mark\}/,
      );
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
