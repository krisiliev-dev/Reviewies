import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { stripComments } from '@reviewies/core/test/source';
import { size, space } from '@reviewies/core/tokens';
import { REACH, tap } from '../../../mobile/src/ui/theme';

/**
 * Ten steps on a 2pt base, and nothing else.
 *
 * The build this replaced used twenty distinct spacing values across 324 sites. Four of
 * them carried no distinction at all — 10 (47 uses), 14 (36), 18 (7), 40 (6) — and six
 * more were singletons that existed because somebody typed a number: 3, 5, 7, 9, 11, 52.
 * `paddingVertical: 7` and `paddingVertical: 8` are not a decision anybody made twice.
 *
 * There is no allowlist here, and that is the point. The obvious way to land a guard
 * against 108 existing violations is a shrinking exception list, and §6.59 is this
 * codebase's own entry about where that ends: a written excuse for a swallowed failure
 * that outlived the failure by a year, because nobody read it back. So the guard landed
 * with the migration — 108 phone literals and 48 web utilities changed in the same
 * commit — or it did not land.
 *
 * The mapping was nearest member, ties up: 3→4, 5→6, 7→8, 10→12, 11→12, 14→16, 18→20,
 * 40→48, 52→48. One exception, 9→8, because 9 appeared once as a control's vertical
 * padding beside a 12 horizontal and rounding it up would have made it taller than wide.
 */
const ROOT = resolve(import.meta.dirname, '../../..');

/**
 * The scale, plus the two floors that are deliberately not on it.
 *
 * `size.target` (44) and `size.tap` (24) are minimums the house standard and WCAG 2.5.8
 * impose on a control, not rhythm — a 44 that happened to be 48 would be a different
 * thing, so they are exempt by name rather than rounded onto the scale. 0 is not
 * spacing; it is the absence of it.
 */
const ALLOWED = new Set<number>([0, ...Object.values(space), size.target, size.tap]);

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.expo') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

const read = (path: string) => stripComments(readFileSync(path, 'utf8'));

const PHONE = ['mobile/app', 'mobile/src'].flatMap((t) => sources(resolve(ROOT, t)));
const WEB = sources(resolve(ROOT, 'app/src'));

/** Every style key that positions one thing relative to another. */
const KEY =
  /\b(padding|paddingTop|paddingBottom|paddingLeft|paddingRight|paddingHorizontal|paddingVertical|margin|marginTop|marginBottom|marginLeft|marginRight|marginHorizontal|marginVertical|gap|rowGap|columnGap|top|bottom|left|right|start|end):\s*(-?\d+(?:\.\d+)?)\b/g;

/**
 * A far-negative inset is not spacing. It is the parking idiom: an overlay rendered but
 * moved off-screen so it keeps its accessibility tree while invisible, which §6.86's
 * predecessor found the phone getting wrong. Bounded at -1000 rather than "any negative",
 * so `marginTop: -3` — which really is somebody nudging by eye — still fails.
 */
const PARKED = -1000;

describe('the space scale, on the phone', () => {
  it('reads a tree rather than nothing', () => {
    expect(PHONE.length).toBeGreaterThan(40);
    expect(Object.values(space)).toEqual([2, 4, 6, 8, 12, 16, 20, 24, 32, 48]);
  });

  it('assigns nothing off the scale', () => {
    const off: string[] = [];
    let seen = 0;
    for (const path of PHONE) {
      const text = read(path);
      text.split('\n').forEach((line, index) => {
        for (const match of line.matchAll(KEY)) {
          const value = Number(match[2]);
          seen++;
          if (ALLOWED.has(value) || value <= PARKED) continue;
          off.push(`${relative(ROOT, path)}:${index + 1}  ${match[1]}: ${value}`);
        }
      });
    }
    // A scan that stopped matching would report nothing and look like success.
    //
    // 250 exactly, after sprint 15 deleted a dozen phone stylesheets' worth of padding
    // along with the hand-built controls that carried it. Lowered to 240 rather than to
    // the new count: a floor set to today's number fails on the next legitimate deletion
    // and gets nudged again, which is a ratchet nobody reads. It is here to catch a scan
    // that has stopped matching, and a hundred-site drop is what that looks like.
    /*
     * 225, down from 240, because `Field` absorbed the padding of twenty-three inputs — the
     * same shrinkage `type.test.ts`'s `<h2>` count took when `Section` landed. A component
     * taking a decision off the screens is the population falling for the right reason, and
     * the floor moves with it rather than being left slack: a slack floor is what let nine
     * deleted tests through in §6.107.
     */
    /*
     * 210, down from 225, because `SCREEN.edge` absorbed the literal `16` from fifteen
     * screen containers — the same shrinkage `Field` caused at 240 and `Section` caused
     * before that. Three sprints running, a component or a table taking a decision off the
     * screens has moved this number, which is the population falling for the right reason.
     */
    /*
     * 203, down from 210: `Block` absorbed the padding and gap of four boxed section
     * headings, the way `SCREEN.edge` did for fifteen containers and `Field` for
     * twenty-three inputs before that.
     */
    /*
     * 195, down from 203: `lists.tsx`'s card became a `Row` and took its head, body and
     * inset with it, and three more fills became rules that need no padding of their own.
     */
    /*
     * 194, down one: three `padding: 24` containers became `SCREEN.edge`. That 24 was a
     * fourth screen edge that §6.121 could not absorb, because it was not a `content:`
     * container and the migration matched on the name.
     *
     * 192 after §6.130, down two: Watching Mode's `padGrid`, `padButton`, `padPressed`
     * and `densityBlock` went to `PadCell` and `Block`. The spacing did not vanish — it
     * moved into two components, where one file owns it and this scan does not count it
     * against a screen.
     */
    /*
     * 182, down eleven: §6.131's call-site migration took `paddingHorizontal`/`Vertical`
     * off nine phone controls with the styles that carried them, and `AddToList`'s list
     * row and Stats' all-time pill lost their whole style objects.
     *
     * 181, down one: `Attribution` absorbed two hand-rolled `styles.attribution` objects,
     * one of which carried the `marginTop: 12` that was the whole of what #173 was about.
     * The space did not vanish — it is `ATTRIBUTION_SEPARATION` now, held by
     * `attribution.test.ts` on both platforms at once. §6.147.
     *
     * 178, down three, all §6.167: `WhereToWatch`'s service plate lost the padding it
     * had as a box when a streaming service stopped being drawn as one, and the phone's
     * `RemoteDrawer` lost the `paddingVertical`/`Horizontal` of the edge tab it no
     * longer draws — the trigger is a `Button` in Watching Mode's control row, so that
     * spacing belongs to `Button` now. One is a shape deleted and two are a shape moved
     * into a component, which is the same two reasons as every note above.
     */
    /*
     * 177, down one: §6.168's two decisions each gave a phone style back. `Row`'s tag
     * lost the padding it had as a box, and More's figure lost the plate it was painted
     * on inside a card it was already on.
     */
    expect(seen, 'the scan found no spacing at all').toBeGreaterThan(176);
    expect(off).toEqual([]);
  });

  it('states how far past its edge a control reaches, rather than typing it nineteen times', () => {
    /*
     * §6.180. `hitSlop` is a *prop*, not a style key, so `KEY` above could never have seen
     * it — and nineteen call sites each carried a bare number that agreed by accident.
     * Eighteen `hitSlop={8}` and one `hitSlop={12}`, with nothing in the repository able to
     * say whether the odd one out was a decision or a slip. It was a decision (Watching
     * Mode's *Leave*, pressed in a dark room) and `REACH` in `mobile/src/ui/theme.ts` is
     * where it is written down.
     *
     * This is the same argument the file's header makes about 7-versus-8 padding, one layer
     * out: a number nobody stated is a number nobody can disagree with.
     */
    const slopped = PHONE.filter((path) => /hitSlop/.test(read(path)));
    expect(slopped.length, 'nothing on the phone slops a target at all').toBeGreaterThan(12);

    const bare: string[] = [];
    let reads = 0;
    for (const path of slopped) {
      const source = read(path);
      for (const [, value] of source.matchAll(/hitSlop=\{([^}]+)\}/g)) {
        if (/^REACH\.\w+$/.test(value.trim())) reads += 1;
        else bare.push(`${relative(ROOT, path)}: hitSlop={${value.trim()}}`);
      }
    }
    expect(bare, 'a control says how far it reaches without reading the table').toEqual([]);
    // And the table is actually reached, rather than being an export beside nineteen
    // literals — which is what `coreWiring.test.ts` reports one layer up and what §6.121
    // is about down here.
    expect(reads, 'almost nothing reads REACH').toBeGreaterThan(15);

    // The one distinction the table exists to carry. A `dark` that is not further than an
    // `inline` is two names for one number, which is the state this replaced.
    expect(REACH.dark, 'dark reaches no further than inline').toBeGreaterThan(REACH.inline);
    // Slop is on *top* of a real height and never instead of one: it is invisible to layout
    // and no suite can measure it, which is why `tap` has to clear the floor by itself.
    expect(tap.minHeight, 'tap does not clear the WCAG 2.5.8 floor on its own')
      .toBeGreaterThanOrEqual(size.tap);
    expect(read(resolve(ROOT, 'mobile/src/ui/theme.ts')), 'tap types its own floor')
      .toContain('minHeight: size.tap');
  });
});

/**
 * The web writes Tailwind's scale, so the numbers are quarters of the same points.
 *
 * `px-3` is 12px and `px-2.5` is 10px, and the second is off the scale for exactly the
 * reason the phone's `paddingHorizontal: 10` was. Forty-two sites used it.
 */
const UTILITY =
  /(?:^|[\s"'`{])(-?)(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y|inset|inset-x|inset-y|top|bottom|left|right|scroll-m|scroll-p)-(\d+(?:\.\d+)?)\b/g;

/** `p-[calc(var(--tabbar,5rem)+1rem)]` and anything else in brackets. */
const ARBITRARY =
  /(?:^|[\s"'`{])(?:-?)(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y|inset|inset-x|inset-y|top|bottom|left|right|scroll-m|scroll-p)-\[([^\]]+)\]/g;

/**
 * The box a thing is drawn in, which is a different question from the space around it —
 * and the seven namespaces neither regex above has ever covered.
 *
 * Deliberately its own sweep rather than three more alternatives in `UTILITY`. `UTILITY`
 * asks one question — is the number on the scale — and `h-11` **is** on it, at 44. The
 * whole finding is that being on the scale is not enough for a box, so widening `UTILITY`
 * would have added seven namespaces to a clause that had nothing to say about six of the
 * seven sites in them.
 */
const BOX =
  /(?:^|[\s"'`{])(size|w|h|min-w|min-h|max-w|max-h)-(\[[^\]]*\]|[\w.]+(?:\/\d+)?)/g;

/**
 * Not lengths, and so not this clause's business: Tailwind's intrinsic keywords and a
 * fraction of the parent. `w-1/2` is half of whatever it is in, which no scale describes.
 */
const BOX_KEYWORD = new Set([
  'auto', 'full', 'screen', 'min', 'max', 'fit', 'px',
  'dvh', 'dvw', 'lvh', 'lvw', 'svh', 'svw',
]);

/**
 * Every name the spacing namespace actually emits, read from the generated stylesheet
 * rather than rebuilt from the tokens.
 *
 * §6.85's trap, which `poster.test.ts` records for `border-b-s4`: a class whose custom
 * property is never generated produces no rule at all and looks exactly like a class. The
 * two readings have to be the file Tailwind compiles against, not the table it came from.
 */
const SPACING_NAMES = new Set(
  [...readFileSync(resolve(ROOT, 'app/src/tokens.generated.css'), 'utf8').matchAll(
    /--spacing-([a-z0-9]+):/g,
  )].map((m) => m[1]),
);

/**
 * Points to the names the table has for them. 24 has two — a step of the scale and the
 * WCAG 2.5.8 floor — and either spelling is a name, which is the whole of what is asked.
 */
const NAMES_FOR = new Map<number, string[]>();
for (const [name, px] of [...Object.entries(size), ...Object.entries(space)])
  NAMES_FOR.set(px, [...(NAMES_FOR.get(px) ?? []), name]);

describe('the space scale, on the web', () => {
  it('reads a tree rather than nothing', () => {
    expect(WEB.length).toBeGreaterThan(40);
  });

  it('writes no utility off the scale', () => {
    const off: string[] = [];
    let seen = 0;
    for (const path of WEB) {
      const text = read(path);
      text.split('\n').forEach((line, index) => {
        for (const match of line.matchAll(UTILITY)) {
          const px = Number(match[3]) * 4;
          seen++;
          if (ALLOWED.has(px)) continue;
          off.push(`${relative(ROOT, path)}:${index + 1}  ${match[2]}-${match[3]} = ${px}px`);
        }
      });
    }
    /*
     * 372, down from 400: the web half of §6.131's call-site migration. Nineteen controls
     * spelled their own `px-4 py-2`; `Button`'s size table spells it once.
     */
    /* 366, down six, for the same deletion. */
    /* 364, down two: §6.168 — `Row`'s tag lost its `px-1.5 py-0.5` with its box, and
       More's figure lost its `px-3 py-2` with the plate it did not need on a card. */
    /*
     * 359, down five: §6.181 moved `Choice`'s box and gaps off Tailwind's own scale onto
     * the token spelling — `px-s12`, `gap-s8` — which this scan does not count and does
     * not need to. The point of the scan is that a number typed on Tailwind's scale is on
     * *this* app's scale too; a class that names the token has nothing left to check.
     *
     * Worth saying out loud because the direction of travel makes this floor a decreasing
     * one: every future migration to a token spelling lowers it. It still catches the
     * thing it is for — a file deleted, or a scan that stops matching — and a floor that
     * only ever ratchets up would have to be relaxed by hand every time anyway.
     */
    /*
     * 357, down two: §6.187 — `AccountPanel`'s sync paragraph had two `mx-1`s standing in
     * for word spaces JSX had eaten, and they went with the repair. The direction of travel
     * named above holds, and this is the first time it has been a *prose* fix rather than a
     * migration that lowered it: a margin doing a space's job is spacing this scan counts
     * and a reader cannot select.
     */
    /*
     * 351, down six: `Button`'s own padding, both axes, moved onto the token spelling —
     * `px-s20`/`px-s16`/`px-s8` and `py-s12`/`py-s8`/`py-s4`.
     *
     * That was not tidying. Tailwind's numeric steps are `rem`, so `py-3` is 12 at the
     * default text size and **24 at 200%**, while the phone reads `SIZE[size].paddingY`
     * from a table whose header says *"the box, in absolute device-independent pixels"*.
     * The two renderers disagreed about the box at every text setting but the default. It
     * is the same defect the `min-h` clause in `button.test.ts` records for the floors,
     * one property along, and the six that leave this scan are six numbers that are now
     * pixels rather than multiples of the reader's font size.
     */
    expect(seen, 'the scan found no spacing at all').toBeGreaterThan(350);
    expect(off).toEqual([]);
  });

  /**
   * An arbitrary value is allowed when it is computed, and only then.
   *
   * `pb-[calc(var(--tabbar,5rem)+1rem)]` is the tab bar's own height plus a gap. No scale
   * can describe it, because the height is a component dimension measured at runtime —
   * and the spec is explicit that component dimensions stay in their components. What the
   * scale *can* describe is the thing added to it, so the `var()` and its fallback are
   * removed and every length that remains has to be on the scale. This is a rule about
   * shape rather than an exemption for a site: `pb-[10px]` still fails.
   */
  it('permits an arbitrary value only where a scale cannot reach', () => {
    const off: string[] = [];
    let seen = 0;
    for (const path of WEB) {
      const text = read(path);
      text.split('\n').forEach((line, index) => {
        for (const match of line.matchAll(ARBITRARY)) {
          seen++;
          const where = `${relative(ROOT, path)}:${index + 1}  ${match[1]}`;
          const body = match[1];
          if (!body.startsWith('calc(') || !body.includes('var(--')) {
            off.push(`${where} — not a calc over a custom property`);
            continue;
          }
          const addends = body.replace(/var\(--[^)]*\)/g, '');
          for (const length of addends.matchAll(/(\d+(?:\.\d+)?)(px|rem)/g)) {
            const px = length[2] === 'rem' ? Number(length[1]) * 16 : Number(length[1]);
            if (!ALLOWED.has(px)) off.push(`${where} — ${length[0]} is ${px}px, off the scale`);
          }
        }
      });
    }
    expect(seen, 'the scan found no arbitrary values at all').toBeGreaterThan(0);
    expect(off).toEqual([]);
  });

  /**
   * The box, which no regex in this file could see until now.
   *
   * §6.185 fixed `Toggle`'s `size-5` because it was the one box in the product measured
   * *wrong*, and said so in its own prose: `CrossOff`'s `h-11 w-11` and `Button`'s
   * `min-h-12` are the same 44 and 48 arrived at twice, `UTILITY` above covers none of
   * `size`/`h`/`w`/`min-h`, and nothing swept any of them. Widening the sweep found
   * eighteen sites across eleven files — and a second fact that makes them worse than
   * numbers nobody chose.
   *
   * ## Tailwind's own numeric steps are `rem`, and this app's type is not
   *
   * `--spacing` is `0.25rem` and the compiled sheet says so plainly:
   *
   * ```css
   * .min-h-11{min-height:calc(var(--spacing) * 11)}     — 2.75rem
   * .min-h-target{min-height:var(--spacing-target)}     — 44px
   * ```
   *
   * So `min-h-11` is 44 only while the reader has not changed their browser's text size,
   * and `min-h-target` is 44 whatever they have done. `docs/design/components.md` is
   * explicit — *"24 and 44 are CSS-pixel counts and must not scale with text"* — and
   * `poster.test.ts` says the same thing about artwork from the other side, quoting the
   * phone's *"the type grows and the poster does not"*.
   *
   * Measured in Chromium against the built stylesheet at a 390 viewport, both spellings on
   * the page at once, rather than reasoned about:
   *
   * | | root 16px | root 32px, was | root 32px, is |
   * | --- | --- | --- | --- |
   * | `CrossOff` ring | 44x44 | **88x88** | 44x44 |
   * | `Button` page floor | 48 | **96** | 48 |
   * | `Button` row floor | 44 | **88** | 48 |
   * | poster row plate | 44x66 | **88x66** | 44x66 |
   * | poster detail plate | 96x144 | **192x288** | 96x144 |
   * | tab marker rule | 24 wide | **48** | 24 |
   * | rating half-target | 24x48 | 24x48 | 24x48 |
   *
   * Every row agrees at the default size, which is why sixteen sprints of screenshots
   * never showed it. The row that does not move in either column is `StarRating`, the one
   * site that had already been repaired — and the poster row plate is the sharp one:
   * 88x66 is not 2:3, on the component whose whole suite is named for being 2:3.
   *
   * The build had already found this **once**, at one call site, and written it down
   * there: `StarRating` carries *"Pixels, not rem ... written as `min-w-12` this doubled
   * along with everything else at 200%, making the control 480 wide and pushing four and
   * a half stars through five off the side of the screen."* That is §6.139's shape — a
   * finding repaired where it was found, with nothing sweeping for the seventeen others —
   * and it is the whole argument for this clause being a sweep rather than a fix.
   *
   * ## So the test is not "on the scale". It is "named"
   *
   * Where the table has a name for the value, the class writes the name: `size-target` is
   * 44 because `size.target` is, where `h-11` is 44 by Tailwind's arithmetic and by
   * coincidence, and says nothing about which 44 it means. `Choice` (§6.181), `Field`
   * (§6.182) and `Toggle` (§6.185) already spell it that way; this is the rest of the
   * tree.
   *
   * Where the table has **no** name for it, the number is a component dimension rather
   * than a step on a scale, and it is written as a measurement — `h-[128px]`, `w-[288px]`
   * — which is exactly what the clause above says about `pb-[calc(var(--tabbar)…)]`: a
   * dimension a scale cannot reach stays in its component. `rem` inside one of those is
   * refused, because a box in `rem` is the finding restated in brackets.
   *
   * Both directions are checked, and the second half is not hypothetical: `min-h-[44px]`
   * in `ImportFiles` and `min-h-[24px] min-w-[48px]` in `StarRating` were the two target
   * floors spelled as bare pixel counts, in the one form the scale could not see either.
   *
   * Not swept: `min-w-0`, which is the flex idiom for "may shrink below your content" and
   * is an absence rather than a length, and sixteen sites write it.
   *
   * ## What this clause cannot see, named rather than left to be discovered
   *
   * It asks whether a box is *named*. It cannot ask whether it is the **right** name, and a
   * plant proves the gap rather than an argument for it. Three of these were planted after
   * the migration, ran the whole `app` suite, and came back green:
   *
   * - `CatchUp`'s number grid at `min-w-tap` instead of `min-w-target` — a 24pt target
   *   where the house standard says 44, on a grid of small numbers pressed one-handed;
   * - Watching Mode's timecode column at `min-w-s2` instead of `min-w-s48`, which is the
   *   whole point of that span — a fixed column so the clock does not jitter;
   * - a content warning's verdict dot at `size-s48` instead of `size-s6`, eight times over.
   *
   * Two more were planted and **caught**, and by which clause is the shape worth keeping:
   * `size-tap` on `CrossOff`'s ring and `min-h-tap` on `Button`'s row both walked straight
   * through here — a name is a name — and failed in `crossOff.test.ts` and
   * `button.test.ts`, where the utility is derived from `RING.size` and `SIZE[…].minHeight`
   * and compared. That is the division this clause is built for: it makes every box in the
   * tree *nameable*, and the component's own file says which name. It is not a substitute
   * for the second half, and a component that acquires a box without acquiring a clause
   * still gets one number nobody checked — three of them are listed above.
   */
  it('draws a box in a name, not in a number that is 44 at exactly one text size', () => {
    /*
     * Source files only, unlike the two clauses above. A guard that quotes a class as a
     * needle — `value.includes('min-w-[48px]')` — is not a component drawing a box, and
     * counting it would report this file's own siblings.
     */
    const drawn = WEB.filter((path) => !/\.test\.tsx?$/.test(path));
    const off: string[] = [];
    let seen = 0;
    let named = 0;
    for (const path of drawn) {
      const text = read(path);
      text.split('\n').forEach((line, index) => {
        for (const match of line.matchAll(BOX)) {
          const [, namespace, value] = match;
          const where = `${relative(ROOT, path)}:${index + 1}  ${namespace}-${value}`;
          const spell = (px: number) =>
            (NAMES_FOR.get(px) ?? []).map((n) => `${namespace}-${n}`).join(' or ');
          seen++;
          // Not a length. `min-w-0` is "may shrink below your content", not a measurement.
          if (value === '0') continue;
          // A fraction of the parent, which no scale describes.
          if (/^\d+\/\d+$/.test(value)) continue;

          if (/^\d+(?:\.\d+)?$/.test(value)) {
            const px = Number(value) * 4;
            off.push(
              NAMES_FOR.has(px)
                ? `${where} — ${value} steps of 0.25rem, where the table has ${spell(px)}`
                : `${where} — ${px}px written in rem; the table has no name for it, so write` +
                  ` the component's own dimension as ${namespace}-[${px}px]`,
            );
            continue;
          }

          const arbitrary = /^\[(.+)\]$/.exec(value);
          if (arbitrary) {
            const body = arbitrary[1];
            // `h-[1em]` is `Mark.tsx`'s rule and is deliberate: a mark is one em of the
            // text it sits in. `rem` is the defect this clause is named for, in brackets.
            if (/\drem\b/.test(body)) {
              off.push(`${where} — a box in rem, which is what a bare number already was`);
              continue;
            }
            const px = /^(\d+(?:\.\d+)?)px$/.exec(body);
            if (px && NAMES_FOR.has(Number(px[1])))
              off.push(`${where} — ${px[1]}px is ${spell(Number(px[1]))}, which says which floor it is`);
            continue;
          }

          if (BOX_KEYWORD.has(value)) continue;
          if (SPACING_NAMES.has(value)) {
            named++;
            continue;
          }
          off.push(`${where} — no --spacing-${value} is generated, so this class has no rule behind it`);
        }
      });
    }
    // A scan that stopped matching would report nothing and look like success. Seventy-five
    // box utilities across the web tree when this landed; the floor is here to catch a
    // regex that has stopped biting, not to ratchet.
    expect(seen, 'the scan found no box at all').toBeGreaterThan(60);
    // And the token spelling is reachable and reached, rather than being a namespace in
    // the stylesheet with nothing naming it — which is what `coreWiring.test.ts` reports
    // one layer up and §6.121 is about down here.
    expect(named, 'nothing on the web boxes itself by name').toBeGreaterThan(15);
    expect(off).toEqual([]);
  });
});
