import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '@reviewies/core/test/source';
import {
  TAB_BAR,
  TAB_ICON_BOX,
  TAB_ICON_PATHS,
  TAB_ICON_SIZE,
} from '@reviewies/core/ui/tabIcon';

/**
 * The tab bar's marks, held to one table — the pass `key.ts` gave the remote fascia and
 * this control never got.
 *
 * The web stopped typing its icons four sprints before this, and the finding stayed on the
 * web because the table it produced lived in a `.tsx` file under `app/`. The phone went on
 * passing `icon('⌕')`, `icon('✦')`, `icon('☰')`, `icon('⋯')`, and §6.138 photographed the
 * result: the most-seen control in the product, drawn two different ways.
 */
const ROOT = resolve(import.meta.dirname, '../../..');
const read = (path: string) => stripComments(readFileSync(resolve(ROOT, path), 'utf8'));

const RENDERERS = {
  phone: read('mobile/src/ui/TabIcon.tsx'),
  web: read('app/src/ui/TabIcon.tsx'),
};
const BOTH = Object.entries(RENDERERS);
const BARS = {
  phone: read('mobile/app/(tabs)/_layout.tsx'),
  web: read('app/src/App.tsx'),
};

describe('the tab bar’s marks', () => {
  it('reads two renderers and one table', () => {
    for (const [platform, source] of BOTH) {
      expect(source.length, platform).toBeGreaterThan(200);
    }
    expect(Object.keys(TAB_ICON_PATHS).length).toBeGreaterThanOrEqual(TAB_BAR.length);
  });

  it('is drawn rather than typed, on both platforms', () => {
    /*
     * The defect this closes. A glyph's appearance belongs to whatever font the device
     * happens to have: measured in a browser, `▶` and `⚙` drew in full colour because they
     * have emoji presentation variants, `❏` as an empty square — indistinguishable from a
     * missing glyph — and `◔` as a sliver a couple of pixels tall.
     *
     * Every property a check can read was fine on all of them. That is why this asserts the
     * *mechanism* rather than an appearance: a path is the same drawing everywhere.
     */
    for (const [platform, source] of BOTH) {
      expect(source, `${platform} does not read the table`).toContain('TAB_ICON_PATHS[name]');
    }
    // And no bar types one. The range is the emoji and dingbat blocks the web found, plus
    // the geometric shapes `▶ ✦ ☰ ⌕ ⋯` came from.
    for (const [platform, source] of Object.entries(BARS)) {
      expect(source, `${platform}'s bar types a glyph again`).not.toMatch(
        /icon\(['"][^a-z'"][^'"]*['"]\)/,
      );
    }
  });

  it('names its marks rather than drawing them at the call site', () => {
    // A path in a screen is the tenth answer to a question the table answers, which is the
    // shape `key.ts` records for the fascia: one table, not one per surface.
    for (const [platform, source] of Object.entries(BARS)) {
      expect(source, `${platform}'s bar carries path data`).not.toMatch(/d="M[\d.]/);
    }
    for (const tab of TAB_BAR) {
      expect(Object.keys(TAB_ICON_PATHS), `${tab.icon} has no drawing`).toContain(tab.icon);
    }
  });

  it('draws every path inside the box the table declares', () => {
    /*
     * A path drawn for a different viewBox is a mark at the wrong scale beside four right
     * ones, and nothing about the file would say so. Every coordinate has to fit the square.
     */
    for (const [name, path] of Object.entries(TAB_ICON_PATHS)) {
      const numbers = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
      expect(numbers.length, `${name} has no coordinates`).toBeGreaterThan(3);
      for (const value of numbers) {
        expect(Math.abs(value), `${name} leaves the ${TAB_ICON_BOX} box`).toBeLessThanOrEqual(
          TAB_ICON_BOX + 1,
        );
      }
    }
    for (const [platform, source] of BOTH) {
      expect(source, `${platform} writes its own viewBox`).toContain('TAB_ICON_BOX');
    }
  });

  it('keeps the drawing off the reader’s text setting, on both platforms', () => {
    /*
     * The bar carries five tabs across a phone and an icon that grows with the text setting
     * takes the room the label needs. The label is the part that has to scale — WCAG 1.4.4
     * is about the text — so the drawing stays put and gets out of the way.
     *
     * The phone's icon *was* text, at `text.s20`, so it scaled with the setting and pushed
     * the labels: the one thing the web had deliberately stopped doing.
     */
    expect(TAB_ICON_SIZE).toBeGreaterThan(16);
    /*
     * **Both** dimensions, named. `toContain('TAB_ICON_SIZE')` was the first spelling and a
     * plant walked straight through it: replacing `width` with a literal left `height`
     * still reading the token, so the file contained the string and the mark was half a
     * hand-typed number. §6.139's lesson, in a guard written the same hour it was written
     * down — a clause easier to satisfy than its name.
     */
    for (const [platform, source] of BOTH) {
      for (const side of ['width', 'height'] as const) {
        expect(source, `${platform} sizes its icon's ${side} by hand`).toContain(
          `${side}={TAB_ICON_SIZE}`,
        );
      }
      expect(source, `${platform} draws its icon as text`).not.toMatch(/fontSize|text\.s\d/);
    }
  });

  it('is one mark, not a second name for the reader to arrow past', () => {
    // The label beside it says what the tab is. A drawing that announces itself is the same
    // state read twice, which is the collision `row.ts` records for a listing row.
    expect(RENDERERS.web).toContain('aria-hidden="true"');
    expect(RENDERERS.phone).toContain('accessibilityElementsHidden');
  })
});
