import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '@reviewies/core/test/source';
import { PAD, padLive, padName } from '@reviewies/core/ui/padCell';
import { SURFACE_OFF } from '@reviewies/core/ui/surface';
import { radius, space, text } from '@reviewies/core/tokens';

/**
 * The emoji pad — the last of the three surfaces `accentFill.test.ts` named as having no
 * component, and the only one on the screen this product exists for.
 *
 * That comment has stood since §6.99: *"the remainder are surfaces with no component yet:
 * Watching Mode's emoji pad, the remote's device list, `data.tsx`'s switch row. A
 * component has to exist before a guard can point at it."* Nothing had photographed the
 * pad, so nothing had made the case for building it. §6.130 photographed it, and the
 * photograph found a disagreement rather than an untidiness.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

const WEB = read('app/src/ui/PadCell.tsx');
const PHONE = read('mobile/src/ui/PadCell.tsx');
const WEB_SCREEN = read('app/src/screens/WatchingMode.tsx');
const PHONE_SCREEN = read('mobile/app/watching/[targetId].tsx');

describe('a pad cell', () => {
  it('is inert until there is a clock to attach a moment to', () => {
    /*
     * The disagreement the photograph found. A reaction is stored as `tMs`, replayed to
     * other people at that offset and cross-validated by content there — so a tap before
     * the clock starts writes a real row at 0 and contributes a false moment to everyone
     * else's stream. The web disabled the cells; the phone left twenty of them live above
     * an unpressed "Start watching".
     */
    expect(padLive(false)).toBe(false);
    expect(padLive(true)).toBe(true);

    for (const [name, source] of [['web', WEB_SCREEN], ['phone', PHONE_SCREEN]] as const) {
      expect(source, `${name} does not ask whether the pad is live`).toContain('padLive(');
      expect(source, `${name} does not pass it to the cells`).toMatch(/disabled=\{!padReady\}/);
    }
  });

  it('is off exactly while the screen is explaining how to start', () => {
    /*
     * §6.104's rule — a thing that is off should say why — held where it actually lands.
     * The pad does not carry its own sentence; the start block does, and this asserts the
     * two are gated by the *same* condition, so the explanation cannot go away while the
     * cells stay dark.
     *
     * A first version had the component return the reason as copy and each screen print
     * it. `22-watching-start` showed three sentences about starting stacked on one screen,
     * and the third pushed the pad's last row under the search box — which costs the
     * screen the property it is built around.
     */
    for (const [name, source] of [['web', WEB_SCREEN], ['phone', PHONE_SCREEN]] as const) {
      const started = /clock\.running \|\| clock\.positionMs > 0/;
      expect(source, `${name} derives the pad's state from something else`).toMatch(started);
      // The start block is gated on the negation of the same two facts.
      expect(source, `${name} has no start block gated on the same condition`)
        .toMatch(/!clock\.running && clock\.positionMs === 0/);
    }
  });

  it('does not fade, on either platform', () => {
    /*
     * The web drew off as `disabled:opacity-30` — twenty cells at 30%, which reads as a
     * failed render rather than as a pad waiting. `appearance.test.ts` bans the fade on a
     * filled control and this is the same argument at twenty times the area.
     */
    for (const [name, source] of [['web', WEB], ['phone', PHONE]] as const) {
      /*
       * `stripComments`, because both renderers *name* the fade they replaced in their own
       * header. The first version of this read the raw file and failed on the web for the
       * words explaining why the web does not do it — the needle-in-a-comment trap §6.118
       * caught in `poster.test.ts`, walked into again by a clause written to catch a
       * class of mistake.
       */
      expect(stripComments(source), `${name} fades a disabled cell`).not.toMatch(/opacity/i);
    }

    /*
     * The phone reads the constant; the web writes the classes out and is checked against
     * it. That asymmetry is not sloppiness, it is Tailwind: the scanner reads source text,
     * so a class assembled from `SURFACE_OFF.colour` is never compiled. `Key.tsx` has the
     * same split for the same reason. Deriving the kebab spelling here rather than typing
     * it means changing the token fails this clause instead of silently leaving the web
     * drawing the old one.
     */
    /*
     * The three uses, named. `toContain('SURFACE_OFF')` passed on the import line alone —
     * a clause satisfied by a file merely mentioning the thing, which is what
     * `clauses.test.ts` exists to catch and did.
     */
    expect(PHONE, 'the phone rule is not the shared one')
      .toMatch(/borderWidth: SURFACE_OFF\.rule/);
    expect(PHONE, 'the phone rule colour is not the shared one')
      .toMatch(/borderColor: theme\[SURFACE_OFF\.colour\]/);
    expect(PHONE, 'the phone off-ink is not the shared one')
      .toMatch(/color: theme\[SURFACE_OFF\.ink\]/);
    const kebab = (token: string) => token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    expect(WEB, 'the web rule disagrees with SURFACE_OFF.colour')
      .toContain(`border-${kebab(SURFACE_OFF.colour)}`);
    expect(WEB, 'the web ink disagrees with SURFACE_OFF.ink')
      .toContain(`text-${kebab(SURFACE_OFF.ink)}`);
  });

  /*
   * Not repeated here: that `SURFACE_OFF.ink` clears 4.5:1 on both grounds. `key.test.ts`
   * already asserts exactly that, and it is a property of the constant rather than of
   * either component — a second copy would hold its own number while proving nothing new,
   * which is §6.73's shape.
   */

  it('is four across and square, and neither platform says so twice', () => {
    expect(PAD.columns).toBe(4);
    expect(PAD.ratio).toBe(1);
    expect(PAD.gap).toBe(space.s8);
    expect(PAD.radius).toBe(radius.plate);
    expect(PAD.glyph).toBe(text.s30);
    // Tailwind's scanner reads source text, so the web writes `grid-cols-4` out; the
    // check is that the written class and the token agree rather than that the class is
    // derived. A `grid-cols-3` with `PAD.columns` still 4 fails here.
    expect(WEB, 'the web grid disagrees with PAD.columns').toContain(`grid-cols-${PAD.columns}`);
    expect(PHONE, 'the phone cell is not square').toContain('aspectRatio: PAD.ratio');
    // 23% four times plus three gaps is the four-across the token describes; a bare
    // number here would be the fifth place this count lives.
    expect(PHONE).toContain('gap: PAD.gap');
  });

  it('is announced by what it does, not by the glyph', () => {
    expect(padName('Funny')).toBe('React with funny');
    for (const [name, source] of [['web', WEB], ['phone', PHONE]] as const) {
      expect(source, `${name} writes the name itself`).toContain('padName(label)');
      // Read aloud the emoji is its Unicode name — "face with tears of joy" — followed by
      // the label, which announces one control twice under two names.
      expect(source, `${name} leaves the glyph in the reading order`).toMatch(/aria-hidden/);
    }
  });

  it('leaves no hand-drawn pad behind on either screen', () => {
    for (const [name, source] of [['web', WEB_SCREEN], ['phone', PHONE_SCREEN]] as const) {
      expect(source, `${name} still has its own pad styles`).not.toMatch(/padButton|padGrid|padEmoji|padLabel/);
      expect(source, `${name} does not use the component`).toContain('<PadCell');
    }
  });
});
