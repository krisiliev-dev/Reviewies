import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '@reviewies/core/test/source';
import { ROW, ROW_INK } from '@reviewies/core/ui/row';
import { border, color, size } from '@reviewies/core/tokens';

/**
 * The listing row, held to the rule that is not a style rule.
 *
 * A row is not one control. It exposes at most one navigation target and one action, and
 * every name carries what tells that row from its neighbours. `calendar.tsx` was the row
 * the design doc named as still getting this wrong — the whole entry a single `Pressable`
 * labelled `Open {name}`, so the episode code and name were announced twice or not at all.
 */
const ROOT = resolve(import.meta.dirname, '../../..');
const read = (path: string) => stripComments(readFileSync(resolve(ROOT, path), 'utf8'));

const RENDERERS = {
  phone: read('mobile/src/ui/Row.tsx'),
  web: read('app/src/ui/Row.tsx'),
};
const BOTH = Object.entries(RENDERERS);

/** The call sites migrated so far. Each one that lands joins this list. */
const MIGRATED = {
  'mobile/app/calendar.tsx': 'phone',
  'app/src/screens/Calendar.tsx': 'web',
  'mobile/app/(tabs)/watchlist.tsx': 'phone',
  'app/src/screens/Watchlist.tsx': 'web',
} as const;

describe('the listing row', () => {
  it('reads two renderers and one table', () => {
    for (const [platform, source] of BOTH) expect(source.length, platform).toBeGreaterThan(1500);
    expect(ROW.rule).toBe(border.hairline);
    expect(ROW.minHeight.index).toBe(size.target);
  });

  it('is a rule and a bleed, not a rounded fill with a gutter', () => {
    /*
     * The direction's objection, and the site it was written for: thirty-nine
     * `backgroundColor` declarations that exist to separate one row from the next, which
     * is what a one-point rule is for. A migrated screen that keeps its own card is a
     * screen that did not migrate.
     */
    expect(RENDERERS.phone).toContain('borderBottomWidth: ROW.rule');
    expect(RENDERERS.phone).toContain("backgroundColor: 'transparent'");
    expect(RENDERERS.web).toContain('border-b border-b-stroke-hairline bg-transparent');
  });

  it('is what the migrated screens use, rather than one they built themselves', () => {
    /*
     * Named for what it measures. The first version of this looked for
     * `backgroundColor: theme.groundRaised` anywhere in a migrated file and reported the
     * calendar's *notification panel* — a card that is a card, on a screen that also has
     * rows. "No card fill on this screen" is not the rule; "these screens no longer build
     * their own rows" is, and a poster wrapped in a link the screen owns is what building
     * one looks like.
     */
    for (const [path, platform] of Object.entries(MIGRATED)) {
      const source = read(path);
      expect(source, `${path} does not use the component`).toMatch(/<(Base)?Row\b/);
      const own = platform === 'phone' ? /<Pressable[^>]*>\s*<Poster/ : /<Link[^>]*>\s*<Poster/;
      expect(own.test(source), `${path} still wraps its own poster in its own target`).toBe(
        false,
      );
    }
  });

  it('goes nowhere unless it says where', () => {
    /*
     * `open.name` is required in the contract, so a target with no name is a compile
     * error rather than a screen reader saying "button". And the renderer is only
     * pressable when `open` is given: a card that navigates without announcing it is
     * worse than a card that does not navigate.
     */
    expect(read('core/src/ui/row.ts')).toMatch(/interface RowOpen \{\s*name: string;\s*\}/);
    expect(RENDERERS.phone).toContain('accessibilityLabel={open.name}');
    expect(RENDERERS.web).toContain('aria-label={open.name}');
    for (const [platform, source] of BOTH) {
      expect(source, `${platform} presses without an open`).toMatch(/\{open \?/);
    }
  });

  it('keeps the target one control, with the rest outside it', () => {
    /*
     * The §6.96 collision, encoded: the poster and the words were separate links to the
     * same route under the same name on two screens. One target wraps both, and
     * `trailing`/`under` sit outside it — a control inside a control is unreachable by a
     * screen reader and ambiguous to everything else.
     */
    /*
     * Read the target elements, not a window around them. The first version of this
     * sliced from `{open ?` to the first `{trailing}` — so the plant that moved
     * `{trailing}` *inside* the link became the slice's own end marker, the window
     * collapsed to nothing, and the check passed on the defect it was written for. A
     * check whose window is defined by the token it is hunting for finds nothing.
     *
     * What the target renders is exactly `{inside}`. That is the claim, so that is the
     * assertion.
     */
    /**
     * The children of one JSX element, found by walking rather than by regex.
     *
     * `[^>]*>` stopped inside `style={({ pressed }) => [...]}`, because an arrow function
     * in a prop contains a `>`. Tracking brace depth is what tells an attribute's `>`
     * from the tag's own.
     */
    const childrenOf = (source: string, tag: string): string[] => {
      const out: string[] = [];
      for (let at = source.indexOf(`<${tag}`); at !== -1; at = source.indexOf(`<${tag}`, at + 1)) {
        let depth = 0;
        let i = at;
        for (; i < source.length; i++) {
          if (source[i] === '{') depth++;
          else if (source[i] === '}') depth--;
          else if (source[i] === '>' && depth === 0) break;
        }
        if (source[i - 1] === '/') continue; // self-closing: no children to read
        const close = source.indexOf(`</${tag}>`, i);
        if (close !== -1) out.push(source.slice(i + 1, close));
      }
      return out;
    };

    for (const [platform, source] of BOTH) {
      const targets = ['Link', 'Pressable', 'button'].flatMap((tag) => childrenOf(source, tag));
      expect(targets.length, `${platform}: no target found to check`).toBeGreaterThan(0);
      for (const body of targets) {
        expect(body.trim(), `${platform}: a target rendering more than the row`).toBe('{inside}');
      }
      expect(source, `${platform} has nowhere to put a group`).toContain('{under}');
    }
  });

  it('steps the ink rather than fading it, and reads on the ground', () => {
    // The same rule `Button` and `Key` follow: disabled is a step to tertiary, never an
    // opacity, because a faded fill reads as broken rather than as waiting.
    expect(ROW_INK.disabled).toBe('inkTertiary');
    for (const [platform, source] of BOTH) {
      expect(source, `${platform} fades a disabled row`).not.toMatch(/opacity/);
    }
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
      expect(contrast(table[ROW_INK.title], table.ground), `${theme} title`).toBeGreaterThan(4.5);
      expect(contrast(table[ROW_INK.meta], table.ground), `${theme} meta`).toBeGreaterThan(4.5);
      expect(contrast(table[ROW_INK.disabled], table.ground), `${theme} off`).toBeGreaterThan(4.5);
    }
  });

  it('takes the strike from the cross-off rather than drawing its own', () => {
    // `struck` is the *result* of a cross-off and `CrossOff` owns the control — the title
    // page shows struck rows for episodes marked on another device, with no undo window.
    // `crossOff.test.ts` already fails anything that draws a line outside the component;
    // this is the other half, that the row reaches for it.
    expect(RENDERERS.phone).toContain('crossedOff(!!struck)');
    expect(RENDERERS.web).toContain('crossedOffText(!!struck)');
  });
});
