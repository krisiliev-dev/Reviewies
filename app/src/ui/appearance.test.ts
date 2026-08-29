import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { resolve } from 'node:path';
import { TAB_ICON_PATHS } from '@reviewies/core/ui/tabIcon';

/**
 * Three things that were only ever going to be found by looking.
 *
 * Every property a test had been pointed at was fine. The tab icons were the right
 * size, `aria-hidden` beside a real label, and nothing to do with contrast — and two of
 * them rendered as colour emoji, one as an empty square and one as a two-pixel sliver.
 * The tab labels passed every contrast and naming check and ignored the reader's text
 * setting completely. The disabled Create button met the rules because disabled controls
 * are exempt from them, and looked broken.
 *
 * None of those is checkable by appearance. All three are checkable by cause, which is
 * what these do — the same trade §6.21 made when it pinned `min-w-[48px]` rather than
 * trying to assert that a control looked right.
 */
const ROOT = resolve(__dirname, '../../..');

const sources = () =>
  globSync('app/src/**/*.tsx', { cwd: ROOT })
    .filter((f) => !f.includes('.test.'))
    .map((file) => ({ file, source: readFileSync(resolve(ROOT, file), 'utf8') }));

describe('what the app looks like, checked by its causes', () => {
  it('reads the source it is meant to be checking', () => {
    // A glob that matched nothing would pass all three checks below.
    expect(sources().length).toBeGreaterThan(20);
  });

  it('sizes no text in pixels', () => {
    // `text-[10px]` on the tab labels is why they were the one piece of text in the app
    // that ignored the setting entirely, while the icons beside them — sized in `em` —
    // doubled. WCAG 1.4.4 is about the text, and a pixel is the one unit that cannot
    // honour it.
    const fixed: string[] = [];
    for (const { file, source } of sources()) {
      for (const [match] of source.matchAll(/\btext-\[\d+px\]/g)) fixed.push(`${file}: ${match}`);
    }

    expect(fixed).toEqual([]);
  });

  it('draws its icons rather than typing them, on both platforms', () => {
    /*
     * A glyph's appearance belongs to whatever font the device has. `▶` and `⚙` have emoji
     * presentation variants and came out in full colour; `❏` came out as an empty square,
     * which is what a missing glyph looks like. Checked at the tab bar, which is where it
     * mattered and where a regression would be most visible.
     *
     * The name is a product claim again, and it is one for the first time. §6.139 found it
     * making that claim over a body that read `app/src/App.tsx` — this whole file globs
     * `app/src/**` and had never seen the phone, which was passing `icon('⌕')`,
     * `icon('✦')`, `icon('☰')`, `icon('⋯')` throughout. It was renamed to what it proved
     * and given an exemption that failed the day the phone stopped typing them.
     *
     * §6.140 closed it, and the exemption fired on cue rather than being noticed and
     * deleted — which is the whole of what it was for. The drawings live in
     * `core/src/ui/tabIcon.ts` now and `tabIcon.test.ts` holds both renderers to them; what
     * stays here is the web's half, at the level this file works at.
     */
    /*
     * Both bars, read for the thing the old version could not see. It used to slice
     * `const TABS` out of `App.tsx` and check the strings in it, which stopped meaning
     * anything the moment §6.140 moved that list to `core/src/ui/tabIcon.ts` — the clause
     * failed on `const TABS = TAB_BAR;`, correctly, for having been pinned to a spelling
     * rather than to the claim. What it is named for is that neither bar hands a mark to a
     * font, and that is what it reads.
     */
    const bars = {
      web: readFileSync(resolve(ROOT, 'app/src/App.tsx'), 'utf8'),
      phone: readFileSync(resolve(ROOT, 'mobile/app/(tabs)/_layout.tsx'), 'utf8'),
    };
    for (const [platform, source] of Object.entries(bars)) {
      expect(source, `${platform}'s bar does not read the drawings`).toContain(
        '@reviewies/core/ui/tabIcon',
      );
      /*
       * A tab whose mark is a literal outside the Latin range is a glyph again. The range
       * is deliberately wide: `▶ ⌕ ✦ ☰ ⋯` are geometric shapes, `⚙` is a dingbat, and the
       * two that rendered worst had emoji presentation variants — no single block covers
       * what a font may decide to draw in colour.
       */
      const marks = [...source.matchAll(/tabBarIcon: icon\(([^)]*)\)|icon: '([^']*)'/g)];
      for (const [whole, a, b] of marks) {
        const mark = a ?? b ?? '';
        expect(mark, `${platform} types ${whole} rather than naming a drawing`).toMatch(
          /^[a-zA-Z.]+$/,
        );
      }
    }
    // And the drawings the table holds are paths, not characters somebody could type.
    for (const [name, path] of Object.entries(TAB_ICON_PATHS)) {
      expect(path, `${name} is not path data`).toMatch(/^[Mm][\s\d.-]/);
    }
  });

  it('never disables a filled button by fading it', () => {
    // `bg-accent … disabled:opacity-40` gave a maroon block with dark red lettering: it
    // read as broken rather than as waiting. Disabled controls are exempt from the
    // contrast rules, which is a reason they may be quiet and not a reason to make them
    // illegible. Fading a *surface* is fine, which is why this only looks at fills.
    const faded: string[] = [];
    for (const { file, source } of sources()) {
      for (const [match] of source.matchAll(/className[^\n]*bg-accent[^\n]*disabled:opacity/g)) {
        faded.push(`${file}: ${match.slice(0, 60)}`);
      }
    }

    expect(faded).toEqual([]);
  });
});
