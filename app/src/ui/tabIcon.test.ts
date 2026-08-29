import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
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

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist', '.expo'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(path, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

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
  });

  it('leaves no control anywhere typing a mark, outside the one table that means to', () => {
    /*
     * The clause §6.139 renamed to a product-wide claim, finally reading the product.
     *
     * It was named "draws its icons rather than typing them" over a body that read one
     * file; §6.139 caught that and renamed it to what it proved; §6.140 closed the tab bar
     * and made the name honest again — **for tab bars**. It still swept nothing else, and
     * `StarRating` was typing `★`, `☆` and `⯪` the whole time, sixty of them down one
     * screen, with the two platforms drawing three of the four states differently. §6.143.
     *
     * So this sweeps both trees for a mark in a rendered string. `key.ts` is the one place
     * that types marks **by decision** — a remote fascia's legends are conventional
     * characters, and `key.test.ts` guards them against emoji-presentation ranges and
     * against each surface keeping its own table. That is an exemption with a guard behind
     * it, which is the only kind worth having.
     */
    const MARKS = /[\u2190-\u21FF\u2300-\u23FF\u25A0-\u27BF\u2B00-\u2BFF\u{1F000}-\u{1FAFF}]/u;
    /*
     * Escapes decoded before scanning, because a plant walked straight through the first
     * version: `<Text>{'\\u2606'}</Text>` is a star on the screen and six ASCII characters
     * in the file, so a regex over source text saw nothing. §6.139's lesson landing on a
     * guard written the same hour — again — and the plant is the only thing that finds it.
     */
    const decode = (text: string) =>
      text
        .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
    /*
     * Two lists, and the difference between them is the whole rule.
     *
     * **Content** is a mark the person put there or chose: Watching Mode's reactions, the
     * `📷` standing in for a comment that is only a picture. A font substituting one of
     * those is the same as a font substituting a letter — it is their text, not our
     * drawing.
     *
     * `core/src/ui/padCell.ts` was on this list for a minute and the staleness check below
     * threw it straight off: the pad's *emoji* live in `emoji.ts` and `padCell.ts` decides
     * the grid. An exemption for a file that does not do the thing is an exemption that
     * will outlive any reason for it, which is exactly what the check is for.
     */
    const CONTENT = ['core/src/watching/emoji.ts', 'core/src/social/comments.ts'];
    /*
     * **A control's mark drawn by decision**, which is one file: the remote fascia, whose
     * legends are conventional characters and which `key.test.ts` holds to one table for
     * both platforms and against emoji-presentation ranges. That is an exemption with a
     * guard behind it, which is the only kind worth having.
     */
    const TYPES_BY_DECISION = ['core/src/ui/key.ts'];
    /*
     * And the ones still to do, each named and each failing this clause the day it stops
     * typing — the shape §6.139 wrote down and §6.140 closed on cue. They are the tab bar's
     * defect in three more controls, and every one has the two platforms disagreeing:
     *
     * - the remote drawer's handle is `⇤` on the web and `⌇` on the phone — **unrelated
     *   characters for one control** (#180);
     * - a list's expand chevron is `▴`/`▾` here and `⌄` there (#181);
     * - `CrossOff`'s tick is `✓` on both, which agrees and is still a glyph (#182).
     */
    const OUTSTANDING = [
      'app/src/remote/RemoteDrawer.tsx',
      'mobile/src/devices/RemoteDrawer.tsx',
      'app/src/screens/Lists.tsx',
      'mobile/app/lists.tsx',
      'app/src/ui/CrossOff.tsx',
      'mobile/src/ui/CrossOff.tsx',
    ];
    const EXCUSED = [...CONTENT, ...TYPES_BY_DECISION, ...OUTSTANDING];

    const offenders: string[] = [];
    let read = 0;
    for (const dir of ['app/src', 'mobile/src', 'mobile/app', 'core/src']) {
      for (const file of filesUnder(dir)) {
        if (EXCUSED.includes(file) || file.includes('.test.')) continue;
        read++;
        const source = decode(stripComments(readFileSync(resolve(ROOT, file), 'utf8')));
        // A mark inside a JSX text node or a quoted string the renderer prints.
        for (const [match] of source.matchAll(/>[^<>{}]*|'[^']*'|`[^`]*`/g)) {
          if (MARKS.test(match)) offenders.push(`${file}: ${match.trim().slice(0, 40)}`);
        }
      }
    }
    expect(read, 'no source was scanned, so this proved nothing').toBeGreaterThan(50);
    expect(offenders).toEqual([]);

    /*
     * Every exemption still describes a file that types something, or it is stale. The
     * outstanding six fail here the moment one of them is fixed, which is what makes the
     * list a queue rather than a permission.
     */
    for (const file of EXCUSED) {
      expect(
        MARKS.test(decode(readFileSync(resolve(ROOT, file), 'utf8'))),
        `${file} no longer types a mark — delete its line from this clause`,
      ).toBe(true);
    }
  });
});
