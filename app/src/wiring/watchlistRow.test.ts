import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COPY } from '@reviewies/core/copy';

/**
 * What a watchlist row offers, and what a control is allowed to be called.
 *
 * §6.167 asked what the watchlist screen is *for*. It is things you mean to watch, and an
 * intention resolves two ways: you start it, or you give up on it. `06-watchlist.png` drew
 * only the second — *Remove* was the one element on the row wearing a control's shape —
 * while `05-discover.png` offers the very same film with **Track** and **Watchlist** side
 * by side. Two screens, one title, and only the one you already saved it on refuses to let
 * you begin it.
 *
 * Two things came out of that and both can be held:
 *
 * 1. **Tracking from the watchlist is one act.** `startWatching` adds to the library and
 *    takes the title off the list, in that order, in `repo.ts`. Four screens calling
 *    `addToLibrary` and `removeFromWatchlist` by hand is four chances to get the order
 *    backwards — and losing a title from both lists is the failure that order prevents.
 * 2. **A control is called by a verb.** *"Caught up further?"* was the only question mark
 *    on any control in the product, on a screen whose other controls are *Track*, *Remove*,
 *    *Save*, *Pause*, *Hold*. Its own announced name was already `Catch up on {show}`, so
 *    the label and the name disagreed about what the control was.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const withoutProse = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const WATCHLISTS = ['app/src/screens/Watchlist.tsx', 'mobile/app/(tabs)/watchlist.tsx'];
const TREES = ['app/src', 'mobile/app', 'mobile/src'];

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist', 'dist-signedin', 'dist-real', '.expo'].includes(entry.name)) continue;
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) filesUnder(path, out);
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

/** The phone's own trees, walked so the rule below can find its own subjects. */
function phoneFilesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist', 'dist-signedin', 'dist-real', '.expo'].includes(entry.name)) {
      continue;
    }
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) phoneFilesUnder(path, out);
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

describe('a watchlist row', () => {
  it('offers the verb the list exists for, on both platforms', () => {
    for (const file of WATCHLISTS) {
      const source = withoutProse(read(file));
      /*
       * The `label`, not the word anywhere in the file. `toContain('COPY.controls.track')`
       * was the first draft and a plant walked through it: `COPY.controls.trackTitle` —
       * the *announced* name, on the same call — contains that string, so the drawn label
       * could be deleted outright and the clause stayed green. §6.121, in a substring.
       */
      expect(source, `${file} draws no way to start what you saved`).toMatch(
        /label=\{COPY\.controls\.track\}/,
      );
      expect(source, `${file} does not say which title it would start`).toContain(
        'COPY.controls.trackTitle',
      );
      // And still the way out. A screen that can only be added to is its own defect.
      expect(source, `${file} draws no way off the list`).toContain('removeFromWatchlist');
    }
  });

  it('starts something through the one call that also takes it off the list', () => {
    /*
     * The half that matters, and the one a screen can quietly get wrong: `addToLibrary`
     * alone leaves the title tracked *and* still saved, which `discover/recommend.ts`
     * then excludes twice while the two lists say contradictory things about it.
     */
    const wrong: string[] = [];
    for (const file of WATCHLISTS) {
      const source = withoutProse(read(file));
      if (!source.includes('startWatching')) wrong.push(`${file} does not call startWatching`);
      if (/\baddToLibrary\b/.test(source)) {
        wrong.push(`${file} tracks with addToLibrary, so the title stays on the watchlist`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('puts the note field and its Save on one line, wherever the phone draws that pair', () => {
    /*
     * `size="inline"` is a request the parent can refuse, and a column refuses it silently.
     *
     * `06-watchlist-editing.png`, read for the first time: the *Save* beside the note runs
     * the full width of the row — measured off the shot at 2x, **358 x 44pt**, from the
     * screen's left edge to its right — while *Track* directly under it, which asks for no
     * size at all and therefore gets `row`, hugs its label at 63pt. The louder control by a
     * factor of five and a half is the one that stores a sentence about why you saved
     * something; the one that starts watching it is the small pill underneath.
     *
     * Nothing about the button is wrong. `SIZE.inline` is 8/4 padding around a 12pt label
     * and the pill measures its 44pt floor exactly. The width comes from the box around it:
     * `styles.editor` was `{ gap: 6 }`, and React Native lays a `View` as a **column** whose
     * `alignItems` defaults to `stretch`, so the field and the button became two stacked
     * full-width rows. The web's twin has always been `flex gap-1.5` with the field on
     * `min-w-0 flex-1` — a row — and the result row's editor says in a comment that this is
     * *"the watchlist screen's note field, because it is the same field"*, which was a claim
     * about the field and not about the box, and the box is where they had parted.
     *
     * The second of the two moved this sprint: `docs/design/architecture.md` section 5 merged Search
     * into Discover, so the row that saves a title with its reason is on `(tabs)/discover.tsx`
     * now. The rule did not move — a field and its Save are one line wherever the phone draws
     * that pair — which is why this reads a list of editors rather than a list of screens.
     *
     * Read as a rule rather than as one screen: a size token is a decision the component
     * makes and a `flexDirection` is a decision the call site makes, and only the second one
     * gets the last word. So both phone editors are held to it, not just the one that was
     * wrong — the pair is what §6.51 says has to agree, and one of them agreeing by
     * accident is how they parted the first time.
     */
    /*
     * Found, not listed. This was two hardcoded paths, and the sentence three paragraphs up
     * — *"a field and its Save are one line wherever the phone draws that pair, which is why
     * this reads a list of editors rather than a list of screens"* — was true of the
     * intention and false of the code. So when the search row's composer was removed (a
     * control announced *"Add {name} to your watchlist"* has to add, not reveal a field),
     * this clause failed on a correct change with *"has no editor style for this clause to
     * read"*. `docs/design/agents.md` §4: fix the rule.
     *
     * The rule reads the phone for the pair itself — a screen that draws
     * `COPY.watchlist.notePlaceholder` — so a third one is held to it the day it appears and
     * a removed one takes its obligation with it. The floor under it is what stops the list
     * emptying to nothing and the clause passing about no screens at all, which is the
     * failure §6.176 walked into on `navigationLabels`.
     */
    const PHONE_NOTE_EDITORS = phoneFilesUnder('mobile/app')
      .concat(phoneFilesUnder('mobile/src'))
      .filter((file) => withoutProse(read(file)).includes('COPY.watchlist.notePlaceholder'));
    expect(
      PHONE_NOTE_EDITORS,
      'the phone draws no note editor at all, so every clause below is about nothing',
    ).toEqual(['mobile/app/(tabs)/watchlist.tsx']);
    const stacked: string[] = [];
    for (const file of PHONE_NOTE_EDITORS) {
      const source = withoutProse(read(file));
      const editor = /editor:\s*\{[^}]*\}/.exec(source)?.[0];
      if (!editor) {
        stacked.push(`${file} has no editor style for this clause to read`);
        continue;
      }
      if (!/flexDirection:\s*'row'/.test(editor)) {
        stacked.push(`${file} stacks its note editor, so an inline Save stretches full width`);
      }
      /*
       * And the field takes the room the button does not, rather than both being content-
       * sized: `minWidth: 0` because a flex child will not shrink below its text without it.
       *
       * **Declared and worn, which is two checks and was one.** The first spelling asked only
       * that the StyleSheet contain a `grow` entry, and §6.187 re-planted it in the main
       * checkout after merging: deleting `style={styles.grow}` from the call site left the
       * declaration sitting in the sheet, unused and unreferenced, and the clause passed. A
       * StyleSheet entry nothing wears is invisible to `tsc` and to `oxlint` both, so nothing
       * else was going to say it either.
       *
       * `field.test.ts` had already learned this one — *"And it has to be worn"* — which is
       * why the lesson is cited rather than re-derived. A guard that reads a table and not
       * the call site is checking that somebody wrote a number down.
       */
      if (!/grow:\s*\{[^}]*flex:\s*1[^}]*minWidth:\s*0/.test(source)) {
        stacked.push(`${file} gives the note field no room to grow beside its Save`);
      }
      const wears = /<Field[^>]*style=\{styles\.grow\}/s.test(source);
      if (!wears) {
        stacked.push(`${file} declares a growing field and does not put it on the Field`);
      }
    }
    expect(stacked).toEqual([]);

    /*
     * The half that was right, kept honest: the web's is the layout the phone now matches,
     * so a clause pointing the phone at a twin has to know the twin still exists.
     *
     * Read as the editor's own block rather than as a class string anywhere in the file.
     * The first spelling was a regex containing `gap-` and a bracketed character class,
     * which `space.test.ts` reads as a Tailwind arbitrary value and files as one — a guard
     * failing another guard over a pattern that is not markup at all. The shape is what
     * matters here anyway: a row, and not a column.
     */
    const web = withoutProse(read('app/src/screens/Watchlist.tsx'));
    const editor = /editing \? \(([\s\S]*?)\n\s*\) : \(/.exec(web)?.[1] ?? '';
    expect(editor, 'the web has no note editor for this clause to read').toContain('<Field');
    expect(editor, 'the web stacks its note editor too, so there is no twin left to copy')
      .toMatch(/className="flex /);
    expect(editor, 'the web turned its note editor into a column').not.toMatch(/flex-col/);
  });
});

describe('what a control is called', () => {
  it('is never a question, anywhere in the product', () => {
    /*
     * `label=` and nothing else: `name=` is the announced sentence and a hint is prose,
     * both of which may legitimately ask something. This is about the drawn word.
     *
     * A literal or a `COPY.` reference — an expression is followed into `copy.ts` by the
     * clause below rather than guessed at here.
     */
    const asking: string[] = [];
    for (const dir of TREES) {
      for (const file of filesUnder(dir)) {
        for (const [, label] of withoutProse(read(file)).matchAll(/label=(?:"([^"]*)"|'([^']*)')/g)) {
          if (label?.includes('?')) asking.push(`${file}: label="${label}"`);
        }
      }
    }
    expect(asking, 'a control drawn as a question — see COPY.controls.catchUp').toEqual([]);
  });

  it('is never a question in the words either platform reads from copy.ts', () => {
    // The other half of the same rule, where the words actually live now.
    const asking = Object.entries(COPY.controls)
      .filter(([, value]) => typeof value === 'string' && value.includes('?'))
      .map(([key]) => `COPY.controls.${key}`);
    expect(asking, 'a drawn control word that asks rather than says').toEqual([]);
  });
});
