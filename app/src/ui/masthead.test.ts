import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MASTHEAD } from '@reviewies/core/ui/masthead';
import { space, text, type } from '@reviewies/core/tokens';

/**
 * `Masthead`, and the thing a type guard could not see.
 *
 * The three treatments have been right since §6.112 and `type.test.ts` held them. What
 * nothing held is **the space around them**: twenty-four `<h1>`s on the web carried seven
 * different spacings — `mb-1`, `mb-2`, `mb-3`, `mb-4`, none, with and without `px-1` — and on
 * the phone three of the five tab roots set `marginBottom: 8` inside their heading style
 * while two set nothing, so two screens' titles sat against their content and three did not.
 *
 * The type was uniform because a guard made it so. The gap was not, because a per-site grep
 * cannot tell a decision from an accident when every value looks deliberate.
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

describe('a screen title', () => {
  it('carries one gap per treatment, on the scale', () => {
    /*
     * The finding, as a rule. Seven spacings across three treatments is one decision made
     * four extra times; three now, each named, each a step.
     */
    expect(MASTHEAD.masthead.gapBelow).toBe(space.s16);
    expect(MASTHEAD.page.gapBelow).toBe(space.s12);
    /*
     * And `sub` is zero, which is not a step and is not meant to be. A sub-heading introduces
     * the block directly under it, so a gap would separate it from the thing it introduces.
     * Absence is the decision, written as `0` rather than dressed up as a token.
     */
    expect(MASTHEAD.sub.gapBelow).toBe(0);
    expect(Object.values(space), 'zero became a spacing step').not.toContain(0);

    // The two that are gaps are steps, so nobody can nudge one to 10.
    for (const level of ['masthead', 'page'] as const) {
      expect(Object.values(space), `${level}'s gap is off the scale`)
        .toContain(MASTHEAD[level].gapBelow);
    }
  });

  it('is on the scale and in a face that exists, at all three levels', () => {
    expect(MASTHEAD.masthead.size).toBe(text.s30);
    expect(MASTHEAD.page.size).toBe(text.s24);
    expect(MASTHEAD.sub.size).toBe(text.s20);
    for (const level of ['masthead', 'page', 'sub'] as const) {
      const face = MASTHEAD[level].face;
      expect(Object.keys(type.family), `${level}'s face is not a face`).toContain(face);
      /*
       * The weight is the face's file, not a choice. §6.113: `font-display font-semibold` was
       * a contradiction the browser resolved silently by picking Narrow SemiBold out of the
       * bold face's own stack.
       */
      const expected = { '700': 'bold', '600': 'semibold' }[type.family[face].weight];
      expect(MASTHEAD[level].weight, `${level} states a weight ${face} has no file for`)
        .toBe(expected);
    }
  });

  it('is the only thing on either platform that draws a screen title', () => {
    const web: string[] = [];
    for (const file of filesUnder('app/src')) {
      if (file.endsWith('ui/Masthead.tsx')) continue;
      for (const m of read(file).matchAll(/<(h1|h2) className="([^"]*)"/g)) {
        if (/text-s(20|24|30)\b/.test(m[2])) web.push(`${file}: ${m[2]}`);
      }
    }
    expect(web).toEqual([]);

    // And no call site sets its own gap, which is the whole of what went wrong.
    const gaps: string[] = [];
    let seen = 0;
    for (const file of filesUnder('app/src')) {
      for (const m of read(file).matchAll(/<Masthead[^>]*className="([^"]*)"/g)) {
        seen++;
        if (/\bmb-/.test(m[1])) gaps.push(`${file}: ${m[1]}`);
      }
    }
    expect(seen, 'no masthead carried a className, so this proved nothing').toBeGreaterThan(5);
    expect(gaps).toEqual([]);
  });

  it('announces itself as a heading on the phone, which the web gets from h1', () => {
    /*
     * The same reason `Section` owns it: React Native has no `<h1>`, so the role is a prop
     * somebody has to remember, and the nine pushed screens — which this component does *not*
     * cover yet — are the proof that somebody eventually does not.
     */
    /*
     * Code, not prose: the component's own paragraph explains why the role lives here, so a
     * whole-file `toContain` was satisfied by the explanation. `clauses.test.ts` said so
     * before this was committed rather than after, which is what the brief asked for and the
     * cheaper way round.
     */
    const phone = read('mobile/src/ui/Masthead.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(phone).toContain('accessibilityRole="header"');
    const atCallSites: string[] = [];
    for (const file of [...filesUnder('mobile/app'), ...filesUnder('mobile/src')]) {
      if (file.endsWith('ui/Masthead.tsx')) continue;
      for (const m of read(file).matchAll(/<Masthead[^>]*accessibilityRole/g)) {
        atCallSites.push(`${file}: ${m[0]}`);
      }
    }
    expect(atCallSites).toEqual([]);
  });

  it('states a heading level, because the role alone renders as h1', () => {
    /*
     * The finding this clause replaces the last one with.
     *
     * There used to be a clause here recording that the phone's pushed screens do not use
     * this component and pinning `<Stack.Screen options={{ title` at fourteen, on the
     * strength of a sentence in `docs/design/components.md` §3: *"the nine pushed screens
     * get `accessibilityRole="header"` for the first time — on the web export today their
     * titles are not headers at all."*
     *
     * That sentence is false. expo-router's `HeaderTitle` renders
     * `role="heading" aria-level="1"`, and reading the export confirms it: `/stats` is
     * `<h1 role="heading" aria-level="1">Stats</h1>`. The clause asserted the premise
     * rather than the fact, so it passed for a week while being wrong — and I wrote it.
     *
     * Reading the document for that answer produced the real one. Every *other* heading
     * on the phone was an `<h1>`: react-native-web falls back to `h1` when neither
     * `accessibilityLevel` nor `aria-level` is given, and neither renderer gave one.
     * `/data` had six. So the depth now lives in the table, both platforms read it, and
     * `mobile/smoke.mjs` reads the rendered outline — because that is the only place the
     * defect was ever visible.
     */
    expect(MASTHEAD.masthead.depth).toBe(1);
    expect(MASTHEAD.page.depth).toBe(1);
    expect(MASTHEAD.sub.depth).toBe(2);

    // The web takes its tag from the table rather than restating the rule in JSX, which
    // is how the two platforms came to disagree in the first place.
    const web = read('app/src/ui/Masthead.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(web, 'the web went back to naming its own heading tag')
      .not.toMatch(/'h[1-6]'/);
    expect(web).toContain('MASTHEAD[level].depth');

    // And the phone passes it, which is the half that was missing entirely.
    const phone = read('mobile/src/ui/Masthead.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(phone, 'the phone states a role with no level, which renders as h1')
      .toContain('aria-level={MASTHEAD[level].depth}');
  });
});
