import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { stripComments } from '@reviewies/core/test/source';
import {
  CHEVRON_PATH,
  CHEVRON_TURN,
  MARK_BOX,
  TICK_PATH,
  disclosure,
} from '@reviewies/core/ui/mark';

/**
 * The small marks a control draws, and the sweep that says nothing is still typed.
 *
 * This clause set lived in `tabIcon.test.ts` for one sprint, which is how §6.140's file
 * came to hold a product-wide sweep under a name about the tab bar — the §6.139 shape
 * appearing in a file written to close §6.139. Split in §6.144: the tab bar's own table is
 * still guarded there, and everything about marks in general is here.
 */
const ROOT = resolve(import.meta.dirname, '../../..');

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
  phone: stripComments(readFileSync(resolve(ROOT, 'mobile/src/ui/Mark.tsx'), 'utf8')),
  web: stripComments(readFileSync(resolve(ROOT, 'app/src/ui/Mark.tsx'), 'utf8')),
};

describe('the marks a control draws', () => {
  it('is one chevron and a rotation, not four drawings', () => {
    /*
     * The decision the file exists for. Four chevron glyphs are four things to keep in
     * step; one path and a turn is none, and it is what let the remote drawer's handle and
     * a list's disclosure stop being separate questions.
     */
    expect(CHEVRON_PATH).toMatch(/^M[\d.]/);
    expect(Object.keys(CHEVRON_TURN).sort()).toEqual(['down', 'left', 'right', 'up']);
    expect(new Set(Object.values(CHEVRON_TURN)).size, 'two directions share a turn').toBe(4);
    for (const [, source] of Object.entries(RENDERERS)) {
      expect(source).toContain('CHEVRON_TURN[points]');
      expect(source).toContain('CHEVRON_PATH');
    }
  });

  it('points one way for open and the other for shut, on both platforms', () => {
    /*
     * The two platforms had run **opposite conventions** and neither was wrong alone: the
     * web's collapsed chevron pointed down and its expanded one up; the phone's collapsed
     * pointed right and its expanded down. §6.144 settled on the web's — collapsed points
     * at what is below, expanded points back at what you came from, which reads as a hinge
     * rather than a signpost.
     *
     * Held here rather than at the call sites, because a call site that spells the
     * direction out is a call site free to spell it out differently. A plant reversing
     * `disclosure` found nothing until this clause existed.
     */
    expect(disclosure(false)).toBe('down');
    expect(disclosure(true)).toBe('up');
    expect(disclosure(true), 'a disclosure that does not move is not a disclosure').not.toBe(
      disclosure(false),
    );

    for (const path of ['app/src/screens/Lists.tsx', 'mobile/app/lists.tsx']) {
      const source = stripComments(readFileSync(resolve(ROOT, path), 'utf8'));
      expect(source, `${path} decides which way its chevron points`).toContain('disclosure(');
      expect(source, `${path} names a direction by hand`).not.toMatch(
        /points=(?:"|\{')(?:up|down|left|right)/,
      );
    }
  });

  it('draws every path inside the box the table declares', () => {
    // A path drawn for a different viewBox is a mark at the wrong scale beside a right one.
    for (const [name, path] of [['chevron', CHEVRON_PATH], ['tick', TICK_PATH]] as const) {
      const numbers = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
      expect(numbers.length, `${name} has no coordinates`).toBeGreaterThan(3);
      for (const value of numbers) {
        expect(Math.abs(value), `${name} leaves the ${MARK_BOX} box`).toBeLessThanOrEqual(MARK_BOX);
      }
    }
    for (const [platform, source] of Object.entries(RENDERERS)) {
      expect(source, `${platform} writes its own viewBox`).toContain('MARK_BOX');
    }
  });

  it('strokes its marks rather than filling them', () => {
    /*
     * A chevron and a tick *are* strokes. A filled outline of a stroke loses its weight
     * when the mark is scaled, and the tick sits inside a filled disc where weight is the
     * whole of what makes it legible — `crossOff.test.ts` measures the colour it is drawn
     * in and cannot see a shape.
     */
    /*
     * **Every** path, counted — not `toContain('fill="none"')`, which is what this said
     * first and which a plant walked straight through: filling the chevron left the tick's
     * `fill="none"` in the file, so the string was present and one of the two marks was a
     * blob. §6.143 caught the identical shape in `TAB_ICON_SIZE` one sprint ago, and it
     * came back the same hour it was written down.
     */
    for (const [platform, source] of Object.entries(RENDERERS)) {
      const paths = source.match(/<[Pp]ath\b/g) ?? [];
      expect(paths.length, `${platform} draws no paths`).toBe(2);
      expect(
        (source.match(/fill="none"/g) ?? []).length,
        `${platform} fills a stroke`,
      ).toBe(paths.length);
      expect(
        (source.match(/strokeWidth=/g) ?? []).length,
        `${platform} leaves a stroke without a weight`,
      ).toBe(paths.length);
      expect(
        (source.match(/strokeLinecap="round"/g) ?? []).length,
        `${platform} leaves an end square`,
      ).toBe(paths.length);
    }
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
    /*
     * Where the range stops, stated — because a sweep whose boundary nobody has written
     * down is §6.139's shape waiting to happen, and this one had a hole in it.
     *
     * `›` (U+203A, General Punctuation) was the phone's collapsed list chevron and sat
     * **outside** every block below, so the sweep that found five typed marks walked past
     * the sixth. General Punctuation is in now, minus the parts that are ordinary
     * typography: quotes, dashes and ellipsis are text, not a control's drawing.
     *
     * What is deliberately *not* here: Latin, Greek and the letterlike symbols. A build
     * that bans `×` bans multiplication signs in prose, and this clause is about marks a
     * control draws. The boundary is arrows, technical, geometry, dingbats, the
     * supplemental arrows, emoji — and the two guillemets that turned out to be a chevron.
     */
    const MARKS =
      /[\u2039\u203A\u2190-\u21FF\u2300-\u23FF\u25A0-\u27BF\u2B00-\u2BFF\u{1F000}-\u{1FAFF}]/u;
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
     * The queue is empty. §6.143 named six files and said each would fail this clause the
     * day it stopped typing; §6.144 closed all six in one go, because they were one job —
     * a chevron and a tick, in `core/src/ui/mark.ts`, with the drawer's handle and a list's
     * disclosure turning out to be the same drawing at two rotations.
     */
    const EXCUSED = [...CONTENT, ...TYPES_BY_DECISION];

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
