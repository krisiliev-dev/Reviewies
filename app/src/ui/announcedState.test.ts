import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { toggleState } from '@reviewies/core/ui/toggle';

/**
 * The phone says what state a control is in, in the spelling both renderers read.
 *
 * §6.171 measured every radio on the phone's Stats reporting `aria-checked: null` —
 * including the one that *is* the answer on arrival — and filed it as something only a
 * device could settle. It was settled here instead, by reading the renderer:
 *
 * - `react-native-web@0.21`'s `createDOMProps` maps a flat **`aria-checked`** (or the
 *   deprecated `accessibilityChecked`) to the DOM. It does not read `accessibilityState`.
 * - The only two files in that package that mention `accessibilityState` are
 *   `isDisabled.js` — which reads `props.disabled` and the long-dead `accessibilityStates`
 *   *plural*, not this — and `TouchableWithoutFeedback`, which nothing here uses.
 * - React Native 0.86 declares `'aria-checked'?: boolean | 'mixed'` in its own view types,
 *   so the flat spelling is the one that reaches **both** platforms.
 *
 * So `accessibilityState={{ … }}` was a dead prop at seventeen sites across nine
 * components: `CrossOff`, `Choice`, `Button`, `Key`, `PadCell`, `Row`, `WhereToWatch`,
 * `ContentWarnings`, `RemotePanel`, and two screens. Every `checked`, `selected`,
 * `expanded` and `busy` the phone has ever announced went nowhere in the export the design
 * track and the smoke suite both drive.
 *
 * This is the sweep, and it is the half that would rot: the RN documentation still shows
 * `accessibilityState`, so the next person writing a control will reach for it.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const withoutProse = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const PHONE = ['mobile/app', 'mobile/src'];
const MOBILE_UI = 'mobile/src/ui';

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist', 'dist-real', '.expo'].includes(entry.name)) continue;
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) filesUnder(path, out);
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

describe('how the phone announces a control’s state', () => {
  it('never uses the prop react-native-web does not read', () => {
    const found: string[] = [];
    for (const dir of PHONE) {
      for (const file of filesUnder(dir)) {
        if (/accessibilityState=/.test(withoutProse(read(file)))) {
          found.push(`${file} announces through accessibilityState, which the export drops`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it('still announces something, so this is not a sweep that emptied the app', () => {
    /*
     * Non-vacuity, and the shape §6.121 is about: deleting every `accessibilityState` would
     * satisfy the clause above perfectly while making the phone say less than it did. What
     * replaced them has to be present and has to be the flat spelling.
     */
    let announcing = 0;
    for (const dir of PHONE) {
      for (const file of filesUnder(dir)) {
        const source = withoutProse(read(file));
        announcing += (source.match(/aria-(checked|selected|expanded|busy|disabled)=/g) ?? []).length;
      }
    }
    expect(announcing, 'the phone announces no control state at all').toBeGreaterThan(15);
  });

  it('hides a decoration in one spelling, and it is the one both renderers read', () => {
    /*
     * §6.173, the same defect one prop family over, and then the correction to it.
     *
     * `accessibilityElementsHidden` and `importantForAccessibility` are how React Native
     * takes something out of the reading order, and **neither appears in `createDOMProps`**
     * — so four elements hidden by those alone were hidden on a device and read aloud in
     * the export. The measurement is what settled that rather than the grep: the poster's
     * fallback initials sat in the DOM as `KN` and `LD`, plain text, `aria-hidden: null`,
     * so every Up Next row announced its title and then its own initials as loose prose.
     * `CatchUp`'s scrim was worse — a `Pressable` with an `onPress` and no name, sitting in
     * a sheet's reading order.
     *
     * The first fix added `aria-hidden` **beside** the two, on the argument that they were
     * two audiences. Reading `react-native/Libraries/Components/View/View.js` killed that
     * argument: `if (ariaHidden !== undefined)` sets `accessibilityElementsHidden` and
     * `importantForAccessibility='no-hide-descendants'` itself, and `Text.js` does the
     * same. They are not two audiences; they are one thing said twice, which is §6.138.
     *
     * So the rule is an **absence**, written the way `ROW_TAG.rule` is: nothing under the
     * phone may name either prop. `aria-hidden` alone reaches both renderers — RN expands
     * it, react-native-web maps it. The one element that does not expand it is
     * `react-native-svg`'s `Svg`, which spreads onto a native host component; carrying the
     * two there was measurably worse than nothing, because its web build passed
     * `importantForAccessibility` through onto all ten `<svg>` elements of the export as an
     * invalid HTML attribute. That icon is wrapped in a hidden `View` now, so the absence
     * holds everywhere with no exception to remember.
     */
    const said: string[] = [];
    for (const dir of PHONE) {
      for (const file of filesUnder(dir)) {
        const source = withoutProse(read(file));
        if (/accessibilityElementsHidden|importantForAccessibility/.test(source)) {
          said.push(`${file} spells a hidden decoration the way React Native writes it for you`);
        }
      }
    }
    expect(said).toEqual([]);
  });

  it('hides the four decorations that were being read aloud', () => {
    /*
     * The absence above would also be satisfied by hiding nothing at all, which is
     * §6.121's shape — a clause that checks nothing once the thing it guards is deleted.
     * These are the four §6.173 measured, each named so that removing one is a failure
     * with a filename in it rather than a silently smaller number.
     */
    const bare: string[] = [];
    for (const file of ['Poster.tsx', 'TabIcon.tsx', 'CatchUp.tsx', 'Toggle.tsx']) {
      const source = withoutProse(read(`${MOBILE_UI}/${file}`));
      if (!/aria-hidden/.test(source)) bare.push(`${file} hides its decoration from nobody`);
    }
    expect(bare).toEqual([]);
  });

  it('has one owner for the toggle, and it is the prop rather than the value', () => {
    // `{ checked }` was the `accessibilityState` shape: the phone spread it and announced
    // nothing, the web reached in for `.checked`. One object, two spellings, one arriving.
    expect(toggleState(true)).toEqual({ 'aria-checked': true });
    for (const file of ['app/src/screens/Settings.tsx', 'mobile/app/data.tsx']) {
      expect(withoutProse(read(file)), `${file} unpacks the toggle's state by hand`).toContain(
        '{...toggleState(',
      );
    }
  });
});
