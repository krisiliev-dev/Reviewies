import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { globSync } from 'node:fs';

/**
 * The phone's only route to WCAG 1.4.4, guarded where it can be.
 *
 * The web app is checked properly: app/smoke.mjs renders every screen with the root
 * font size doubled and fails if the page grows a horizontal scrollbar or a control
 * leaves the viewport. It found two real defects that way — the star rating pushed off
 * the side of the screen, twice, the second time because the 48px minimum had been
 * written in rem and so doubled along with the text.
 *
 * The phone cannot be checked the same way. Text there scales through the operating
 * system's own setting, which react-native-web does not implement, so the export the
 * smoke suite drives renders at a fixed size whatever is asked of it. What is left to
 * guard is the thing that would silently switch the feature off: React Native scales
 * text only while `allowFontScaling` stays on, and one component opting out is invisible
 * until someone with large text opens that screen.
 */
const ROOT = resolve(__dirname, '../../..');

function phoneSources(): Array<{ path: string; source: string }> {
  return globSync('mobile/{app,src}/**/*.tsx', { cwd: ROOT }).map((path) => ({
    path,
    source: readFileSync(resolve(ROOT, path), 'utf8'),
  }));
}

describe('text scaling on the phone', () => {
  it('is never switched off', () => {
    const files = phoneSources();

    // Non-vacuous: a glob that matched nothing would pass the assertion below happily.
    expect(files.length).toBeGreaterThan(15);
    expect(files.some(({ source }) => source.includes('<Text'))).toBe(true);

    const optedOut = files
      .filter(({ source }) => /allowFontScaling\s*=\s*\{?\s*false/.test(source))
      .map(({ path }) => path);

    expect(optedOut).toEqual([]);
  });

  /**
   * The sequel to the check above, one line further on.
   *
   * `allowFontScaling={false}` switches scaling off and is the obvious defect.
   * `maxFontSizeMultiplier={1.4}` leaves it on and caps it, which is the same defect
   * wearing a reasonable face — and it is the change most likely to be made in good
   * faith, by somebody stopping a heading wrap at 200% without realising they have just
   * decided how large this app is allowed to be for everyone who needs it larger.
   *
   * Geometry reflows instead. That is what the equal-width transport cells are for.
   */
  it('never caps how far text may scale', () => {
    const files = phoneSources();
    expect(files.length).toBeGreaterThan(15);

    const capped = files
      .filter(({ source }) => /maxFontSizeMultiplier/.test(source))
      .map(({ path }) => path);

    expect(capped, 'let the layout reflow rather than capping the type').toEqual([]);
  });

  it('keeps the rating targets in absolute units', () => {
    // 24 CSS pixels is what WCAG 2.5.8 asks for, and it does not scale with text. On
    // the phone that is a plain number, which is already absolute; the web equivalent
    // was written in rem first and doubled, which is the mistake this remembers.
    const phone = readFileSync(resolve(ROOT, 'mobile/src/ui/StarRating.tsx'), 'utf8');
    expect(phone).toMatch(/const MIN_HALF = 24;/);

    const web = readFileSync(resolve(ROOT, 'app/src/ui/StarRating.tsx'), 'utf8');
    // The className attributes only. The comment above them names the mistake it is
    // remembering, and a test that reads prose would fail on the explanation.
    const classNames = [...web.matchAll(/className="([^"]*)"/g)].map(([, value]) => value);
    expect(classNames.some((value) => value.includes('min-w-[48px]'))).toBe(true);
    expect(classNames.some((value) => /\bmin-[wh]-\d/.test(value))).toBe(false);
  });
});
