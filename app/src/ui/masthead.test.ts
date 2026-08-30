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

/**
 * The one file per platform allowed to draw this treatment, identified the way
 * `section.test.ts` identifies its own: **a component whose treatment is declared in
 * `core/src/ui/`**. Both halves are required — a screen that imports `ui/masthead` is not
 * the renderer, and a file renamed `Masthead.tsx` that imports nothing renders nothing —
 * so a call site cannot join the club by being renamed, and the renderer cannot leave it
 * by dropping the import.
 */
const declaresMasthead = (file: string) =>
  /\/Masthead\.tsx$/.test(file) && read(file).includes("from '@reviewies/core/ui/masthead'");

describe('a screen title', () => {
  it('is in the app\'s own face on a pushed screen too', () => {
    /*
     * The nine screens behind the tab roots were drawing their titles in React
     * Navigation's default — the platform system font, at whatever size it chose —
     * because `_layout.tsx` set `headerStyle` and `headerTintColor` and never
     * `headerTitleStyle`. Six sprints of type work stopped at the tab bar, and nothing
     * noticed because no clause reads the navigator's options and the titles *are*
     * headings, so the accessibility guards were satisfied.
     *
     * It is visible the moment two shots sit side by side: `03-upnext` is Archivo
     * Expanded Bold, `08-stats` was not Archivo at all. §6.130.
     *
     * `MASTHEAD.sub`, not `masthead`: a pushed screen is a step inside the app, which is
     * what the chevron beside it says. That pairing is deliberate and is not what this
     * clause is about — the typeface was.
     */
    const layout = read('mobile/app/_layout.tsx');
    expect(layout, 'the pushed header has no title style at all')
      .toMatch(/headerTitleStyle:/);
    expect(layout, 'the pushed header does not take the app face')
      .toMatch(/fontFamily: type\.family\[MASTHEAD\.sub\.face\]\.name/);
    expect(layout, 'the pushed header size is not on the scale')
      .toMatch(/fontSize: MASTHEAD\.sub\.size/);
  });

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
    /*
     * "Either platform", and for a sprint it meant one.
     *
     * Both loops below used to iterate `filesUnder('app/src')`, and the second one guarded
     * its own non-vacuity — `expect(seen).toBeGreaterThan(5)` — which is what made the
     * shortfall invisible. A clause that reports how much it scanned reads as thorough
     * whether or not it scanned the right thing, and nothing here counted phone files at
     * all because nothing here opened one. The phone half was **absent**, not empty, so
     * there was no zero for the non-vacuity guard to catch.
     *
     * It cost three live titles. `mobile/app/+not-found.tsx` drew `s20` where the web drew
     * `MASTHEAD.page`; `mobile/app/title/[id].tsx` and `mobile/app/_layout.tsx` each
     * restated a level's size, face and colour in a `StyleSheet`. None of the three
     * announced itself as a heading — measured, not inferred: served the export and read
     * the document, and `/+not-found` had exactly one heading in it, the navigator's
     * `<h1>Not found</h1>`, with "Nothing at this address" rendering as ordinary text
     * beneath it.
     */
    const SIZES = new Set<number>(Object.values(MASTHEAD).map((m) => m.size));
    const FACES = new Set<string>(Object.values(MASTHEAD).map((m) => m.face));

    /*
     * The sizes come from the table rather than from `(20|24|30)` written out here. The
     * spelling is the token one on both platforms — `text-s24` in a class list, `text.s24`
     * in a `StyleSheet` — so the class and the property both *contain* the key and the
     * sweep can be rebuilt from `MASTHEAD` instead of from a second hand-kept list that
     * stops agreeing with it the day a step moves. `choice.test.ts` §6.181 is the pattern.
     */
    const web: string[] = [];
    let webFiles = 0;
    for (const file of filesUnder('app/src')) {
      if (declaresMasthead(file)) continue;
      webFiles++;
      for (const m of read(file).matchAll(/<(h1|h2) className="([^"]*)"/g)) {
        const classes = m[2].split(/\s+/);
        if ([...SIZES].some((size) => classes.includes(`text-s${size}`))) {
          web.push(`${file}: ${m[2]}`);
        }
      }
    }
    expect(webFiles, 'no web files scanned, so this proved nothing').toBeGreaterThan(20);
    expect(web).toEqual([]);

    /*
     * The phone half, which has no tag to key on. React Native's heading is a `<Text>`
     * like every other, so what identifies a screen title is the treatment itself: one of
     * the table's three (size, face) pairs, in a `StyleSheet` entry.
     *
     * Both halves are needed and neither alone would do. Size alone fires on
     * `ReactionStream`'s `emoji: { fontSize: text.s24 }`, which is an emoji and not a
     * heading; face alone fires on every label in the app, because `title` is the face
     * most of the interface is set in. The pair is what `MASTHEAD` actually says.
     *
     * **The plant that survives it**, stated rather than left to be discovered: a raw
     * `fontSize: 24` beside the title face is a screen title this clause does not see,
     * because it looks for the token spelling. That one is not left open — `type.test.ts`'s
     * *"has no site left on either platform that names its own size"* fails on any
     * `fontSize: <digits>` in `mobile/`, checked by planting exactly that and watching it
     * fire. Two clauses, and neither is complete alone.
     *
     * `headerTitleStyle` in `_layout.tsx` is out of reach of the block scan by its
     * indentation and is meant to be: it is React Navigation's option rather than a `<Text>`
     * this app renders, it reads `MASTHEAD.sub.face` and `.size` from the table, and the
     * first clause in this file is what holds it there.
     */
    const phone: string[] = [];
    let phoneFiles = 0;
    for (const file of [...filesUnder('mobile/app'), ...filesUnder('mobile/src')]) {
      if (declaresMasthead(file)) continue;
      phoneFiles++;
      for (const m of read(file).matchAll(/\n {2}(\w+): \{([^{}]*)\},/g)) {
        const size = Number(/fontSize: text\.s(\d+)/.exec(m[2])?.[1]);
        const face = /fontFamily: type\.family\.(\w+)\.name/.exec(m[2])?.[1];
        if (SIZES.has(size) && face !== undefined && FACES.has(face)) {
          phone.push(`${file}: ${m[1]} draws s${size} in ${face} by hand`);
        } else if (/\bMASTHEAD\./.test(m[2])) {
          /*
           * And a style that reads the table is still a hand-drawn title. This is the
           * plant that would otherwise survive the pair above: swap `text.s20` for
           * `MASTHEAD.sub.size` and the treatment can no longer drift, but the `<Text>`
           * carrying it still announces itself as ordinary text, which is the half of
           * the defect that `mobile/src/ui/Masthead.tsx` exists for and the half a
           * type-only sweep cannot see.
           */
          phone.push(`${file}: ${m[1]} reads MASTHEAD outside the renderer`);
        }
      }

      /*
       * And the same pair in an **inline** style, which the block scan above cannot see.
       *
       * Found by re-planting after the merge rather than by reading: a `<Text>` carrying
       * `style={{ fontSize: text.s24, color: theme.ink, fontFamily: type.family.title.name }}`
       * in `+not-found.tsx` walked straight through the clause that had just been written to
       * catch exactly that, because the phone half keys on a two-space-indented `StyleSheet`
       * entry and an inline object has neither the indentation nor the trailing comma.
       *
       * `type.test.ts`'s digit sweep does not cover it either — this spells the size with the
       * token, which is the thing that sweep permits. So it was open on both sides, and it is
       * the ordinary way to write a one-off style in React Native. No file in `mobile/` has an
       * inline `fontSize` today; this is what keeps it that way.
       */
      for (const m of read(file).matchAll(/style=\{\{([^{}]*)\}\}/g)) {
        const size = Number(/fontSize: text\.s(\d+)/.exec(m[1])?.[1]);
        const face = /fontFamily: type\.family\.(\w+)\.name/.exec(m[1])?.[1];
        if (SIZES.has(size) && face !== undefined && FACES.has(face)) {
          phone.push(`${file}: an inline style draws s${size} in ${face} by hand`);
        }
      }
    }
    expect(phoneFiles, 'no phone files scanned, so this proved nothing').toBeGreaterThan(20);
    expect(phone).toEqual([]);

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
