import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { declarationOf, stripComments } from '@reviewies/core/test/source';
import {
  BOX_RADIUS,
  BUSY,
  boxed,
  LABEL_LINES,
  MIN_WIDTH,
  PRESSED,
  SELECTED,
  SIZE,
  TONE,
} from '@reviewies/core/ui/button';
import { CLAMP } from './clamp';
import { PRESS, PRESS_FILL } from '@reviewies/core/ui/surface';
import { contrast, TEXT_FLOOR } from '@reviewies/core/ui/contrast';
import { CHOSEN } from '@reviewies/core/ui/choice';
import { border, color, radius, size, space, text } from '@reviewies/core/tokens';

/**
 * One table, two renderers, and something that notices when they part.
 *
 * `app/src/ui/Button.tsx` is Tailwind class strings and `mobile/src/ui/Button.tsx` is a
 * `StyleSheet`; they cannot share code, so what they share is `core/src/ui/button.ts`.
 * "These two agree" is otherwise something a person has to notice, which is exactly the
 * failure §6.51 catalogued for words and §6.85 for colour — six of seven values had
 * already drifted by the time anybody compared them.
 */
const ROOT = resolve(import.meta.dirname, '../../..');
const read = (path: string) => stripComments(readFileSync(resolve(ROOT, path), 'utf8'));
const WEB = read('app/src/ui/Button.tsx');
const PHONE = read('mobile/src/ui/Button.tsx');
/** The two call sites whose label is somebody's own text rather than the app's. */
const PICKERS = {
  web: read('app/src/social/AddToList.tsx'),
  phone: read('mobile/src/social/AddToList.tsx'),
};

describe('the button contract', () => {
  it('reads two renderers rather than nothing', () => {
    expect(WEB.length).toBeGreaterThan(1000);
    expect(PHONE.length).toBeGreaterThan(1000);
    expect(Object.keys(TONE)).toEqual(['primary', 'secondary', 'quiet', 'destructive']);
    expect(Object.keys(SIZE)).toEqual(['page', 'row', 'inline']);
  });

  it('names every tone on the web, which cannot look them up', () => {
    /*
     * Asymmetric on purpose, and the asymmetry is a fact about Tailwind rather than a
     * concession. Its scanner reads source text, so a class assembled at runtime is a
     * class that never gets compiled — the web keeps a written-out table and must name
     * every tone in it. The phone reads `TONE[tone]` and so names none of them, which is
     * why the first version of this check reported the correct renderer as broken.
     */
    for (const tone of Object.keys(TONE)) {
      expect(WEB, `web is missing ${tone}`).toContain(tone);
    }
  });

  it('has both renderers consume the whole shape', () => {
    /*
     * What the phone must do instead: read every field. A field added to the table and
     * honoured by one platform is the drift this file exists for, and it is invisible to
     * a name check because the phone's renderer is generic.
     */
    /*
     * `shape.<field>`, not the bare word. §6.182: three of these keys — `fill`, `stroke`,
     * `label` — are also local names in the phone renderer (`const fill =`, `PRESSED.fill`,
     * the `label` prop, `styles.label`, `metrics.label`), so `toContain('label')` was four
     * times true while the renderer read the table for none of them. Replacing `shape.label`
     * with a hardcoded `'ink'` — every tone painting one colour, `destructive` no longer red
     * — kept this green, which is exactly the drift the clause is named for.
     */
    for (const field of Object.keys(TONE.primary)) {
      expect(PHONE, `phone ignores ${field}`).toMatch(new RegExp(`shape\\.${field}\\b`));
    }
    // And both must take their metrics from the table rather than retyping them.
    for (const source of [WEB, PHONE]) {
      expect(source).toMatch(/from '@reviewies\/core\/ui\/button'/);
    }
    expect(PHONE).toContain('SIZE[size]');
  });

  it('gives every tone a label that is legible on its own fill', () => {
    /*
     * Measured, not asserted by name. §6.91 shipped `action.label` — near-black — onto a
     * near-black tab bar, and every name involved was real. The only thing that catches
     * that class of mistake is arithmetic.
     */
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
      for (const [name, shape] of Object.entries(TONE)) {
        // An unfilled tone sits on whatever ground it is dropped on; the tightest of the
        // three is the honest test, not the flattering one.
        const grounds = shape.fill
          ? [table[shape.fill]]
          : [table.ground, table.groundRaised, table.groundWell];
        for (const ground of grounds) {
          const ratio = contrast(table[shape.label], ground);
          expect(ratio, `${theme}/${name}: label on ${ground}`).toBeGreaterThanOrEqual(4.5);
        }
        // Disabled drops the fill, so its label always lands on a ground.
        for (const ground of [table.ground, table.groundRaised, table.groundWell]) {
          const ratio = contrast(table[shape.disabledLabel], ground);
          expect(ratio, `${theme}/${name}: disabled label on ${ground}`).toBeGreaterThan(3);
        }
      }
    }
  });

  it('keeps the box off the reader’s text setting', () => {
    // 44 is a thumb and a thumb is not a font size. `phoneTextScaling.test.ts` exists
    // because the web's floor was once written in rem and doubled with the text.
    expect(SIZE.row.minHeight).toBe(size.target);
    expect(SIZE.page.minHeight).toBeGreaterThanOrEqual(size.target);
    expect(SIZE.inline.minHeight).toBeGreaterThanOrEqual(size.target);
    for (const metrics of Object.values(SIZE)) {
      expect(Number.isInteger(metrics.minHeight)).toBe(true);
    }

    /*
     * And the web half, which this clause was named for and did not have.
     *
     * Everything above is the table talking about itself: `SIZE.row.minHeight` is
     * `size.target` in a file no browser reads. `SIZE_CLASS` wrote `min-h-12` and
     * `min-h-11` twice, and Tailwind's own numeric steps are `rem` — `--spacing` is
     * `0.25rem`, so the compiled rule is `calc(var(--spacing) * 11)`. The three floors this
     * clause proves are absolute were 3rem and 2.75rem in the stylesheet: 48 and 44 at the
     * default text size, 96 and 88 at 200%, and whatever the reader has set otherwise. The
     * paragraph two lines up names that exact mistake and the file it left a suite behind,
     * and it was live in this component the whole time.
     *
     * Derived from the table, not typed: the floors are read back as `--spacing-*` names,
     * which compile to plain pixels. `ui/button#BOX_RADIUS`'s arrangement, because Tailwind
     * cannot be handed a number.
     */
    const nameOf = (px: number) =>
      Object.entries(size).find(([, value]) => value === px)?.[0]
      ?? Object.entries(space).find(([, value]) => value === px)?.[0]
      ?? '?';
    const classes = declarationOf(WEB, 'SIZE_CLASS') ?? '';
    expect(classes, 'the size table has no class list to read').toContain('page:');
    for (const [name, metrics] of Object.entries(SIZE)) {
      const written = new RegExp(`\\b${name}: '([^']*)'`).exec(classes)?.[1];
      expect(written, `${name} has no class string`).toBeTruthy();
      /*
       * The set, not `toContain`. `min-h-target min-h-11` contains the right utility and
       * draws at whichever of the two Tailwind emits last — which is precisely how §6.184's
       * `size-5` sat inert behind `h-[1em]` for a sprint, and how the chevron sweep in
       * `mark.test.ts` was walked through by `text-s16 text-s20`.
       */
      const floors = [...new Set(written?.match(/\bmin-h-[\w.[\]]+/g) ?? [])];
      expect(floors, `${name} does not state exactly one floor`).toEqual([
        `min-h-${nameOf(metrics.minHeight)}`,
      ]);
    }
  });

  it('prints the label at the same size on both platforms', () => {
    /*
     * Found by looking at a screenshot rather than by a check. The web's three sizes
     * carried three text sizes and the phone's renderer had one `fontSize: 15` for all
     * three, so a `size="inline"` control printed at fifteen points on the phone and
     * twelve on the web — and Up Next's two quiet controls under the row came out larger
     * than the row's own meta line and louder than the title beside them.
     *
     * The number is in the table now. The web still writes its class names out for
     * Tailwind's scanner, so this is the seam where the two spellings meet, and it is
     * checked rather than trusted.
     */
    /*
     * The spellings moved in §6.108: `text-base`/`text-sm`/`text-xs` were Tailwind's own
     * steps, and 16/14/12 are three steps of the scale that replaced them. The seam is the
     * same seam — Tailwind reads source text and cannot be handed a number — so the classes
     * are still written out here and still checked against the table rather than trusted.
     * What changed is that the table's values now come from `text` rather than being bare
     * numbers that happened to agree.
     */
    const CLASS = { page: 'text-s16', row: 'text-s14', inline: 'text-s12' } as const;
    const POINTS = { 'text-s16': text.s16, 'text-s14': text.s14, 'text-s12': text.s12 } as const;
    for (const [name, metrics] of Object.entries(SIZE)) {
      const cls = CLASS[name as keyof typeof CLASS];
      expect(WEB, `the web's ${name} size does not print at ${cls}`).toMatch(
        new RegExp(`${name}: '[^']*\\b${cls}\\b`),
      );
      expect(metrics.label, `${name}: the table and ${cls} disagree`).toBe(POINTS[cls]);
    }
    // And the table reads the scale rather than restating it.
    expect(read('core/src/ui/button.ts'), 'a bare number back in the size table').not.toMatch(
      /label: \d+/,
    );
    // And the phone reads it from the table rather than from its own stylesheet.
    expect(PHONE).toContain('fontSize: metrics.label');
    expect(PHONE, 'a font size hard-coded beside the one in the table').not.toMatch(
      /label: \{ fontSize:/,
    );
  });

  it('draws being on, rather than only announcing it', () => {
    /*
     * `selected` was in the contract from the start and both renderers announced it —
     * `aria-pressed` on the web, `accessibilityState.selected` on the phone — and neither
     * drew anything. A control whose state is spoken and not shown looks identical held
     * and unheld, which is how Watching Mode's Hold button worked until the sprint that
     * came to migrate it. Sprint 15 found it by needing somewhere to put twenty-six
     * accent fills, half of which were fills standing in for exactly this.
     *
     * And it is `Choice`'s "on", not a second one. `choice.ts` argues it: a rule and a
     * weight step, never a fill — two channels rather than colour alone, and the app's one
     * filled shape keeps meaning "worth pressing" rather than "already chosen". §6.95 is
     * what two spellings of one state costs.
     */
    expect(SELECTED).toBe(CHOSEN);
    expect(SELECTED.colour).toBe('workingMark');
    expect(SELECTED.label.on).toBe('ink');

    // The phone reads the table. The web writes the classes out, for Tailwind's scanner,
    // so this is the seam and it is checked rather than trusted.
    expect(PHONE).toContain('SELECTED.rule');
    expect(PHONE).toContain('theme[SELECTED.colour]');
    expect(PHONE).toContain('SELECTED.label.on');
    /*
     * `SELECTED_CLASS`, not the file. `toContain('text-ink')` was satisfied four times
     * over by `text-ink-secondary` and `text-ink-tertiary` in the tone table, so this
     * clause passed with the label step deleted from the very constant it names. §6.109.
     */
    const selected = declarationOf(WEB, 'SELECTED_CLASS');
    expect(selected, 'there is no SELECTED_CLASS to read').toBeDefined();
    expect(selected).toContain('border-working-mark');
    expect(selected, 'being on no longer steps the label up').toMatch(/\btext-ink\b/);
    expect(WEB, 'a fill standing in for being on').not.toMatch(
      /SELECTED_CLASS = '[^']*bg-/,
    );

    // And both apply it. A table read into a variable nothing renders is the shape this
    // clause exists to catch.
    expect(WEB).toMatch(/on \? SELECTED_CLASS : ''/);
    expect(PHONE).toMatch(/borderWidth: on \?/);
  });

  it('never fades a disabled action, on either platform', () => {
    /*
     * `appearance.test.ts` bans `disabled:opacity` on a filled action on the web and
     * records why — "a maroon block with dark red lettering: it read as broken rather
     * than as waiting". The phone had eight of these and no guard at all. The rule is in
     * the table now, so both renderers are held to it.
     */
    expect(WEB).not.toMatch(/disabled:opacity/);
    expect(PHONE).not.toMatch(/opacity:\s*0?\.\d/);
    for (const shape of Object.values(TONE)) expect(shape.disabledFill).toBeNull();
  });

  it('feels the same with motion reduced, because press was never motion', () => {
    // A thickening and a ground step at 0ms. No transition, no duration, and therefore
    // no `reduced ? … : …` for `motion.test.ts` to find. §6.59 substitutes rather than
    // removes; this is the case where there is nothing to substitute.
    expect(PRESSED.stroke).toBe(border.mark);
    expect(WEB).not.toMatch(/transition|duration-/);
    expect(PHONE).not.toMatch(/Animated|withTiming|duration/);
  });

  it('keeps the label while busy', () => {
    // Never a spinner in place of the words: a spinner has no text to read, which
    // `account.tsx` worked around with an accessibilityLabel rather than avoided.
    expect(BUSY.underline).toBe(border.mark);
    expect(PHONE).toMatch(/\{label\}/);
    expect(WEB).toMatch(/\{label\}/);
  });

  it('has the web’s literal classes agree with the table it cannot read', () => {
    /*
     * The one place the two renderers genuinely diverge, and it is a fact about Tailwind
     * rather than a concession: its scanner reads source text, so the web writes
     * `rounded-pill` and `active:border-2` as literals where the phone reads `BOX_RADIUS`
     * and `PRESSED`. `coreWiring` reported that as a mobile-only export, correctly.
     *
     * An explanation on its own would be a free pass — §6.59 — so the literals are held
     * to the numbers here. Change `border.mark` to 3 and this fails until the web's
     * `active:border-2` follows.
     */
    expect(BOX_RADIUS).toBe(radius.pill);
    expect(WEB).toContain('rounded-pill');
    expect(WEB).toContain(`active:border-${PRESSED.stroke}`);
    /*
     * From the table, not spelled. This line used to say `active:bg-ground-raised` and it
     * passed for as long as the button rose on press — which was the defect: `groundRaised`
     * is also the card fill, so a button inside a card pressed to the colour behind it. The
     * clause was correct about the class and silent about what the class did.
     *
     * §6.184: that repair reached the web and stopped. The line under this paragraph was
     * `expect(PRESSED.fill).toBe('groundRaised')` — the phone's `Button` read `PRESSED.fill`
     * and nothing else did — so the guard asserted the fix on one platform and the thing the
     * fix replaced on the other, in adjacent lines, with the paragraph explaining the defect
     * sitting directly above the assertion that preserved it. Measured in the export: a held
     * button came back `rgb(28, 25, 30)`, which is `SURFACE.card` exactly, so on the phone a
     * button in a card still pressed to the colour behind it.
     *
     * There is one press now and `PRESSED` has no fill to disagree with.
     *
     * §6.185 split it in two, and the split is not a second convention — `surface.ts` has the
     * argument. A press steps the control's **own surface**. Three tones have no fill and
     * their surface is the ground; `primary` is a plate and its surface is the plate. Held to
     * `PRESS` and `PRESS_FILL` respectively, both derived from the core rather than spelled.
     */
    const utility = (token: string) =>
      `active:bg-${token.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}`;

    const pressTable = declarationOf(WEB, 'PRESS_CLASS') ?? '';
    expect(pressTable, 'PRESS_CLASS is not in the web renderer at all').not.toBe('');

    for (const tone of Object.keys(TONE) as (keyof typeof TONE)[]) {
      const want = utility(TONE[tone].fill ? PRESS_FILL : PRESS);
      expect(pressTable, `${tone} does not press to the step its own surface asks for`).toContain(
        `${tone}: '${want}'`,
      );
    }

    /*
     * And exactly one `active:bg-*` per tone. `toContain` on the record would pass with both
     * spellings present, and Tailwind's emission order would then decide the real colour —
     * which is precisely how §6.184's `size-5` sat inert behind `h-[1em]` for a sprint.
     */
    const pressUtilities = pressTable.match(/active:bg-[\w-]+/g) ?? [];
    expect(pressUtilities, 'a tone names more than one press fill').toHaveLength(
      Object.keys(TONE).length,
    );

    expect(PHONE, 'the phone does not choose its step by whether the tone has a fill')
      .toContain('theme[fill ? PRESS_FILL : PRESS]');
    expect(
      Object.keys(PRESSED),
      'PRESSED carries a fill again, which is a second opinion about which way a press goes',
    ).toEqual(['stroke']);
  });

  it('keeps a pressed label readable, which is the defect the split exists for', () => {
    /*
     * The arithmetic, beside the design pass that measures the rendered thing.
     *
     * `design/capture.mjs` holds each control down and reads the label against the ground the
     * press paints; it reported `Export everything (JSON)` at **1.05:1** and that is what sent
     * §6.185 here. This clause is the cheap half — it runs in every `npm run verify` rather
     * than only in a design pass, and it fails on a *token* change that the harness would only
     * catch the next time somebody photographed the app.
     *
     * Both halves are wanted. A token pair can be fine here and still be drawn wrong by a
     * renderer, which is the whole reason the harness reads a browser.
     */
    for (const theme of ['dark', 'light'] as const) {
      const c = color[theme];
      for (const tone of Object.keys(TONE) as (keyof typeof TONE)[]) {
        const shape = TONE[tone];
        const ground = shape.fill ? c[PRESS_FILL] : c[PRESS];
        expect(
          contrast(c[shape.label], ground),
          `${tone} held in ${theme}: ${shape.label} on ${shape.fill ? PRESS_FILL : PRESS}`,
        ).toBeGreaterThanOrEqual(TEXT_FLOOR);
      }
    }
  });

  it('clamps a label on the words, not on the box', () => {
    /*
     * §6.180, and the shape is §6.179's one component over: **nothing said what the number
     * was**, so the two renderers had drifted and neither was right.
     *
     * The web wrote `className="w-full truncate"` on the `<button>`. Measured in Chromium
     * rather than argued about: on an `inline-flex` box, `truncate` renders
     * byte-identically to `overflow:hidden; white-space:nowrap` with no `text-overflow` at
     * all — the label is a blockified flex item, so the container has no inline content for
     * an ellipsis to trim. A hundred-and-twenty-character list name was cut mid-word with
     * nothing to say it had been. The phone wrote nothing at all, so the same name wrapped
     * and the pill grew to fit it.
     *
     * Which makes the interesting assertion the third one. "The web reads CLAMP" is
     * satisfied by appending the class to `classes` — the exact defect, with the number now
     * coming from the right place. So this reads *where* it lands: on the element that
     * carries `{label}`, and not in the box's class list.
     */
    expect(PHONE, 'the phone ignores the line budget').toContain('numberOfLines={lines}');
    expect(WEB, 'the web does not read the map for its budget').toContain('CLAMP[lines]');

    const classes = declarationOf(WEB, 'classes') ?? '';
    expect(classes.length, 'the web renderer has no class list to read').toBeGreaterThan(100);
    expect(classes, 'the web clamps the box instead of the label').not.toContain('clamp');
    expect(WEB, 'the web clamps nothing that holds the label')
      .toContain('<span className={clamp}>{label}</span>');

    // And the number the core states has to be one the web can actually spell. Tailwind
    // generates the utilities it can see, so a budget outside the map is a blank class.
    expect(Object.keys(CLAMP).map(Number), `${LABEL_LINES} is not in CLAMP`).toContain(LABEL_LINES);
    expect(CLAMP[1], 'the map spells one line as something that is not truncate').toBe('truncate');
  });

  it('is asked for the budget by the two controls that print somebody else’s text', () => {
    /*
     * The non-vacuity half. Every other label in the app is authored and short — `COPY`
     * entries, "Add", "Cancel" — and unset means unlimited on purpose, because a target
     * whose words are clipped at 200% text is a worse defect than a tall pill and is what
     * `phoneTextScaling.test.ts` exists for. So the clause above can go green with the
     * feature reaching nothing, which is §6.121's failure exactly.
     *
     * These two are the ones that matter: the list picker prints `list.name`, which `Field`
     * caps at a hundred and twenty characters. Both must ask, by the name rather than by a
     * typed `1` — a literal here is the number leaving the core again.
     */
    for (const [platform, source] of Object.entries(PICKERS)) {
      expect(source, `${platform}'s picker does not ask for a line budget`)
        .toContain('lines={LABEL_LINES}');
      expect(source, `${platform}'s picker does not read the core for it`)
        .toMatch(/LABEL_LINES.*from '@reviewies\/core\/ui\/button'|from '@reviewies\/core\/ui\/button'/);
    }
    // And the web must not go back to clamping the box from the call site, which is where
    // this started: a class that looked like it did the job and did nothing.
    expect(PICKERS.web, 'the web picker clamps from its className again')
      .not.toMatch(/className="[^"]*\b(truncate|line-clamp-\d)\b/);
  });

  it('is a pill where it has a box at all', () => {
    expect(BOX_RADIUS).toBe(radius.pill);
    expect(TONE.quiet.fill).toBeNull();
    expect(TONE.quiet.stroke).toBeNull();
  });

  it('asks whether a tone has a box, rather than naming the one that has not', () => {
    /*
     * Three spellings of one question: the web's `tone !== 'quiet'` for the pill and the
     * toggle, the phone's `tone === 'quiet'` for the radius and again for the toggle. A
     * fifth boxless tone would have had to be remembered at each of them.
     */
    expect(boxed('primary')).toBe(true);
    expect(boxed('secondary')).toBe(true);
    expect(boxed('destructive')).toBe(true);
    expect(boxed('quiet')).toBe(false);
    for (const source of [WEB, PHONE]) {
      expect(source, 'a renderer still names the boxless tone instead of asking').not.toMatch(
        /tone [!=]== 'quiet'/,
      );
    }
  });

  it('never spends a boxless tone’s target as a visible indent', () => {
    /*
     * The defect, and the number that decides the repair.
     *
     * `paddingX` is an inset on a boxed tone — the distance from the pill's edge to the
     * words — and on a tone that paints nothing it is only an indent. Measured on the
     * title page at 420pt: *Use a different poster*, a bare underlined `<button>`, starts
     * at 16, the column every heading and row title starts on; *React* and *Talk*, two
     * `size="inline" tone="quiet"` buttons in the same column, start at 24.
     *
     * The width has to come from somewhere, because dropping the padding alone measured
     * *Talk* at 19pt of ink — under WCAG 2.5.8's 24. `MIN_WIDTH` is where it comes from,
     * and it grows the box to the right of the words rather than pushing them off the
     * column, which is also why it is not the negative margin that was filed: at
     * `size="row"` that would slide a quiet `Cancel` 10pt into the filled `Save` beside it.
     *
     * Both halves are asserted, because either alone is a different control. Padding with
     * no min-width is the indent again; min-width with no padding rule is 44pt of box with
     * the words still 8pt inside it.
     */
    expect(MIN_WIDTH, 'the boxless width is not the thumb the height already is').toBe(
      size.target,
    );

    /*
     * The web writes the padding as a utility per size, out of `SIZE_CLASS` and into its
     * own table, so that a boxless tone can be given *no* `px-*` rather than two.
     *
     * That is not tidiness. Tailwind emits by its own order, not by the order of a class
     * string, so `px-2 px-0` on one element draws at whichever it emitted last — the trap
     * this file already names twice, over `min-h-target min-h-11` and `size-5` behind
     * `h-[1em]`. A conditional that appends `px-0` would have looked exactly like this fix
     * and done nothing on some future build.
     */
    const pads = declarationOf(WEB, 'PAD_X') ?? '';
    expect(pads, 'the web has no horizontal padding table to read').toContain('page:');
    const nameOf = (px: number) =>
      Object.entries(space).find(([, value]) => value === px)?.[0] ?? '?';
    const sizes = declarationOf(WEB, 'SIZE_CLASS') ?? '';
    for (const [name, metrics] of Object.entries(SIZE)) {
      expect(pads, `${name} does not pad to what the table says`).toContain(
        `${name}: 'px-${nameOf(metrics.paddingX)}'`,
      );
      /*
       * And the other axis, in the same breath, because this is where the unit was wrong.
       *
       * The clause above about the *floors* records that Tailwind's numeric steps are `rem`
       * and that a floor written as one is not a floor. The padding was written as `py-3`
       * and `px-5` the whole time — 12 and 20 at the default text size, **24 and 40 at
       * 200%** — while the phone read `metrics.paddingY` and `metrics.paddingX` from a table
       * whose header says the box is absolute. Two renderers disagreeing about the box at
       * every text setting but the default, in a component this file exists to hold together.
       */
      expect(sizes, `${name} pads vertically in a unit that moves with the text`).toMatch(
        new RegExp(`\\b${name}: '[^']*\\bpy-${nameOf(metrics.paddingY)}\\b`),
      );
    }
    // And no horizontal padding in the size table, so no element can carry two of them.
    expect(sizes, 'a horizontal padding is back in the size table beside the one in PAD_X')
      .not.toMatch(/\bpx-/);
    /*
     * One ternary: pad on the side that has a box, take the width on the side that has not.
     * Written as one expression rather than two so neither half can be added without the
     * other — padding with no width is the indent again, width with no padding rule is 44pt
     * of box with the words still 8pt inside it.
     */
    expect(WEB, 'the web does not choose between padding and width in one place').toMatch(
      new RegExp(
        `\\? *\`[^\`]*\\$\\{PAD_X\\[size\\]\\}[^\`]*\` *: *'[^']*min-w-` +
          `${Object.entries(size).find(([, v]) => v === MIN_WIDTH)?.[0]}`,
      ),
    );
    expect(WEB, 'the web decides that by something other than the table').toContain('boxed(tone)');
    /*
     * And the words at the leading edge of that width. `justify-center` on a 44pt box
     * holding 19pt of ink puts the ink back 12pt in — the indent again, bought a second
     * way — so the centring belongs to the boxed branch rather than to the base.
     */
    const base = /'inline-flex[^']*'/.exec(WEB)?.[0] ?? '';
    expect(base, 'the base still centres, so the min-width re-indents the words').not.toContain(
      'justify-center',
    );

    // The phone, which reads the numbers rather than spelling them.
    expect(PHONE, 'the phone pads a tone that has no box to pad').toMatch(
      /paddingHorizontal: \w+ \? metrics\.paddingX : 0/,
    );
    // Named as the construct rather than as the word: `MIN_WIDTH` appears three times in
    // that file — the import, the comment and the style — and `clauses.test.ts` is right
    // that a needle a file carries three times is not a check on any one of them.
    expect(PHONE, 'the phone gives a boxless tone no width of its own').toMatch(
      /minWidth: \w+ \? undefined : MIN_WIDTH/,
    );
    expect(PHONE, 'the phone centres a boxless label inside its own target').toMatch(
      /justifyContent: \w+ \? 'center' : 'flex-start'/,
    );
    expect(PHONE, 'a justification in the stylesheet beside the one in the style')
      .not.toMatch(/base: \{[^}]*justifyContent/);
  });
});
