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
    /*
     * The web's square too. §6.182: the clause is named for both platforms and checked one.
     * The web's squareness is `aspect-square` in `CELL`, which nothing touched, so deleting
     * it left `PAD.ratio` at 1, `grid-cols-4` present, and web pad cells whatever height
     * their content happened to want.
     */
    expect(PAD.ratio, 'a ratio that is not 1 cannot be spelled `aspect-square`').toBe(1);
    expect(WEB, 'the web cell is not square').toContain('aspect-square');
    expect(PHONE, 'the phone cell is not square').toContain('aspectRatio: PAD.ratio');
    /*
     * There was a `toContain('gap: PAD.gap')` here, and it was the whole of what this file
     * read about the phone's grid. It passed for as long as the pad has existed beside a
     * hand-typed `width: '23%'` that wrapped to three across on a 320pt phone. The width
     * and the gap are bound to the table in the clause below, which is where the count
     * this clause names actually has to land.
     */
  });

  it('fills the row on the narrowest phone the table reasons about', () => {
    /*
     * `core/src/ui/padCell.ts` says why the count is four: *"the widest grid whose cell
     * still clears the 44pt comfortable-target floor on the narrowest phone this app
     * supports (320pt less a 12pt gutter each side and three 8pt gaps leaves 68pt)"*, and
     * *"the pad is tapped in the dark; scrolling to reach 'Popcorn' is the failure this
     * avoids"*. Nothing checked either sentence, and the phone had not held them: 23% of
     * the 296pt row a 320pt phone gives is 68.08, so four cells and three gaps come to
     * 296.32 — a third of a point over, and the fourth wraps. Measured in the export at
     * 320 before the repair: three cells to a row, seven rows of three where the design
     * is five of four, and the last of them reachable only by scrolling.
     * At 390 it did not wrap (84.17 where the row allows 85.5, 5.3pt of slack the web
     * does not have), and 390 is the width every design pass and both smoke suites use —
     * which is how a pad that wraps on the phone it was sized for was photographed twice
     * and read as correct.
     *
     * A percentage cannot pay for a gap — Yoga and CSS both lay `gap` out *beside* the
     * basis — so any percentage that fits at 390 overflows at some narrower width. The
     * phone puts half a gap inside each column and takes it back at the row's own edges,
     * which makes a column exactly `100 / PAD.columns` percent. Measured after the repair,
     * both exports, both widths: four to a row, plates 68.0pt at 320 and 85.5 at 390 — the
     * phone and the web to the point, where they used to agree on one device by luck.
     */
    const NARROW = 320;
    const gutter = Number(/pad: \{ padding: (\d+) \}/.exec(PHONE_SCREEN)?.[1]);
    expect(gutter, 'the watching screen no longer states the pad gutter here').toBeGreaterThan(0);
    const cell = (NARROW - gutter * 2 - PAD.gap * (PAD.columns - 1)) / PAD.columns;
    expect(cell, 'four across no longer clears the 44pt target on a 320pt phone')
      .toBeGreaterThanOrEqual(44);
    // The number the core's own prose states. 68pt, measured in the export at 320.
    expect(cell, 'the core says four across leaves 68pt at 320 and it no longer does')
      .toBe(68);

    /*
     * `stripComments`, because the renderer's header quotes the `23%` it replaced — the
     * needle-in-a-comment trap the clause above this one already pays for once.
     */
    const phone = stripComments(PHONE);
    /*
     * The defect itself, at any value: a width typed rather than derived. `'100%'` is
     * exempt and is the plate's — filling the column it was given says nothing about how
     * many columns there are, which is the number that has to come from the table.
     */
    expect(phone, 'the phone types a cell width instead of deriving one')
      .not.toMatch(/width: '(?!100%)[\d.]+%'/);
    expect(phone, 'the phone column is not `100 / PAD.columns` percent')
      .toContain('width: `${100 / PAD.columns}%`');
    expect(phone, 'the column does not carry half of PAD.gap')
      .toContain('padding: PAD.gap / 2');
    expect(phone, 'the row does not take the outer half of PAD.gap back')
      .toContain('margin: -PAD.gap / 2');
    /*
     * And the row must not spend the gap a second time. Four columns of a quarter fill it
     * already, so a `gap` on the row is `23%` again with different arithmetic — and it is
     * the plant that satisfies every clause above while wrapping to three at 320.
     */
    /*
     * A style block is read to the last brace on its line, not to the first: `[^}]*` gave
     * up inside `${100 / PAD.columns}` and left the column's own checks below matching an
     * empty string, which passed a planted `marginRight: PAD.gap` that wraps 320 to three.
     */
    const block = (name: string) => new RegExp(`${name}: \\{.*\\}`).exec(phone)?.[0] ?? '';
    const grid = block('grid');
    // `wrap` written out rather than merely present: `flexWrap: 'nowrap'` satisfied a
    // `toContain('flexWrap')` and put all twenty columns on one line, because React
    // Native's `flexShrink` is 0 by default and nothing would have shrunk them.
    expect(grid, 'the phone has no wrapping row to put the columns in')
      .toContain("flexWrap: 'wrap'");
    // Case-insensitively, because `columnGap: PAD.gap` is the same defect spelled to walk
    // past a check for `gap:` — it was the first plant tried against this clause.
    expect(grid, 'the row spends a gap the columns have already paid for')
      .not.toMatch(/gap:/i);
    // And the column may not add spacing beside the half-gap it already carries, which is
    // the same overflow one level down: `marginRight: PAD.gap` wraps 320 to three again.
    const slot = block('slot');
    expect(slot, 'the column has no width to fill').toContain('width');
    expect(slot, 'the column adds spacing beside the half-gap it carries')
      .not.toMatch(/margin/i);
    /*
     * And the plate takes its width from the column rather than from a number of its own.
     * `minWidth: 90` on the plate is the plant that survived the first version of this
     * clause: four to a row, because the columns still fill it — and measured at 320, four
     * 90pt plates in 76pt columns, overlapping by 14 and the last one 22pt past the screen.
     * The clause is named for the row, so it has to hold the drawing as well as the count.
     */
    const plate = /cell: \{[\s\S]*?\n  \},/.exec(phone)?.[0] ?? '';
    expect(plate, 'the phone has no plate style to read').toContain('aspectRatio');
    expect(plate, 'the plate is sized by a number of its own rather than by its column')
      .not.toMatch(/minWidth|maxWidth/i);
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
