import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { text, weight } from '@reviewies/core/tokens';

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
    // And the same step on the other side, so the two cannot be migrated apart.
    expect(text.s30).toBe(30);
    expect(read('app/src/screens/UpNext.tsx')).toContain('text-s30 font-bold');
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
    expect(used).toEqual(['s20', 's24', 's30']);
  });
});
