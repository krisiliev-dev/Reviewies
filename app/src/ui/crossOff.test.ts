import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { stripComments } from '@reviewies/core/test/source';
import { RING, STRUCK, UNDO_MS } from '@reviewies/core/ui/crossOff';
import { border, color, linger, size } from '@reviewies/core/tokens';

/**
 * The control the whole product turns on, held to three things it must not become.
 *
 * It is the most-repeated action in the app — the reason somebody opens it on a weeknight
 * — and it was three different controls: a `watched` pill with an undo banner two hundred
 * points away, a `mark` pill announcing `checked` through a `button` role, and the web's
 * own pair. This is what stops it drifting back into any of them.
 */
const ROOT = resolve(import.meta.dirname, '../../..');

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.expo') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, out);
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

const PHONE = ['mobile/app', 'mobile/src'].flatMap((t) => sources(resolve(ROOT, t)));
const WEB = sources(resolve(ROOT, 'app/src'));
const read = (path: string) => stripComments(readFileSync(path, 'utf8'));

/**
 * Both renderers, together, in every clause that is about the control rather than about a
 * platform's syntax. A rule proved on one side only is a rule the other side drifts off.
 */
const RENDERERS = {
  phone: read(resolve(ROOT, 'mobile/src/ui/CrossOff.tsx')),
  web: read(resolve(ROOT, 'app/src/ui/CrossOff.tsx')),
};
const RENDERER = RENDERERS.phone;
const BOTH = Object.entries(RENDERERS);

describe('the cross-off', () => {
  it('reads two renderers and a table rather than nothing', () => {
    for (const [platform, source] of BOTH) {
      expect(source.length, platform).toBeGreaterThan(1000);
    }
    expect(RING.size).toBe(size.target);
    expect(RING.stroke).toBe(border.icon);
  });

  it('is a checkbox, and nothing else claims to be checked', () => {
    /*
     * `title/[id].tsx` put `checked` on `accessibilityRole="button"` — a state announced
     * through a role with no way to carry it. An open circle you fill is exactly what a
     * checkbox is, and only one control in this app is one.
     */
    expect(RENDERERS.phone).toContain('accessibilityRole="checkbox"');
    // The web's rows said `aria-pressed`, which announces a toggle button rather than a
    // thing that is or is not done.
    expect(RENDERERS.web).toContain('role="checkbox"');
    expect(RENDERERS.web).toContain('aria-checked={watched}');
    expect(RENDERERS.web, 'a toggle button pretending to be a checkbox').not.toContain(
      'aria-pressed',
    );
    const off: string[] = [];
    for (const path of PHONE) {
      if (path.endsWith('CrossOff.tsx')) continue;
      for (const element of read(path).split('<Pressable').slice(1)) {
        const head = element.slice(0, element.indexOf('>'));
        if (/accessibilityRole="button"/.test(head) && /checked:/.test(head)) {
          off.push(relative(ROOT, path));
        }
      }
    }
    expect(off, 'a state a button role cannot announce').toEqual([]);
  });

  it('never waits for anything', () => {
    /*
     * `markWatched` writes to SQLite and the change listener re-runs the query. A spinner
     * here would claim the app is asking somebody's permission, which is the opposite of
     * what local-first means — `index.tsx` has said so in a comment since it shipped.
     *
     * Checked in the renderer rather than only written in the contract, because a comment
     * is not a constraint (§6.72).
     */
    for (const [platform, source] of BOTH) {
      expect(source, platform).not.toMatch(/ActivityIndicator|busy|Spinner|await /);
    }
  });

  it('carries the mark on three channels, not one', () => {
    // A line through text is invisible to a screen reader and hard to see at a glance on
    // a moving bus. The ring's fill, the tick, and the row's ink step each say it alone.
    expect(STRUCK.text.off).toBe('ink');
    expect(STRUCK.text.on).toBe('inkSecondary');
    expect(RING.fill).toBe('workingFill');
    for (const [platform, source] of BOTH) expect(source, platform).toContain('✓');

    /*
     * And the ink step is spelled once, in the component, rather than at each row. Both
     * renderers export the function that returns it, so a row that wanted a different
     * pair would have to go past the component to get one.
     */
    expect(RENDERERS.web).toContain('export const crossedOffText');
    expect(RENDERERS.web).toContain('text-ink-secondary line-through decoration-mark-cross-off');
    expect(RENDERERS.phone).toContain('export const crossedOff');
    expect(RENDERERS.phone).toContain('theme[STRUCK.text.on]');
    expect(RENDERERS.phone).toContain('theme[STRUCK.pen]');

    // And nothing else draws the line. Exporting the pair is only half of it — a row that
    // spells out its own is a row free to pick a different colour, which is how three
    // controls became three different controls in the first place.
    const elsewhere = [...PHONE, ...WEB]
      .filter((path) => !/ui[/\\]CrossOff\.tsx$/.test(path))
      .filter((path) => /line-through/.test(read(path)))
      .map((path) => relative(ROOT, path));
    expect(elsewhere, 'a strike drawn outside the component').toEqual([]);
  });

  it('gives the undo window the same six seconds as the banner it replaces', () => {
    // From the table, so moving the control did not quietly move the deadline.
    expect(UNDO_MS).toBe(linger.undo);
    for (const [platform, source] of BOTH) expect(source, platform).toContain('UNDO_MS');
  });

  it('keeps the ring on screen while the undo is offered', () => {
    /*
     * The first version of this swapped the ring for the undo chip in the same slot, and
     * it cost the two things the mark is for. The filled ring is the confirmation you
     * just earned, and hiding it for six seconds to show the way out is backwards; and
     * on the web, unmounting the button somebody just activated drops focus to the body,
     * so a keyboard user is returned to the top of the page as a reward for marking an
     * episode. The chip is a sibling of the ring, never a replacement for it.
     */
    for (const [platform, source] of BOTH) {
      expect(source, `${platform}: the undo replaces the ring rather than joining it`)
        .not.toMatch(/if \(undoable/);
      expect(source, `${platform}: no undo in the ring's slot at all`).toMatch(
        /undoable && onUndo \?/,
      );
    }
  });

  it('fills the ring in something legible on it', () => {
    const luminance = (hex: string) => {
      const v = hex.replace('#', '');
      const ch = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
      const lin = ch.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    };
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const theme of ['dark', 'light'] as const) {
      const table = color[theme];
      // The tick sits on the fill; the unaired ring sits on whatever ground it lands on.
      expect(contrast(table[RING.tick], table[RING.fill]), `${theme} tick`).toBeGreaterThan(4.5);
    }
  });
});
