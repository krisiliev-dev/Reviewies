import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROW_TAG } from '@reviewies/core/ui/row';
import { declarationOf, styleOf } from '@reviewies/core/test/source';

/**
 * A fact is not drawn in the shape of a control.
 *
 * The build has exactly three boxed forms and they all mean *press me*: a filled pill
 * (`Button` `primary`), an outlined pill (`Button` `secondary`), and an outlined plate
 * (`Choice`'s unselected option). §6.167 stated the rule while taking the plate off a
 * streaming service's name — **no box means no shape to be misread as a control** — and
 * §6.168 found the second instance by opening a picture the design track had never opened:
 * `light-05-calendar.png`, where `SEASON FINALE`, `PREMIERE` and `SERIES FINALE` are
 * hairline-outlined chips on the right of a row.
 *
 * What separated a fact from a control there was `strokeHairline` against `strokeSignal` —
 * one token, at 12px, in caps. `row.ts` quotes `section.ts` on exactly that shape: *"a
 * single-channel difference is the one that gets flattened again by the next person tuning
 * a value"*. The file relied on the thing it cites as unreliable.
 *
 * Two clauses, because §6.168 found two of these and the second was a different question:
 * the tag's box, and the figure tile that is one thing drawn two ways on two screens.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

/**
 * The raw text of a `function Name(...)`, up to the next top-level `function` or the end.
 *
 * `declarationOf` cannot reach one: it looks for `name:` or `name =`, and a function
 * declaration has neither. Raw rather than blanked, because what is being read here *is*
 * a string — a Tailwind class list — and `blankLiterals` would hand back a body with the
 * one thing this clause is about replaced by spaces. That is §6.121 in a helper: an
 * instrument that cannot see the defect passes everything.
 */
function functionBody(source: string, name: string): string {
  const at = source.indexOf(`function ${name}(`);
  if (at < 0) return '';
  const next = source.indexOf('\nfunction ', at + 1);
  return source.slice(at, next < 0 ? source.length : next);
}

describe('a row tag', () => {
  it('is stated as having no rule, so the absence is a decision', () => {
    // Written as an absence, the way `TOGGLE.off` is: a renderer that re-adds a border is
    // then disagreeing with something rather than filling in a blank.
    expect(ROW_TAG.rule).toBeNull();
    expect(ROW_TAG.tracking).toBe('t83');
  });

  it('is not boxed on either platform', () => {
    const web = declarationOf(read('app/src/ui/Row.tsx'), 'TAG') ?? '';
    expect(web, 'app/src/ui/Row.tsx has no TAG to read').toContain('tracking-t83');
    expect(web, 'the web draws a row tag as a box').not.toMatch(/border|rounded-|\bbg-/);

    const phone = styleOf(read('mobile/src/ui/Row.tsx'), 'tag') ?? '';
    expect(phone, 'mobile/src/ui/Row.tsx has no tag style to read').toContain('letterSpacing');
    expect(phone, 'the phone draws a row tag as a box').not.toMatch(
      /borderWidth|borderRadius|backgroundColor|padding/,
    );
  });
});

describe('a figure tile', () => {
  /*
   * The other half of §6.168, and a different kind of drift from the one every guard here
   * looks for. `Watches 122` on More and `Watched 1.0 days` on Stats are the same object.
   * Stats drew it on `groundRaised`; More drew it on `groundWell` **inside** a
   * `SURFACE.card`, so it sat two steps below its own container — and the two platforms
   * *agreed with each other* on each screen. Not renderer drift. Screen drift, which
   * `coreWiring` and every parity check are blind to by construction.
   *
   * Read as: whatever ground More's figure sits on, it is not one it paints itself, because
   * the card around all four is the object and a card inside a card is a boundary nobody
   * needs.
   */
  it('paints no ground of its own on the screen where it is already on a card', () => {
    const web = functionBody(read('app/src/screens/More.tsx'), 'Stat');
    expect(web, 'app/src/screens/More.tsx has no Stat to read').toContain('Note');
    expect(web, "More's figure paints a ground inside the card around it").not.toMatch(/\bbg-ground/);

    const phone = styleOf(read('mobile/app/(tabs)/more.tsx'), 'stat') ?? '';
    expect(phone, 'mobile/app/(tabs)/more.tsx has no stat style to read').toContain('flex');
    expect(phone, "More's figure paints a ground inside the card around it").not.toMatch(
      /backgroundColor/,
    );
  });
});
