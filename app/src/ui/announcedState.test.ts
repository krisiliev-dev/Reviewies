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
