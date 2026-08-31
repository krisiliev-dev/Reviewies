import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { ROOT, phoneScreenFiles, webScreenFiles } from './pairs';
import { QUERY_PARAM, VIEW_PARAM } from '@reviewies/core/ui/segments';
import { stripComments } from '@reviewies/core/test/source';

const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

/**
 * A screen's own state, and whether the address can reach it.
 *
 * ## The finding
 *
 * `docs/research/11-what-a-task-costs.md` §7.2, measured rather than noticed. Both platforms
 * held Discover's search query in `useState` — `app/src/screens/Discover.tsx:54` and
 * `mobile/app/(tabs)/discover.tsx:52` were the same line — and the two behaved differently,
 * because the *navigator* differed: expo-router keeps a tab screen mounted under a pushed
 * title, so going back on the phone still showed your results; react-router unmounts it, so
 * the web came back to the shelf with an empty field. `design/cost.mjs` priced the
 * difference at **four characters, one extra press and one extra mental operation** on the
 * one loop — look something up, open it, go back, act — that doc 4 calls most of why anybody
 * searches.
 *
 * The phone being right was luck, not a decision, and it was the *smaller* half of the
 * problem: neither platform survived a reload, and neither could be sent to anybody.
 *
 * ## Why this is a guard and not a fix
 *
 * The fix is two lines in two files, and two lines in two files is exactly the shape §6.139
 * is about — a finding repaired where it was found, with nothing sweeping for the next one.
 * There is already a second addressable state on a second screen (`?on=` on Up Next) that
 * arrived the same way, and `core/src/ui/segments.ts` exists because writing one of these
 * twice is how the two platforms drift. So the rule is stated once, over both platforms,
 * against every screen that has the control rather than against the two that have it today.
 *
 * ## What the rule is, and what it deliberately is not
 *
 * **It is:** a screen carrying a search field takes the field's value from the address and
 * writes it back there. That is checkable from the source on both platforms and it is the
 * whole of the repair.
 *
 * **It is not:** "no screen may hold state". Almost every state on these screens is
 * correctly private — a sheet that is open, a filter row that is revealed, which box has been
 * turned over. `architecture.md`'s fifth refusal is the reasoning: a thing reachable by two
 * routes under two framings is worse than a thing reachable by one, and putting every
 * transient into the address would turn the Back button into an undo stack for things nobody
 * navigated to. The line drawn here is the one §6.157 drew — a state somebody would expect a
 * *link* to carry, which a search plainly is and an open sheet plainly is not.
 *
 * The clause below therefore finds its own subjects: it sweeps every screen file on both
 * platforms for the search field, and requires whatever it finds. A screen that grows one
 * tomorrow is in scope without anybody remembering to add it here, and a floor catches the
 * regex that has stopped biting.
 */
describe('a screen’s addressable state', () => {
  /** The web and the phone, as one list of [label, repo-relative path]. */
  const SCREENS: [string, string][] = [
    ...webScreenFiles().map((f): [string, string] => [`web ${f}`, `app/src/screens/${f}`]),
    ...phoneScreenFiles().map((f): [string, string] => [`phone ${f}`, `mobile/app/${f}`]),
  ];

  /**
   * The control this rule is about, found by the copy key rather than by a file name.
   *
   * `COPY.fields.searchPlaceholder` is the one placeholder in the product that names a
   * search, and a screen that draws it is a screen with a search field on it whatever the
   * file is called. Reading it out of the source rather than listing the two files is the
   * difference between a rule and a pair of needles.
   */
  const FIELD = /placeholder=\{COPY\.fields\.searchPlaceholder\}/;

  it('puts a search field’s query in the address, on both platforms', () => {
    const off: string[] = [];
    const found: string[] = [];

    for (const [label, path] of SCREENS) {
      const source = stripComments(read(path));
      if (!FIELD.test(source)) continue;
      found.push(label);
      const where = `${label} (${relative('', path)})`;

      // The defect itself, named as itself: the query held in the component.
      if (/const\s*\[\s*query\s*,\s*setQuery\s*\]\s*=\s*useState/.test(source)) {
        off.push(
          `${where} — holds its search in useState, so a back navigation, a reload and a ` +
            `shared link all lose it`,
        );
      }

      /*
       * Read from the address, through the reader both platforms share — and *called*,
       * not merely imported. The first version of this clause asked `includes('queryFrom')`
       * and the plant walked through it: taking the call out and leaving the import behind
       * is what a half-finished revert looks like, and it is the exact state this clause was
       * written to catch. A name in an import list is not a screen reading its address.
       */
      if (!/\bqueryFrom\s*\(/.test(source)) {
        off.push(`${where} — does not read its search with queryFrom from core/src/ui/segments.ts`);
      }
      // And written back to it. A screen that only reads is a field nobody can type in.
      if (!/setParams|setSearchParams/.test(source)) {
        off.push(`${where} — never writes its search back to the address`);
      }
      // Spelled once, in the file that owns the spelling, so the two cannot drift.
      if (!/\[\s*QUERY_PARAM\s*\]|\(\s*QUERY_PARAM\s*\)/.test(source)) {
        off.push(`${where} — spells the parameter itself instead of using QUERY_PARAM`);
      }
      if (new RegExp(`['"\`]${QUERY_PARAM}['"\`]\\s*[,)\\]]`).test(source)) {
        off.push(`${where} — has a literal '${QUERY_PARAM}' in it; QUERY_PARAM is the spelling`);
      }
    }

    /*
     * Both halves of the pair, and a floor rather than a ratchet. A regex that stopped
     * matching would find nothing and read exactly like success — which is the failure mode
     * §6.157 found in a clause that could only return one answer, and the one this whole
     * sprint is about.
     */
    expect(found.sort(), 'the sweep found no search field at all').toEqual([
      'phone (tabs)/discover.tsx',
      'web Discover.tsx',
    ]);
    expect(off).toEqual([]);
  });

  /**
   * And the writer replaces rather than pushes.
   *
   * A search field writes on every keystroke. Pushed, that is one history entry per
   * character and a Back button that has become a backspace key — five presses to leave a
   * screen you typed five letters on, which is a worse version of the defect being repaired
   * rather than a fix for it. `segments.ts` states this; here is where it is enforced, and
   * only on the web: react-router pushes by default and has to be told, expo-router's
   * `setParams` mutates the current route and has nothing to tell.
   */
  it('replaces rather than pushes, so Back does not become a backspace key', () => {
    const web = stripComments(read('app/src/screens/Discover.tsx'));
    const write = /setParams\([^;]*?\)/s.exec(web);
    expect(write, 'the web Discover no longer writes its query to the address').not.toBeNull();
    expect(write?.[0], 'a pushed entry per keystroke').toContain('replace: true');
  });

  /**
   * The state that was already addressable stays that way, on both platforms.
   *
   * `?on=` is the older half of this rule and nothing swept for it either. It is included
   * here rather than left in `segments.ts`'s prose because the rule is the same rule, and a
   * guard that covers the state added this sprint and not the one added last sprint is the
   * §6.139 shape again, in the file written to avoid it.
   */
  it('keeps Up Next’s two halves in the address, on both platforms', () => {
    for (const path of ['app/src/screens/UpNext.tsx', 'mobile/app/(tabs)/index.tsx']) {
      const source = stripComments(read(path));
      expect(source, `${path} no longer names VIEW_PARAM`).toContain('VIEW_PARAM');
      expect(source, `${path} no longer reads the view from the address`).toContain('viewFrom');
      expect(
        new RegExp(`['"\`]${VIEW_PARAM}['"\`]\\s*\\]`).test(source),
        `${path} spells the view parameter itself instead of using VIEW_PARAM`,
      ).toBe(false);
    }
  });
});
