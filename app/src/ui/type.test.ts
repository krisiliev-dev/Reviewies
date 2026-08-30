import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { text, track, type, weight } from '@reviewies/core/tokens';
import { CHOICE_SIZE } from '@reviewies/core/ui/choice';
import { LABEL_FACE } from '@reviewies/core/ui/button';
import { declarationOf, styleOf } from '@reviewies/core/test/source';

/**
 * The type layer, now that every site is on it.
 *
 * §6.107 landed the scale and the first role. This file used to say "covers what has
 * landed and no more" and listed the 340 sites still holding literals; there are none. So
 * the clauses stop being an allowlist of migrated screens and become the four facts a type
 * site has — size, face, weight, tracking — each with exactly one owner:
 *
 * - **size** — `text.sNN`, six steps. No raw number on the phone, no Tailwind step and no
 *   arbitrary `text-[…]` on the web. `text-[0.625rem]` was the hole the ban on `text-[Npx]`
 *   left open, and three sites were living in it.
 * - **face** — `type.family.<role>`, six files.
 * - **weight** — *not a fact the site gets to state on the phone*, because a weight is a
 *   file: React Native ignores `fontWeight` beside a `fontFamily` on Android and
 *   synthesises it on iOS. On the web it must be stated, and must be the one that face's
 *   file has, or the browser draws a fake bold out of Archivo 400 or picks Narrow Bold out
 *   of the same stack for something that asked for SemiBold.
 * - **tracking** — `track.tNN`, in em. The phone derives points; the web emits em.
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

/** Tailwind's own steps, and its escape hatch, which are the two things the scale replaces. */
const BUILT_IN = /\btext-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)\b|\btext-\[/;

/** The utility names Tailwind generates from the `weight` table. */
const WEIGHT_CLASS = Object.fromEntries(
  Object.entries(weight).map(([name, value]) => [value, `font-${name}`]),
) as Record<string, string>;

describe('the type scale', () => {
  it('is six steps and nothing else', () => {
    // A magnitude name that does not match its value is the one way this file can lie.
    for (const [name, px] of Object.entries(text)) {
      expect(name, `${name} is not ${px}`).toBe(`s${px}`);
    }
    expect(Object.keys(text)).toEqual(['s12', 's14', 's16', 's20', 's24', 's30']);
  });

  it('reaches the web as utilities, generated rather than written', () => {
    const css = read('app/src/tokens.generated.css');
    for (const [name, px] of Object.entries(text)) {
      expect(css, `--text-${name} is missing`).toContain(`--text-${name}: ${px}px;`);
    }
    for (const [name, value] of Object.entries(weight)) {
      expect(css).toContain(`--font-weight-${name}: ${value};`);
    }
    for (const [name, em] of Object.entries(track)) {
      expect(css, `--tracking-${name} is missing`).toContain(`--tracking-${name}: ${em}em;`);
    }
  });

  it('has no site left on either platform that names its own size', () => {
    /*
     * The end of the census. 222 `fontSize` literals on the phone and 223 `text-*` classes
     * on the web when this started; the last two were the tab bar's label and glyph, which
     * live in a navigator's options rather than in a StyleSheet and had been walked past
     * four times.
     */
    const phone: string[] = [];
    for (const file of [...filesUnder('mobile/app'), ...filesUnder('mobile/src')]) {
      for (const m of read(file).matchAll(/fontSize: \d+/g)) phone.push(`${file}: ${m[0]}`);
    }
    expect(phone).toEqual([]);

    const web: string[] = [];
    for (const file of filesUnder('app/src')) {
      for (const m of read(file).matchAll(/\bclassName=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const cls = m[1] ?? m[2] ?? '';
        if (BUILT_IN.test(cls)) web.push(`${file}: ${cls}`);
      }
      // And the class strings that live in a constant rather than in an attribute.
      for (const m of read(file).matchAll(/^const [A-Z_]+ =\s*'([^']*)';/gm)) {
        if (BUILT_IN.test(m[1])) web.push(`${file}: ${m[1]}`);
      }
    }
    expect(web).toEqual([]);
  });

  it('never lets the phone state a weight, because a weight is a file', () => {
    /*
     * React Native will not synthesise a weight for a named family. On Android the
     * `fontWeight` beside a `fontFamily` is dropped; on iOS it is applied *on top of* a
     * file that already has the weight, which is a smeared heading that a screenshot from a
     * simulator on a Mac will not show as wrong.
     *
     * Sixteen sprints of migrated styles carried the pair — `fontWeight: weight.bold`
     * beside `fontFamily: type.family.display.name` on all five tab roots — because the
     * token file said "a weight is a file" and the migration wrote the weight anyway.
     */
    const offenders: string[] = [];
    for (const file of [...filesUnder('mobile/app'), ...filesUnder('mobile/src')]) {
      for (const m of read(file).matchAll(/fontWeight: [^,}\n]+/g)) offenders.push(`${file}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  it('never lets the web state a weight the face it is on does not have', () => {
    /*
     * The same defect, mirrored. A browser will happily synthesise, which is worse than
     * dropping it: `font-body font-semibold` drew a fake bold out of Archivo 400, and
     * `font-display font-semibold` picked Archivo Narrow *SemiBold* out of the stack the
     * bold face shares — so the phone and the web were drawing the same heading in two
     * different files and both looked plausible.
     *
     * Two clauses in one, and the second is the one that matters: a weight class with no
     * face is a weight applied to the body face, which has exactly one file.
     */
    const faceClass = Object.fromEntries(
      Object.entries(type.family).map(([role, face]) => [
        `font-${role.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}`,
        WEIGHT_CLASS[face.weight],
      ]),
    );
    const weightClasses = Object.values(WEIGHT_CLASS);

    const offenders: string[] = [];
    let seen = 0;
    for (const file of filesUnder('app/src')) {
      const source = read(file);
      const strings = [
        ...[...source.matchAll(/\bclassName=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map((m) => m[1] ?? m[2] ?? ''),
        ...[...source.matchAll(/^const [A-Z_]+ =\s*'([^']*)';/gm)].map((m) => m[1]),
      ];
      for (const cls of strings) {
        const words = cls.split(/[\s`${}?:'"]+/);
        const faces = Object.keys(faceClass).filter((f) => words.includes(f));
        const weights = weightClasses.filter((w) => words.includes(w));
        if (!faces.length && !weights.length) continue;
        seen++;
        if (!faces.length) {
          offenders.push(`${file}: ${weights.join(' ')} with no face — ${cls.trim()}`);
          continue;
        }
        for (const face of faces) {
          if (!words.includes(faceClass[face])) {
            offenders.push(`${file}: ${face} without ${faceClass[face]} — ${cls.trim()}`);
          }
          for (const w of weights) {
            if (w !== faceClass[face]) offenders.push(`${file}: ${face} with ${w} — ${cls.trim()}`);
          }
        }
      }
    }
    /*
     * 31, down from 45, and falling every sprint as components take treatments off the
     * screens. The population shrinks; the rule does not. The floor tracks it rather than
     * being left slack above it — §6.107's lesson, several components later.
     */
    /*
     * 24, down from 25: §6.131's call-site migration. `Button` carries `font-title` for
     * every one of the nineteen controls that used to state it themselves.
     *
     * 23, down from 24: §6.144. `CrossOff`'s `tick` and two `chevron` styles named a face
     * because they were drawing glyphs; the marks are paths now and a path has no face to
     * name. The population shrinks as the drawings take over, which is the same direction
     * the note above records and a different reason for it.
     */
    expect(seen, 'nothing carried a face or a weight, so this proved nothing').toBeGreaterThan(23);
    expect(offenders).toEqual([]);
  });

  it('derives tracking from the token on both sides, in em', () => {
    /*
     * The fourth fact, and the last one nothing owned. The phone wrote `letterSpacing: 1`
     * at size 12 in six files; the web wrote Tailwind's `tracking-wide`, which is 0.025em —
     * a third of it. One role, two platforms, three times apart, and no test could see it
     * because neither number had a name.
     *
     * Points is the reason it is a token rather than a constant: stored as 1, tracking
     * holds still while the glyphs double at 200% Dynamic Type and the tracked caps close
     * into a block.
     */
    const phone: string[] = [];
    for (const file of [...filesUnder('mobile/app'), ...filesUnder('mobile/src')]) {
      for (const m of read(file).matchAll(/letterSpacing: [^;\n]+/g)) {
        /*
         * `tracking(<a size>, track.tNN)`. The size may be `text.s12` at a screen, or a
         * component's own table entry — `SECTION.section.size`, which is `text.s12` one
         * indirection along. Requiring the literal would have made `Section` illegal for
         * doing the thing this clause is for.
         */
        if (!/tracking\((?:text\.s\d+|[A-Z][\w.]*\.size), track\.t\d+\)/.test(m[0])) {
          phone.push(`${file}: ${m[0]}`);
        }
      }
    }
    expect(phone).toEqual([]);

    const web: string[] = [];
    for (const file of filesUnder('app/src')) {
      for (const m of read(file).matchAll(/\btracking-[a-z0-9]+/g)) {
        if (!Object.keys(track).some((name) => m[0] === `tracking-${name}`)) {
          web.push(`${file}: ${m[0]}`);
        }
      }
    }
    expect(web).toEqual([]);
    // And the derivation itself, which is the one RN-specific thing the token cannot do.
    expect(read('mobile/src/ui/theme.ts')).toContain('return size * em;');
  });

  it('is what every screen title on the web is drawn at', () => {
    /*
     * One component now, not twenty-four `<h1>`s.
     *
     * This clause used to read every `<h1 className>` in `app/src` and check size, face and
     * weight as three facts. §6.119 moved all of them onto `Masthead`, so there is nothing
     * at the call sites left to read — which is the point rather than a loss: what it
     * checked per site, `masthead.test.ts` checks once, plus the gap underneath, which no
     * per-site grep could see because seven different margins all looked deliberate.
     */
    const masthead = read('app/src/ui/Masthead.tsx');
    const allowed = [
      { size: 'text-s30', face: 'font-display', weight: 'font-bold' },
      { size: 'text-s24', face: 'font-title', weight: 'font-semibold' },
      { size: 'text-s20', face: 'font-title', weight: 'font-semibold' },
    ];
    const wears = (cls: string, role: (typeof allowed)[number]) =>
      cls.includes(role.size) && cls.includes(role.face) && cls.includes(role.weight);
    const levels = [...masthead.matchAll(/^ {2}(\w+): '([^']*)',$/gm)].map((m) => m[2]);
    expect(levels, 'no level classes to read').toHaveLength(3);
    for (const cls of levels) {
      expect(BUILT_IN.test(cls), `${cls} is off the scale`).toBe(false);
      expect(allowed.some((role) => wears(cls, role)), `${cls} is not one of the three`).toBe(true);
    }

    // And nothing draws a title by hand any more, which is what makes the above sufficient.
    const offenders: string[] = [];
    for (const file of filesUnder('app/src')) {
      if (file.endsWith('ui/Masthead.tsx')) continue;
      for (const m of read(file).matchAll(/<(h1|h2) className="([^"]*)"/g)) {
        if (/text-s(20|24|30)\b/.test(m[2])) offenders.push(`${file}: ${m[2]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('is what every tab root on the phone is drawn at, at the same step as the web', () => {
    /*
     * The point of the whole layer. The phone's five tab roots drew their own large title and
     * the web's five drew an `<h1>`; they were 30/700 and 24/600 and nobody had chosen either.
     *
     * They read one component each now, so this reads the components — and the thing it could
     * never see before is in the table with them: three of the five phone roots set
     * `marginBottom: 8` and two set nothing.
     */
    const roots = [
      'mobile/app/(tabs)/index.tsx',
      'mobile/app/(tabs)/search.tsx',
      'mobile/app/(tabs)/discover.tsx',
      'mobile/app/(tabs)/watchlist.tsx',
      'mobile/app/(tabs)/more.tsx',
    ];
    for (const file of roots) {
      expect(read(file), `${file} draws its own title`).toContain('<Masthead>');
      expect(declarationOf(read(file), 'heading'), `${file} kept a heading style`).toBeUndefined();
    }
    expect(text.s30).toBe(30);
    const phone = read('mobile/src/ui/Masthead.tsx');
    expect(phone).toContain('type.family[MASTHEAD.masthead.face].name');
    expect(phone).toContain('fontSize: MASTHEAD.masthead.size');

    /*
     * The structural half of §6.110: every arrival state keeps the screen's own title.
     *
     * It counted `>Up Next</Masthead>` until §6.176 gave that title an owner, and then it
     * counted zero — a clause reading a literal that had moved, which is the cost this
     * whole sprint was measuring and the reason it is a *reference* here now. The four is
     * unchanged: four arrival states, four titles.
     */
    const upNext = read('app/src/screens/UpNext.tsx');
    expect(
      (upNext.match(/\{COPY\.upNext\.name\}<\/Masthead>/g) ?? []).length,
      'an arrival state lost its title',
    ).toBe(4);
  });

  it('is what the crash screen says on both platforms, which nobody photographs', () => {
    /*
     * The second pair, and the one that shows the tab-root title was not a special case.
     * The screen a person sees when the app has fallen over said its own name at 24/600 on
     * the web and 18/600 on the phone — and 18 is not even a step, it is one of the four
     * this scale killed. Found by the clause above rather than by the migration, which
     * swept `app/src/screens` and missed a screen title living in `app/src/ui`.
     */
    expect(read('app/src/ui/ErrorBoundary.tsx')).toContain('<Masthead level="page">');
    const title = declarationOf(read('mobile/app/_layout.tsx'), 'title');
    expect(title, 'the crash screen has no title style').toBeDefined();
    expect(title).toContain('fontSize: text.s24');
    expect(title).toContain('fontFamily: type.family.title.name');
  });

  it('has a call site for every step, so the web actually generates them', () => {
    /*
     * Tailwind v4 is JIT: a utility exists only if its name appears in source text. A step
     * in the scale with no call site is a step that does not exist in the stylesheet, and
     * the first thing to use it would silently get nothing. §6.85 is the sprint that
     * learned this.
     *
     * `s11` is what this clause was for. It recorded, sprint after sprint, that nothing
     * used it — and in stage 2 the last site that could have wanted it, the tab bar's own
     * 10pt label, folded to `s12` instead. So the step left the scale rather than staying
     * in it as a number the stylesheet does not contain.
     */
    const source = filesUnder('app/src').map(read).join('\n');
    const used = Object.keys(text).filter((name) => source.includes(`text-${name}`));
    expect(used).toEqual(['s12', 's14', 's16', 's20', 's24', 's30']);
    expect(used).toEqual(Object.keys(text));

    // The same for the faces, which are utilities on exactly the same terms.
    /*
     * The faces are utilities on exactly the same terms — with one deliberate absence.
     * `font-body` has no call site and should not have one: `index.css` sets the body face
     * on `body`, so every paragraph on the web inherits it and a class at the site would be
     * 170 repetitions of the default. The phone has no cascade and names it at every site;
     * that asymmetry is the platforms differing, not the token layer drifting.
     */
    const faces = Object.keys(type.family)
      .map((role) => `font-${role.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}`)
      .filter((cls) => source.includes(cls));
    expect(faces).toEqual(['font-display', 'font-title', 'font-data', 'font-prose']);
    expect(read('app/src/index.css'), 'the web body face stopped being set on body')
      .toContain('font-family: var(--font-body)');
  });

  it('is where the two shared controls get their label size and face, rather than each side deciding', () => {
    /*
     * `Button` and `Choice` are the two controls every screen is made of, and both had
     * their label size decided twice. `SIZE.label` was 16/14/12 as bare numbers beside a
     * web file writing `text-base`/`text-sm`/`text-xs` — the same three sizes, agreeing by
     * hand. `Choice` was worse: it carried no size at all, so the web's chips inherited
     * the body's 16 while the phone's were 14, on all five screens that use it.
     *
     * Stage 2 added the face to the same table, for the same reason and one better: the
     * two sides were writing *different weights* — 600/700 on the phone, medium/semibold on
     * the web — for a state neither platform can draw with a weight.
     */
    const button = read('core/src/ui/button.ts');
    expect(button).toContain('label: text.s16');
    expect(button).toContain('label: text.s14');
    expect(button).toContain('label: text.s12');
    expect(LABEL_FACE, 'a button label is the title face on both sides').toBe('title');
    const webButton = read('app/src/ui/Button.tsx');
    for (const step of ['text-s16', 'text-s14', 'text-s12']) {
      expect(webButton, `Button's ${step} row`).toContain(step);
    }
    // The base class string, not the file: `SELECTED_CLASS` also mentions the face, so
    // `toContain('font-title')` passed with the label's own face deleted. §6.109.
    expect(webButton, 'the web button lost its face').toMatch(
      /'inline-flex[^']*\bfont-title\b[^']*'/,
    );
    expect(declarationOf(read('mobile/src/ui/Button.tsx'), 'label')).toContain(
      'fontFamily: type.family[LABEL_FACE].name',
    );

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
    expect(phoneChoiceLabel).toContain('fontFamily: type.family.title.name');
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
      expect(line?.[1], `${constant} has no face, so it inherits`).toContain('font-title');
    }
  });

  it('sets every figure in the data face, on both platforms', () => {
    /*
     * The role the scale kept flattening. A figure tile, a sync backlog, a running clock
     * and an episode code are the same thing — a number you read rather than a word — and
     * they were `font-semibold tabular-nums` on the web and a bare size on the phone, which
     * is a proportional face with the digits nudged into columns.
     *
     * Named rather than counted, because a count is what let §6.108 pass: these are the
     * four places a number is the content.
     */
    /*
     * One component now, rather than a needle per screen. §6.114 pulled every figure onto
     * `Data`; what this clause used to check per site, `data.test.ts` checks once and in
     * more detail — including that the *unit* stays out of the mono face, which is the
     * half a per-screen grep could never see.
     */
    expect(read('app/src/screens/Stats.tsx'), 'the web tile stopped going through Data')
      .toContain('<Data value={value} size="s20" />');
    for (const [file, needle] of [
      ['app/src/screens/AccountPanel.tsx', '<Data value={pending} size="s20" />'],
      ['app/src/screens/More.tsx', '<Data value={value} size="s20" />'],
      // `Settings.tsx` was here and draws no figure any more: its copy of More's
      // "everything lives on this device" block was a duplicate and went in §6.133. The
      // entry goes with the thing it named rather than being left to fail one day for a
      // reason nobody can reconstruct.

      ['app/src/screens/WatchingMode.tsx', '<Data value={formatTimecode(clock.positionMs)}'],
    ] as const) {
      expect(read(file), `${file} draws a figure in the body face`).toContain(needle);
    }
    const phone = read('mobile/app/stats.tsx');
    expect(phone, 'the phone tile stopped going through Data')
      .toContain('<Data value={value} size="s20" style={styles.figureValue} />');
    expect(styleOf(phone, 'figureLabel'), 'the tile label is off the scale')
      .toContain('fontSize: text.s12');
    expect(read('mobile/app/watching/[targetId].tsx'), 'the clock stopped going through Data')
      .toContain('<Data value={formatTimecode(clock.positionMs)}');
  });
});
