import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { resolve } from 'node:path';

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

  it('draws its icons rather than typing them', () => {
    // A glyph's appearance belongs to whatever font the device has. `▶` and `⚙` have
    // emoji presentation variants and came out in full colour; `❏` came out as an empty
    // square, which is what a missing glyph looks like. Checked at the tab bar, which is
    // where it mattered and where a regression would be most visible.
    const app = readFileSync(resolve(ROOT, 'app/src/App.tsx'), 'utf8');
    const tabs = app.slice(app.indexOf('const TABS'), app.indexOf('function TabBar'));

    expect(tabs).toContain('icon:');
    // Icon names, not characters. Anything outside this range is a glyph again.
    expect(tabs.match(/icon: '([^']*)'/g)).toEqual(
      expect.arrayContaining([expect.stringMatching(/icon: '[a-z]+'/)]),
    );
    for (const [, value] of tabs.matchAll(/icon: '([^']*)'/g)) {
      expect(value, `${value} is not an icon name`).toMatch(/^[a-z]+$/);
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
