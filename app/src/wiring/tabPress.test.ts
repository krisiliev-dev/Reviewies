import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '@reviewies/core/test/source';
import { ROOT } from './pairs';

/**
 * Whether the controls the app is navigated with answer a press at all.
 *
 * `app/src/ui/surface.test.ts` sweeps presses and does it well — it counts what it saw, so
 * it is not vacuous, and it holds every press it finds to `surface.ts`'s one direction. What
 * it cannot see is an absence: **it iterates the controls that already carry a press rule,
 * and asks whether each goes the right way.** A control with no rule is not in the set being
 * swept, so it is not wrong; it is invisible.
 *
 * §6.191 found what that costs by measuring the interval between press and settle instead of
 * reading source. **7 of 24 sampled web presses never changed colour in 250ms, and every one
 * was a tab.** The eight controls the product is navigated with — the highest-frequency
 * gesture in it — gave nothing back, while `surface.ts` said in prose that a press sinks
 * *"one direction, for every control on both platforms"*.
 *
 * So this asks the other question, and only about the tab bar, because that is where the
 * measurement was. The general form — every pressable in both apps carries a press rule —
 * needs a list of what counts as a pressable, which is `offers.test.ts`'s subject and a
 * larger sweep than one finding earns.
 */

const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

describe('the web tab bar', () => {
  const source = stripComments(read('app/src/App.tsx'));

  /*
   * `<NavLink` and not `NavLink`. The bare name occurs three times in that file — the import,
   * the opening tag and the closing one — and `clauses.test.ts` refused the loose spelling
   * when this was written, correctly: a whole-file `toContain` for a needle the file carries
   * more than once says nothing about which occurrence it found. Both needles below occur
   * exactly once.
   */
  it('reads the file that draws it', () => {
    expect(source).toContain('<NavLink');
    expect(source).toContain('TABS.map');
  });

  /*
   * The rule on the `NavLink` itself rather than anywhere in the file: a press state on some
   * other element would satisfy a looser needle while the tab still did nothing. The slice
   * runs from `<NavLink` to the `>` that closes its opening tag.
   */
  it('sinks when it is pressed', () => {
    const at = source.indexOf('<NavLink');
    expect(at, 'no NavLink in App.tsx').toBeGreaterThan(-1);
    const opening = source.slice(at, source.indexOf('\n            >', at));
    expect(opening, 'the tab bar has no press state').toMatch(/active:bg-/);
  });

  /*
   * And the direction, from the ground it sits on. The nav is `bg-ground`; `surface.ts`'s
   * table says a press sinks, so the only correct destination is `ground.well`. A press that
   * *rose* would satisfy the clause above and be the §6.122 defect — a state that changes
   * and changes the wrong way.
   */
  it('sinks rather than rises, from the ground the bar is drawn on', () => {
    expect(source, 'the nav is no longer drawn on `ground`').toContain('bg-ground"');
    const at = source.indexOf('<NavLink');
    const opening = source.slice(at, source.indexOf('\n            >', at));
    expect(opening).toContain('active:bg-ground-well');
    expect(opening, 'a press that rises is not a press').not.toMatch(/active:bg-ground-raised/);
  });
});
