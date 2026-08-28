import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SECTION, SECTION_FACE, SECTION_RULE } from '@reviewies/core/ui/section';
import { border, text, track } from '@reviewies/core/tokens';
import { declarationOf } from '@reviewies/core/test/source';

/**
 * `Section`, and the defect it exists to make impossible.
 *
 * task #156: the calendar's section heading and its day heading were byte-identical on the
 * phone — the same five properties, in the same order, in the same file — so `TODAY` and
 * the `NEXT TWO MONTHS` it sits inside were drawn the same. That is what happens when a
 * treatment is hand-copied twenty-three times instead of being a component: the copies
 * cannot disagree on purpose, only by accident.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist', '.expo'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(path, out);
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

describe('the section label', () => {
  it('separates its two levels on more than one channel', () => {
    /*
     * Four channels, and the clause counts them rather than naming one.
     *
     * A single-channel difference is the one that gets flattened again by the next person
     * tuning a value — which is precisely how the two calendar headings converged. Case,
     * tracking, ink and the rule are four independent facts, and the two levels have to
     * differ on at least three of them for the nesting to survive somebody adjusting one.
     */
    const differing = (['caps', 'track', 'ink', 'rule'] as const).filter(
      (key) => SECTION.section[key] !== SECTION.group[key],
    );
    expect(differing, `only ${differing.join(', ')} separate the two levels`).toHaveLength(4);

    // And the same size on both, deliberately: a step down does not exist and a step up
    // would make the subordinate heading the louder one.
    expect(SECTION.section.size).toBe(SECTION.group.size);
    expect(SECTION.section.size).toBe(text.s12);
  });

  it('reads its values from the token layer rather than holding its own', () => {
    expect(SECTION.section.track).toBe(track.t83);
    expect(SECTION.group.track).toBe(track.t0);
    expect(SECTION_RULE).toBe(border.hairline);
    expect(SECTION_FACE).toBe('title');
    // The source, not just the values: a literal that happens to equal a token is a
    // literal, and it stops equalling it the day the token moves.
    const source = read('core/src/ui/section.ts');
    expect(source).toContain('track: track.t83');
    expect(source, 'the rule thickness became a number').toContain('border.hairline');
    /*
     * Both levels' sizes, by level. `toContain('size: text.s12')` was true of the file with
     * either one of them replaced by a literal, because the other still said it — the two
     * levels are what make this file worth having and also what make a whole-file needle
     * useless. `clauses.test.ts` flagged the line.
     */
    for (const level of ['section', 'group'] as const) {
      const block = new RegExp(`\\n  ${level}: \\{([^{}]*)\\},`).exec(source)?.[1] ?? '';
      expect(block, `no ${level} block to read`).toBeTruthy();
      expect(block, `${level}'s size is a literal`).toContain('size: text.s12');
    }
  });

  it('is the only thing on either platform that draws an eyebrow', () => {
    /*
     * Fourteen web sites and nine phone sites wrote this by hand. The clause is what makes
     * the twenty-fourth impossible — and it reports what it scanned, so a rename cannot
     * turn it into an empty pass.
     */
    const WEB_EYEBROW = /tracking-t83[^"]*uppercase|uppercase[^"]*tracking-t83/;
    const web: string[] = [];
    let webFiles = 0;
    for (const file of filesUnder('app/src')) {
      if (file.endsWith('Section.tsx')) continue;
      webFiles++;
      for (const m of read(file).matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const cls = m[1] ?? m[2] ?? '';
        if (WEB_EYEBROW.test(cls)) web.push(`${file}: ${cls}`);
      }
    }
    expect(webFiles, 'no web files scanned, so this proved nothing').toBeGreaterThan(20);
    expect(web).toEqual([]);

    const phone: string[] = [];
    let phoneFiles = 0;
    for (const file of [...filesUnder('mobile/app'), ...filesUnder('mobile/src')]) {
      if (file.endsWith('Section.tsx')) continue;
      phoneFiles++;
      const src = read(file);
      /*
       * Two spellings, because the sweep found the second one only when `shape.test.ts`
       * noticed the two title screens had stopped matching. `title/[id].tsx` drew its
       * rating label with the tracking and the face but *no* `textTransform` — it called
       * `.toUpperCase()` on the copy string instead, so a clause looking for the transform
       * could not see an eyebrow that was plainly there.
       *
       * Tracking is the reliable tell: `t83` at `s12` is what an eyebrow is, whichever way
       * the capitals arrive.
       */
      if (/textTransform: 'uppercase'/.test(src)) phone.push(`${file}: textTransform`);
      /*
       * Tracked type *with nothing around it* is a label. `Row`'s tag is tracked at the
       * same step and is not one — it sits inside a hairline plate, which is what makes it
       * a chip rather than a heading. So the rule is the shape it is in, not a name on an
       * exemption list: a style with a border or a fill is a box, and a box is not an
       * eyebrow. §6.59 — a guard with a written excuse in it is not a guard.
       */
      for (const m of src.matchAll(/\n  (\w+): \{([^{}]*)\},/g)) {
        if (!/letterSpacing: tracking\(/.test(m[2])) continue;
        if (/border|backgroundColor/.test(m[2])) continue;
        phone.push(`${file}: ${m[1]} is a hand-drawn label`);
      }
    }
    expect(phoneFiles, 'no phone files scanned, so this proved nothing').toBeGreaterThan(20);
    expect(phone).toEqual([]);
  });

  it('is what the calendar draws both of its headings with, at two different levels', () => {
    /*
     * The screen task #156 is about, named. Both platforms: a `section` for the container and
     * a `group` for the days inside it, and neither drawn by hand.
     *
     * The web had a third defect the phone did not: it had no container heading at all, so
     * its day headings opened onto nothing and `group` would have had nothing to be
     * subordinate to. §6.51 — the better version wins whichever platform had it.
     */
    const web = read('app/src/screens/Calendar.tsx');
    expect(web).toContain('<Section className="px-1">Next two months</Section>');
    expect(web).toContain('<Section level="group"');
    const phone = read('mobile/app/calendar.tsx');
    expect(phone).toContain('<Section>Next two months</Section>');
    expect(phone).toContain('<Section level="group">{formatDay(day)}</Section>');
    // The two styles that used to be here, gone rather than merely unused.
    expect(declarationOf(phone, 'sectionHeading'), 'the hand-written style is back')
      .toBeUndefined();
    expect(declarationOf(phone, 'dayHeading'), 'the hand-written style is back')
      .toBeUndefined();
  });

  it('announces itself as a heading on the phone, which the web gets for free', () => {
    /*
     * React Native has no `<h2>`, so before this the role was a prop somebody had to
     * remember — one of the nine sites carried `accessibilityRole="header"` and eight did
     * not, which means eight section labels were read out as ordinary text. Owning the
     * treatment means owning that too.
     */
    const source = read('mobile/src/ui/Section.tsx');
    expect(source).toContain('accessibilityRole="header"');
    // Once, in the component, rather than at the call sites it replaced.
    const atCallSites = [...filesUnder('mobile/app'), ...filesUnder('mobile/src')]
      .filter((f) => !f.endsWith('Section.tsx'))
      .filter((f) => /<Section[\s>]/.test(read(f)) && /accessibilityRole="header"/.test(read(f)))
      .filter((f) => {
        // A screen may still have its own large title, which is a header and not a Section.
        const src = read(f);
        return /<Section[^>]*accessibilityRole/.test(src);
      });
    expect(atCallSites).toEqual([]);
  });

  it('keeps its own gap, so a call site cannot set a second one', () => {
    /*
     * Every site the sweep replaced carried `mb-2` or `mb-3` of its own. Left in place
     * beside the component's `mb-s8` those are two margin utilities on one element, and
     * which wins is a question about the order rules land in the stylesheet rather than
     * about anything in this file.
     */
    const offenders: string[] = [];
    for (const file of filesUnder('app/src')) {
      for (const m of read(file).matchAll(/<Section[^>]*className="([^"]*)"/g)) {
        if (/\bmb-/.test(m[1])) offenders.push(`${file}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
    expect(read('app/src/ui/Section.tsx'), 'the component stopped owning the gap')
      .toContain('mb-s8');
  });

  it('is a heading at a depth the table decides, on both platforms', () => {
    /*
     * The one decision this component did not own, and the two platforms disagreed about
     * it in different directions. The web defaulted **both** levels to `h2`, so a dateline
     * was a sibling of the section it sits inside; the phone set the role and no level, and
     * react-native-web reads `props.accessibilityLevel || props['aria-level']` and falls
     * back to `<h1>` — so `/data` rendered six top-level headings and no structure at all.
     *
     * Neither source looked wrong. One says `h2`, the other says `header`, and that is the
     * whole difficulty: a source-level clause reading either file finds exactly what it
     * should find. `mobile/smoke.mjs` reads the rendered outline, which is where it was
     * visible; this clause holds the number the two renderers both read.
     */
    expect(SECTION.section.depth).toBe(2);
    expect(SECTION.group.depth).toBe(3);
    // A dateline is inside its section, so it is deeper by exactly one. Two numbers that
    // happen to differ would satisfy the pair above; the relation is the decision.
    expect(SECTION.group.depth).toBe(SECTION.section.depth + 1);

    const web = read('app/src/ui/Section.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(web).toContain('SECTION[level].depth');
    /*
     * And the escape hatch cannot re-rank a heading any more. It used to accept
     * `'h2' | 'h3'` alongside `'p' | 'span'`, which made the depth a per-site opinion in
     * the two places somebody had already needed one; both of those sites want *no*
     * heading, which is a different thing and the only thing left.
     */
    expect(web, 'the as= escape hatch can pick a heading level again')
      .toMatch(/as\?: 'p' \| 'span';/);

    const phone = read('mobile/src/ui/Section.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(phone, 'the phone states a role with no level, which renders as h1')
      .toContain('aria-level={SECTION[level].depth}');
  });
});
