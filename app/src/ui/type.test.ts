import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { text, weight } from '@reviewies/core/tokens';
import { CHOICE_SIZE } from '@reviewies/core/ui/choice';
import { declarationOf } from '@reviewies/core/test/source';

/**
 * The type layer, and the one role that has been migrated onto it.
 *
 * §6.107 landed the scale — seven steps, chosen from a census of 168 `fontSize` literals
 * on the phone and 223 `text-*` classes on the web — and migrated the first batch: a
 * screen's title. That batch was chosen because it is where the layer's absence was
 * doing visible damage. The same role was **24px at weight 600 on the web and 30px at
 * weight 700 on the phone**, six points and a step apart, and until there was a scale
 * nothing could even say the two were the same role.
 *
 * This guard covers what has landed and no more. The other 340-odd sites still hold
 * literals; a clause that failed on them would have to be exempted 340 times, which is
 * a list nobody reads. What it *does* insist on is that the migrated role stays migrated
 * and that the two platforms keep answering it the same way.
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

/** Tailwind's own steps, which are the ones the scale replaces. */
const BUILT_IN = /\btext-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)\b/;

describe('the type scale', () => {
  it('is seven steps and nothing else', () => {
    // A magnitude name that does not match its value is the one way this file can lie.
    for (const [name, px] of Object.entries(text)) {
      expect(name, `${name} is not ${px}`).toBe(`s${px}`);
    }
    expect(Object.keys(text)).toEqual(['s11', 's12', 's14', 's16', 's20', 's24', 's30']);
  });

  it('reaches the web as utilities, generated rather than written', () => {
    const css = read('app/src/tokens.generated.css');
    for (const [name, px] of Object.entries(text)) {
      expect(css, `--text-${name} is missing`).toContain(`--text-${name}: ${px}px;`);
    }
    for (const [name, value] of Object.entries(weight)) {
      expect(css).toContain(`--font-weight-${name}: ${value};`);
    }
  });

  it('is what every screen title on the web is drawn at', () => {
    /*
     * Every `<h1>`, because a screen's title is the role that was migrated. Three of them
     * exist and each is named: a tab root's large title, a pushed screen's page heading,
     * and a detail screen's. What is forbidden is a *fourth* spelled as a Tailwind step,
     * which is what all twenty-one of them were.
     */
    const allowed = ['text-s30 font-bold', 'text-s24 font-semibold', 'text-s20 font-semibold'];
    // Four roles now, and the fourth is the one §6.110 found: a heading that is a
    // *sentence* under a screen's own title, which is not a screen title and was being
    // drawn as one.
    const ALLOWED_H2 = ['text-s20 font-semibold', 'text-s12 font-semibold'];
    const offenders: string[] = [];
    let seen = 0;
    for (const file of filesUnder('app/src')) {
      for (const m of read(file).matchAll(/<h1 className="([^"]*)"/g)) {
        seen++;
        const cls = m[1];
        if (BUILT_IN.test(cls)) offenders.push(`${file}: ${cls}`);
        else if (!allowed.some((a) => cls.includes(a))) offenders.push(`${file}: ${cls}`);
      }
    }
    // The count is a floor rather than a pin: a screen added later should be caught by the
    // clause above, not by a number somebody has to remember to raise. §6.94.
    expect(seen, 'nothing matched, so this proved nothing').toBeGreaterThan(15);
    expect(offenders).toEqual([]);

    /*
     * And the `<h2>`s, because that is where the first one went when it stopped being an
     * `<h1>`. Two treatments: a sentence heading under a screen title, and the eyebrow
     * every section on Stats and the calendar now uses.
     */
    const wrongH2: string[] = [];
    let h2s = 0;
    for (const file of filesUnder('app/src')) {
      for (const m of read(file).matchAll(/<h2 className="([^"]*)"/g)) {
        /*
         * The two roles that have been decided: an uppercase eyebrow, and a sentence
         * heading under a screen title. Six `<h2>`s carry no size at all and inherit the
         * body's 16 — a card's own title, which is a third role nobody has ruled on. They
         * are left, and left visible: this counts what it skipped rather than pretending
         * the screen is finished.
         */
        const decided = /uppercase/.test(m[1]) || /text-s\d/.test(m[1]);
        if (!decided) continue;
        h2s++;
        if (!ALLOWED_H2.some((a) => m[1].includes(a))) wrongH2.push(`${file}: ${m[1]}`);
      }
    }
    expect(h2s, 'no h2 matched, so this proved nothing').toBeGreaterThan(10);
    expect(wrongH2).toEqual([]);
  });

  it('is the whole of Up Next and the calendar, which is the batch that landed', () => {
    /*
     * §6.110. Two screens the product is actually about, migrated whole so each can be
     * photographed. The disagreements were written down before anything was touched:
     *
     *   arrival heading      web 30/700 (an <h1>)   phone 20/700 (under the title)
     *   day heading          web 14/600 UPPERCASE   phone 12, plain, no letter-spacing
     *   "Tell me about"      web 14/600 sentence    phone 12/600 UPPERCASE
     *   status notes ×6      web 12                 phone 13
     *   empty blurb          web inherited 16       phone 14
     *
     * Five roles, five disagreements, and the first is structural rather than a size: the
     * web's two arrival states returned a page with no screen title on them at all.
     */
    for (const path of ['mobile/app/(tabs)/index.tsx', 'mobile/app/calendar.tsx']) {
      expect(read(path), `${path} still holds a raw size`).not.toMatch(/fontSize: \d/);
      expect(read(path), `${path} still holds a raw weight`).not.toMatch(/fontWeight: '\d/);
    }
    for (const path of ['app/src/screens/UpNext.tsx', 'app/src/screens/Calendar.tsx']) {
      expect(read(path), `${path} still holds a Tailwind step`).not.toMatch(BUILT_IN);
    }
    // The structural half: every arrival state keeps the screen's own title.
    const upNext = read('app/src/screens/UpNext.tsx');
    expect((upNext.match(/>Up Next<\/h1>/g) ?? []).length, 'an arrival state lost its title')
      .toBe(4);
  });

  it('is what every tab root on the phone is drawn at, at the same step as the web', () => {
    /*
     * The point of the whole layer. The phone's five tab roots draw their own large title;
     * the web's five draw an `<h1>`; they were 30/700 and 24/600 and nobody had chosen
     * either. One step now, named in one place.
     */
    const roots = [
      'mobile/app/(tabs)/index.tsx',
      'mobile/app/(tabs)/search.tsx',
      'mobile/app/(tabs)/discover.tsx',
      'mobile/app/(tabs)/watchlist.tsx',
      'mobile/app/(tabs)/more.tsx',
    ];
    for (const file of roots) {
      const source = read(file);
      expect(source, `${file} draws its title from a literal`).toMatch(
        /heading: \{[^}]*fontSize: text\.s30[^}]*fontWeight: weight\.bold/,
      );
      expect(source, `${file} still has a raw 30`).not.toMatch(/fontSize: 30\b/);
    }
    // And the same step on the other side, so the two cannot be migrated apart. The screen's
    // own title, not any of the four `<h1>`s UpNext renders — the arrival and first-run
    // headings are on the same step and would have satisfied this with the title changed.
    expect(text.s30).toBe(30);
    const upNext = read('app/src/screens/UpNext.tsx');
    expect(upNext, "the web's Up Next title is off the step the phone's is on").toMatch(
      /<h1 className="[^"]*text-s30 font-bold">Up Next<\/h1>/,
    );
  });

  it('is what the crash screen says on both platforms, which nobody photographs', () => {
    /*
     * The second pair, and the one that shows the tab-root title was not a special case.
     * The screen a person sees when the app has fallen over said its own name at 24/600 on
     * the web and 18/600 on the phone — and 18 is not even a step, it is one of the four
     * this scale killed. Found by the clause above rather than by the migration, which
     * swept `app/src/screens` and missed a screen title living in `app/src/ui`.
     */
    expect(read('app/src/ui/ErrorBoundary.tsx')).toContain('text-s24 font-semibold');
    const phone = read('mobile/app/_layout.tsx');
    expect(phone).toMatch(/title: \{[^}]*fontSize: text\.s24[^}]*fontWeight: weight\.semibold/);
    expect(phone, 'the crash screen still has a raw 18').not.toMatch(/fontSize: 18\b/);
  });

  it('has a call site for every step, so the web actually generates them', () => {
    /*
     * Tailwind v4 is JIT: a utility exists only if its name appears in source text. A step
     * in the scale with no call site is a step that does not exist in the stylesheet, and
     * the first thing to use it would silently get nothing. §6.85 is the sprint that
     * learned this; the scale is new, so most steps have no call site yet.
     *
     * So this records the truth rather than asserting a future: which steps the web is
     * actually using today. When a batch migrates, this list grows with it — and if a step
     * is dropped from the source, the clause says so rather than leaving a dead token.
     */
    const source = filesUnder('app/src').map(read).join('\n');
    const used = Object.keys(text).filter((name) => source.includes(`text-${name}`));
    expect(used).toEqual(['s12', 's14', 's16', 's20', 's24', 's30']);
    // s11 has no call site yet, and Tailwind v4 is JIT, so `text-s11` does not exist in
    // the stylesheet. The first screen to reach for it has to be migrated, not sprinkled.
    expect(used).not.toContain('s11');
  });

  it('is where the two shared controls get their label size, rather than each side deciding', () => {
    /*
     * `Button` and `Choice` are the two controls every screen is made of, and both had
     * their label size decided twice. `SIZE.label` was 16/14/12 as bare numbers beside a
     * web file writing `text-base`/`text-sm`/`text-xs` — the same three sizes, agreeing by
     * hand. `Choice` was worse: it carried no size at all, so the web's chips inherited
     * the body's 16 while the phone's were 14, on all five screens that use it.
     */
    const button = read('core/src/ui/button.ts');
    expect(button).toContain('label: text.s16');
    expect(button).toContain('label: text.s14');
    expect(button).toContain('label: text.s12');
    const webButton = read('app/src/ui/Button.tsx');
    for (const step of ['text-s16', 'text-s14', 'text-s12']) {
      expect(webButton, `Button's ${step} row`).toContain(step);
    }

    /*
     * The values, imported, rather than the source text. `CHOICE_SIZE` has two densities
     * and both carry the same pair, so `toContain('label: text.s14')` could not say which
     * one it had found — and a clause that cannot tell them apart passes when one loses it.
     * Importing is strictly better than grepping wherever the thing is a value.
     */
    for (const density of ['chips', 'rows'] as const) {
      expect(CHOICE_SIZE[density].label, `${density} labels are off the scale`).toBe(text.s14);
      expect(CHOICE_SIZE[density].hint, `${density} hints are off the scale`).toBe(text.s12);
    }
    // The `label` style, not the file: `tick` reads the same value, so this passed with
    // the label's own size deleted. The exact plant §6.108 recorded, one file along.
    const phoneChoiceLabel = declarationOf(read('mobile/src/ui/Choice.tsx'), 'label');
    expect(phoneChoiceLabel, 'no label style to read').toBeDefined();
    expect(phoneChoiceLabel).toContain('CHOICE_SIZE.chips.label');
    /*
     * Both constants, by name. `toContain('text-s14')` passed with the chip's size deleted,
     * because the row's still had one — planted and not caught, which is §6.73 in a clause
     * written twenty minutes earlier for the third sprint running. A file containing a
     * string is not the control carrying it.
     */
    const webChoice = read('app/src/ui/Choice.tsx');
    for (const constant of ['CHIP', 'ROW']) {
      const line = new RegExp(`^const ${constant} = '([^']*)';$`, 'm').exec(webChoice);
      expect(line, `no ${constant} constant to read`).toBeTruthy();
      expect(line?.[1], `${constant} has no size, so it inherits`).toContain('text-s14');
    }
  });

  it('is the whole of Stats on both platforms, which is the batch that landed', () => {
    /*
     * One screen migrated whole, so it can be photographed and compared. Seven of its
     * eight paired roles disagreed before this: the figure tile at 22/700 against 20/600,
     * its label 12 against 14, the busiest-day note 13 against 14, the section eyebrow 12
     * against 14, the tally name 14 against an inherited 16, its time 12 against 14, its
     * count 11 against 12. Not one of those was a decision; they were two files.
     */
    const phone = read('mobile/app/stats.tsx');
    expect(phone, 'a raw size is back on the phone').not.toMatch(/fontSize: \d/);
    expect(phone, 'a raw weight is back on the phone').not.toMatch(/fontWeight: '\d/);
    const web = read('app/src/screens/Stats.tsx');
    expect(web, 'a Tailwind step is back on the web').not.toMatch(BUILT_IN);

    // And the pairs that were wrong, named so a future edit cannot quietly re-split them.
    expect(phone).toContain('fontSize: text.s20');   // the figure tile's value
    expect(web).toContain('text-s20 font-semibold'); // the same tile
    expect(declarationOf(phone, 'figureLabel'), 'the tile label is off the scale')
      .toContain('fontSize: text.s12');
    // The tile's own `<dt>`, not the tally count, which carries the same pair of classes.
    expect(web).toMatch(/<dt className="text-s12 text-ink-secondary">/);
  });
});
