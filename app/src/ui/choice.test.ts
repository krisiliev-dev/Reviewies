import { describe, expect, it } from 'vitest';
import { COPY } from '@reviewies/core/copy';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { stripComments } from '@reviewies/core/test/source';
import { CHOICE_SIZE, CHOSEN, announce } from '@reviewies/core/ui/choice';
import { border, color, size } from '@reviewies/core/tokens';

/**
 * One of several is a radio, not a button, and it is never smaller than a thumb.
 *
 * Five controls in this build are the same thing. `calendar.tsx` said `radiogroup` and
 * `radio` and put the hint in the announced name; Watching Mode's density chips said
 * `accessibilityRole="button"` with a `selected` flag, at `minWidth: 26, minHeight: 24` —
 * half the house target, on the flagship screen, written a fortnight apart by the same
 * hand. Nothing compared them, which is why both shipped.
 *
 * A button says "this does something". A radio says "this is one of several and it is the
 * one that is on", which is the entire content of the control.
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
/**
 * The two files allowed to say `radio`, by exact path rather than by basename.
 *
 * `path.endsWith('Choice.tsx')` is what the button-role clause below uses and it is one
 * rename away from useless: a `CountryChoice.tsx` beside it would be skipped by a check
 * meant to catch exactly that sort of second control.
 */
const RENDERERS = ['mobile/src/ui/Choice.tsx', 'app/src/ui/Choice.tsx'];
const read = (path: string) => stripComments(readFileSync(path, 'utf8'));
const RENDERER = read(resolve(ROOT, 'mobile/src/ui/Choice.tsx'));
/** Repo-relative, because `read` above takes an absolute path and a clause that
 *  forgets is green from the repo root and red under `npm run verify`. */
const inRepo = (path: string) => read(resolve(ROOT, path));

describe('the choice contract', () => {
  it('reads a renderer and a table rather than nothing', () => {
    expect(RENDERER.length).toBeGreaterThan(1000);
    expect(Object.keys(CHOICE_SIZE)).toEqual(['chips', 'rows']);
    expect(announce({ key: 'a', label: '24', hint: 'about six a minute' })).toBe(
      '24 — about six a minute',
    );
    expect(announce({ key: 'a', label: '24' })).toBe('24');
  });

  it('is never smaller than the house target, in either density', () => {
    // 26×24 is what the density chips were. WCAG 2.5.8's floor is 24 and the house
    // standard is 44; a chip is not the place to discover the difference.
    for (const metrics of Object.values(CHOICE_SIZE)) {
      expect(metrics.minHeight).toBe(size.target);
    }
    expect(CHOICE_SIZE.chips.minWidth).toBe(size.target);
  });

  it('says radio, and says it in the renderer too', () => {
    /*
     * `'radiogroup'` in an expression rather than as a literal attribute since §6.138: a
     * row that `continues` a group declared around it must not declare a second one, so
     * the role is chosen rather than typed. The clause reads the value, not the spelling.
     */
    expect(RENDERER).toMatch(/accessibilityRole=\{continues \? 'none' : 'radiogroup'\}/);
    expect(RENDERER).toContain('accessibilityRole="radio"');
    // The hint belongs to the name. A second text node is a thing to arrow past.
    expect(RENDERER).toContain('announce(option)');
  });

  it('marks the chosen one with a rule and a step in the ink, never a fill', () => {
    /*
     * §6.90 spent 822 sites turning fills into rules; a selected chip is the one control
     * that would have quietly kept one. A rule plus an ink step is two channels rather
     * than colour alone — §6.91's argument for the tab bar, one control down — so it
     * survives being read by somebody who cannot separate the two greys.
     *
     * **An ink step, not a weight step**, and this clause was called "a rule and a weight"
     * until §6.139. §6.113 took weights out — the phone cannot thicken a named family, so a
     * state carried by weight is a state the phone loses — and §6.134 corrected the same
     * sentence where it appears in `choice.ts`. The clause's *name* and the comment under
     * it were not corrected, so a guard went on announcing a mechanism the product had
     * deliberately dropped, over assertions that had always read the ink. The assertions
     * below are the ones that were right all along.
     */
    expect(CHOSEN.rule).toBe(border.tally);
    expect(CHOSEN.label.off).toBe('inkSecondary');
    expect(CHOSEN.label.on).toBe('ink');

    /*
     * **No fill at all**, rather than not these two named fills.
     *
     * This clause read `theme.(actionFill|workingFill)` and nothing else, so it held a
     * two-item deny list against a rule with no exceptions in it. Planted with
     * `on && !rows ? { backgroundColor: '#f4efe7' } : null` — the chosen chip's old fill,
     * spelled as the hex the token resolves to — it stayed green, and the fill would have
     * come back on all five call sites at once from inside the shared renderer.
     *
     * So: the only ground a chip has is the card's, except momentarily under the finger.
     * `PRESS` on the phone and `active:` on the web are the one exception, and they are
     * exceptions to *motion*, not to selection — `Button` makes the same allowance for the
     * same reason. Anything else painting a background here is a fill by another name.
     */
    const fills = [...RENDERER.matchAll(/backgroundColor:\s*([^,\n}]+)/g)].map((m) => m[1].trim());
    expect(fills, 'the phone renderer paints no ground at all, so this proves nothing')
      .not.toEqual([]);
    expect(fills.filter((f) => f !== 'theme[PRESS]'), 'a fill is back in the phone renderer')
      .toEqual([]);

    /*
     * The web's allowance is by *variant*, and a named list of them rather than "any
     * variant": `active:bg-…` today, and `hover:`/`focus-visible:` if a mouse ever wants
     * one. A ground that only exists while a pointer is on the control is not a selection
     * mark, so refusing those would be refusing a correct change — and allowing *any*
     * prefix would wave through a variant keyed on the state itself, which is the fill
     * wearing a colon.
     */
    const POINTER = ['active:', 'hover:', 'focus-visible:'];
    const webRenderer = inRepo('app/src/ui/Choice.tsx');
    const classes = [...webRenderer.matchAll(/[a-z-]*:?bg-[a-z0-9-]+/g)].map((m) => m[0]);
    expect(classes, 'the web renderer names no ground at all, so this proves nothing')
      .not.toEqual([]);
    expect(
      classes.filter((c) => !POINTER.some((p) => c.startsWith(p))),
      'a fill is back in the web renderer',
    ).toEqual([]);
  });

  it('marks it in a colour that clears 3:1 on every ground', () => {
    // A selection rule identifies a state, so WCAG 1.4.11 applies. Measured on all three
    // grounds in both themes rather than the flattering one.
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
      for (const ground of [table.ground, table.groundRaised, table.groundWell]) {
        expect(contrast(table[CHOSEN.colour], ground), `${theme} on ${ground}`).toBeGreaterThan(3);
      }
    }
  });

  it('offers one scrolling line, and both renderers actually do it', () => {
    /*
     * §6.109. A group whose length is the person's data rather than the product's:
     * Stats has one chip per year with a watch in it, so a decade of imported TV Time
     * put thirteen chips in three rows above the figures the screen exists for.
     *
     * Both halves are checked because a prop declared and honoured on one platform is
     * the shape §6.87 named — emitted is not rendered — and this contract has five call
     * sites that must not start scrolling by accident.
     */
    expect(inRepo('core/src/ui/choice.ts'), 'the contract has no scroll').toMatch(
      /^\s*scroll\?: boolean;$/m,
    );
    const web = inRepo('app/src/ui/Choice.tsx');
    expect(web, 'the web declares scroll and does nothing with it').toContain('overflow-x-auto');
    expect(web, 'thirteen chips would be squeezed rather than scrolled').toContain('shrink-0');
    const phone = inRepo('mobile/src/ui/Choice.tsx');
    expect(phone, 'the phone declares scroll and does nothing with it').toMatch(
      /const Group = scroll \? ScrollView : View;/,
    );
    // And it is off unless asked for: four of the five call sites are fixed lists.
    expect(web).toContain("scroll = false");
    expect(phone).toContain("scroll = false");
  });

  it('is one question on Stats, drawn on two rows, on both platforms', () => {
    /*
     * Two **rows**, for a measured reason. The windows and the years as one wrapping
     * radiogroup read as one question with thirteen answers: on a ten-year library at
     * 390px, 148px of control and the first figure at y=236 of an 844px viewport, against
     * 88 and 222 with the years scrolling on their own line. The alternative that keeps
     * them wrapping came to 140 and pushed the figures to 274 — recorded because it was
     * built and photographed, not because it was imagined.
     *
     * And **one question**, which is what this clause used to have backwards. The name it
     * carried was "is two questions on Stats", and `Stats.tsx` said the same in a comment
     * nine lines below one saying the opposite — "one list of options, because they are
     * one choice … which is what a radio group *is*". The render followed *two* and the
     * state followed *one*, so the row that did not hold the answer got `value=''` and
     * announced a radiogroup with nothing selected, on every visit. §6.138.
     *
     * A screenshot cannot show this — the chips draw the same either way — so it is
     * measured where it lives: one named group in the source, two rows that `continue` it,
     * and one `value` expression feeding both.
     */
    for (const path of ['app/src/screens/Stats.tsx', 'mobile/app/stats.tsx']) {
      const source = inRepo(path);
      const rows = source.match(/<Choice\b/g) ?? [];
      expect(rows.length, `${path} does not draw the question on two rows`).toBe(2);
      // Named through `copy.ts` since §6.167, which also stopped it being a `Section`:
      // a heading in the middle of one radiogroup drew the two rows as two questions,
      // which is the visual half of the defect this clause holds the markup half of.
      expect(source, `${path} does not name Year in review`).toContain(
        'COPY.stats.yearInReview',
      );
      expect(source, `${path} draws the row's label as a section heading`).not.toMatch(
        /<Section[^>]*>\s*\{?COPY\.stats\.yearInReview/,
      );
      expect(source, `${path}'s years do not scroll`).toMatch(/\bscroll\b/);

      // Both rows continue a group rather than declaring one.
      const continues = source.match(/^\s*continues$/gm) ?? [];
      expect(continues.length, `${path} has a row that declares its own group`).toBe(2);

      // And there is exactly one group, named once, around them.
      const declared = source.match(/(?:accessibilityRole="radiogroup"|role="radiogroup")/g) ?? [];
      expect(declared.length, `${path} declares ${declared.length} groups for one question`).toBe(1);

      /*
       * One answer, read by both rows. This is the half that actually broke: two `value`
       * expressions, each blanking itself when the other held the answer.
       */
      const values = source.match(/value=\{[^}]*\}/g) ?? [];
      expect(values.filter((v) => v === '{chosen}'.replace('{', 'value={')).length, `${path} does not feed both rows one answer`).toBe(2);
      expect(source, `${path} blanks a row instead of sharing the answer`).not.toMatch(
        /value=\{year === undefined \? '' :/,
      );
    }

    // The group's name is the one both platforms use, so it cannot drift into two.
    expect(COPY.stats.period.length, 'the group has no name').toBeGreaterThan(10);
    for (const path of ['app/src/screens/Stats.tsx', 'mobile/app/stats.tsx']) {
      expect(inRepo(path), `${path} spells the group's name by hand`).toContain(
        'COPY.stats.period',
      );
    }
  });

  it('writes the table’s numbers as classes the table can be compared to', () => {
    /*
     * §6.181. Both renderers carried a comment saying the web reads `CHOICE_SIZE` — the
     * phone's says "which is where the web reads them too" — and the web did not. It wrote
     * five of the table's numbers as Tailwind literals with nothing holding them to it, and
     * one had already parted: `rows.gap` is 2 and the class list for a column of rows had
     * **no gap at all**, so the phone put two points between one radio row and the next and
     * the web put none.
     *
     * The four box numbers happened to be right, which is the state this clause exists to
     * stop being luck. The spelling is the token one — `px-s12`, `gap-s8` — so the class
     * *contains* the key and the assertion can rebuild it from the table rather than from a
     * second hand-written map. `gap-2` is also eight pixels and says nothing about why.
     */
    const web = inRepo('app/src/ui/Choice.tsx');
    for (const [density, metrics] of Object.entries(CHOICE_SIZE)) {
      expect(web, `the web does not read ${density}'s padding`).toContain(`px-s${metrics.paddingX}`);
      expect(web, `the web does not read ${density}'s gap`).toContain(`gap-s${metrics.gap}`);
    }
    // The floors are named rather than numbered, for the same reason: `min-h-11` is 44 by
    // Tailwind's scale and by coincidence, `min-h-target` is 44 because `size.target` is.
    expect(web, 'the web types its own target floor').toContain('min-h-target');
    expect(web, 'the chips lose their width floor').toContain('min-w-target');
    expect(web, 'the web still spells a box number on Tailwind’s own scale')
      .not.toMatch(/min-[hw]-11\b|\bpx-[34]\b/);
    // And the gaps must differ, or one class would satisfy both halves above.
    expect(CHOICE_SIZE.rows.gap).not.toBe(CHOICE_SIZE.chips.gap);
  });

  it('leaves no second radio anywhere, on either platform', () => {
    /*
     * §6.90's rule has a hole the shape of a control that is *correct about what it is*.
     *
     * The clause below catches a one-of-several wearing `accessibilityRole="button"` with
     * a `selected` flag, because that is the shape Watching Mode's density chips had. It
     * cannot catch a hand-rolled control that calls itself a radio properly — and the
     * clause above it reads `Choice.tsx` and nothing else, so a fill on somebody else's
     * radio is invisible to both. `WhereToWatch` was that control on both platforms for
     * four sprints: twenty-four `role="radio"` chips whose chosen one took
     * `backgroundColor: theme.actionFill` on the phone and `bg-action-fill` on the web,
     * measured on the built page at 390px as 34.75–40.77 × 32 against a 44 floor, and
     * dropping its border when chosen so the selected chip changed shape. Every guard in
     * this repository was green on it, which is what a rule scoped to one file buys.
     *
     * So the rule is scoped to the class instead: **`Choice` is the only thing in this
     * build that may say `radio`.** Not `radiogroup` — Stats legitimately declares one
     * around two rows that `continue` it, and the clause above depends on that — just the
     * option itself, which is the part that carries a state and a box and can therefore
     * disagree with the table.
     *
     * Both platforms, because the defect was on both and a sweep of one is how a control
     * migrates on the phone and stays behind on the web.
     *
     * ## What this still cannot see, planted and confirmed
     *
     * A one-of-several that declares **no role at all** — a `map` over options producing
     * bare buttons, a fill on the chosen one, and nothing announcing that it is a choice.
     * Planted as a 20×16 filled `CountryChoice.tsx` and every clause here stayed green.
     * It is left uncaught on purpose: the only rules that would catch it are shape
     * heuristics over `.map(`, and a guard that guesses at intent fails on correct code,
     * which is the more expensive failure. What the two clauses here do close is the case
     * where the control is *honest about what it is* — which is every one written by
     * somebody who read the accessibility rules and not the component library, and which
     * is what `WhereToWatch` was.
     */
    const ONE_OF_SEVERAL = /(?:accessibilityRole|role)\s*=\s*\{?\s*['"]radio['"]/;
    const off: string[] = [];
    let renderers = 0;
    for (const path of [...PHONE, ...WEB]) {
      const here = relative(ROOT, path);
      const said = ONE_OF_SEVERAL.test(read(path));
      if (!said) continue;
      if (RENDERERS.includes(here)) renderers++;
      else off.push(here);
    }
    /*
     * Proof of life, which is the half a sweep like this usually lacks: a wrong root, a
     * regex that matches nothing, or an extension filter that skips every file all read as
     * "no offenders". The two renderers must be found, and they are the only two.
     */
    expect(renderers, 'the sweep did not find the renderers, so it proves nothing').toBe(2);
    expect(PHONE.length + WEB.length, 'the sweep read almost no files').toBeGreaterThan(80);
    expect(off, 'a one-of-several outside `Choice` is a second control, not a call site').toEqual(
      [],
    );
  });

  it('leaves no one-of-several wearing a button’s role', () => {
    /*
     * The defect itself, on the phone: a `Pressable` that carries `selected` in its
     * accessibility state while calling itself a button. `Choice` is the only thing that
     * should be expressing "one of these is on", so nothing else may claim it.
     *
     * Deliberately not looking for `checked` as well — a checkbox legitimately carries
     * that, and `CrossOff` will be one.
     */
    const off: string[] = [];
    for (const path of PHONE) {
      if (path.endsWith('Choice.tsx')) continue;
      const text = read(path);
      // The two attributes can be lines apart, so the unit is the element.
      for (const element of text.split('<Pressable').slice(1)) {
        const head = element.slice(0, element.indexOf('>'));
        if (/accessibilityRole="button"/.test(head) && /selected:/.test(head)) {
          off.push(relative(ROOT, path));
        }
      }
    }
    expect(off, 'a control that is one of several is a radio').toEqual([]);
  });
});
