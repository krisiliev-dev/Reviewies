import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '@reviewies/core/test/source';

/**
 * A control announced *"Add {name} to your watchlist"* adds it.
 *
 * `COPY.controls.addToWatchlist(name)` is drawn on six controls across the two platforms.
 * Four of them wrote the watchlist row on the press: the two shelf boxes
 * (`app/src/ui/Browse.tsx`, `mobile/src/ui/Browse.tsx`) and the two title pages. The two
 * search rows — `app/src/screens/Discover.tsx` and `mobile/app/(tabs)/discover.tsx` — did
 * not: `onPress={() => setNoting(true)}` revealed a note field with a Save behind it, so
 * the press wrote nothing, hid Track, Seen it and Add to list, and offered no Cancel.
 * `design/screens/04-search-noting.png` (sha256 fec918bd…) is the photograph: a field, a
 * Save, and no way back to the row you were on.
 *
 * ## Why this is a guard and not a comment
 *
 * Nothing saw it. Measured before this file existed: core 1030 passed / 34 skipped, app
 * 803 passed, mobile 47 passed — **1,880 checks, none of which convicted it**. The
 * announced name and the press are wired at the same JSX element, four lines apart, and
 * no suite in the repository had ever compared the two.
 *
 * ## What the check reads, and why it reads it that way
 *
 * The cheap version — "the file calls `addToWatchlist`" — is **vacuous here**, and that
 * was measured too rather than assumed: `Discover.tsx` imported and called
 * `addToWatchlist` the whole time, from the Save button behind the composer. A file-level
 * check would have shaken the defect's hand. So this reads the *element*: it finds the
 * `<Button>` carrying the announced name, takes that element's own `onPress`, and follows
 * a bare handler into the function of that name in the same file.
 *
 * ## What it cannot see
 *
 * It reads the shape of the wiring, not the behaviour: a handler whose call to
 * `addToWatchlist` sits behind a branch that never runs satisfies every clause below.
 * That plant was constructed rather than imagined — `screens/searchRowWatchlist.test.tsx`
 * is the answer to it, and it presses the control and reads the database. Neither file
 * replaces the other: this one covers all six sites on both platforms and cannot press
 * anything; that one presses, and can only reach the web.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const TREES = ['app/src', 'mobile/app', 'mobile/src'];

/** The name the six controls are announced by, and the writer their press owes. */
const ANNOUNCED = 'COPY.controls.addToWatchlist(';
const WRITER = 'addToWatchlist(';

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist', 'dist-signedin', 'dist-real', '.expo'].includes(entry.name)) {
      continue;
    }
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) filesUnder(path, out);
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

/** The `{…}` that starts at `from`, balanced, so a nested object or arrow comes with it. */
function braced(source: string, from: number): string {
  let depth = 0;
  for (let i = from; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(from + 1, i);
  }
  return '';
}

/** The body of `function name(…) {…}`, or undefined if this file does not declare one. */
function bodyOf(source: string, name: string): string | undefined {
  const declared = new RegExp(`\\bfunction\\s+${name}\\s*\\(`).exec(source);
  if (!declared) return undefined;
  const open = source.indexOf('{', declared.index + declared[0].length);
  return open === -1 ? undefined : braced(source, open);
}

/**
 * Every control announced with the watchlist name, paired with the press it is wired to.
 *
 * The element rather than the line: a `name=` and an `onPress=` are two attributes of one
 * `<Button>`, and the whole finding is that those two disagreed.
 */
function announcedControls(source: string): { press: string | null; element: string }[] {
  const found: { press: string | null; element: string }[] = [];
  let at = source.indexOf(ANNOUNCED);
  while (at !== -1) {
    const opens = source.lastIndexOf('<Button', at);
    // `/>` rather than `>`: every one of these is a self-closing element, and stopping at
    // the first `>` would stop inside `name={COPY.controls.addToWatchlist(x)}`.
    const closes = source.indexOf('/>', at);
    /*
     * The instrument's own subject, checked before it is measured.
     *
     * `lastIndexOf` finds *a* Button, not necessarily the one carrying this name. Draw the
     * control as a `<Pressable>` — which `mobile/src/social/AddToList.tsx` does for its own
     * toggle — and the nearest preceding `<Button` is a different control, whose `onPress`
     * would then be read as this one's and would quite likely pass. `docs/design/agents.md`
     * §9 is a table of nine instruments that did a version of this. A `/>` between the two
     * is the tell that they are not the same element, and an unreadable site is reported
     * rather than silently believed.
     */
    const misread = opens === -1 || closes === -1 || source.slice(opens, at).includes('/>');
    found.push(
      misread
        ? { element: source.slice(Math.max(0, at - 80), at), press: null }
        : (() => {
            const element = source.slice(opens, closes + 2);
            const onPress = element.indexOf('onPress=');
            return {
              element,
              press: onPress === -1 ? '' : braced(element, element.indexOf('{', onPress)),
            };
          })(),
    );
    at = source.indexOf(ANNOUNCED, at + ANNOUNCED.length);
  }
  return found;
}

describe('a control that says it adds to your watchlist', () => {
  const sites = TREES.flatMap((tree) =>
    filesUnder(tree)
      .map((file) => ({ file, source: stripComments(readFileSync(resolve(ROOT, file), 'utf8')) }))
      .filter(({ source }) => source.includes(ANNOUNCED))
      .flatMap(({ file, source }) =>
        announcedControls(source).map((control) => ({ file, source, ...control })),
      ),
  );

  it('is drawn in more than one place, so the sweep below is reading something', () => {
    // Six when this was written — two shelf boxes, two title pages, two search rows — and
    // a seventh is a correct change rather than a defect, so this is a floor and not a
    // count. What it forbids is the shape that makes every clause under it vacuous: a
    // rename that leaves nothing matching, which is exactly how §6.176 walked through
    // `navigationLabels` and left it asserting against an empty set.
    expect(sites.length, 'nothing announces the watchlist name any more').toBeGreaterThan(4);
    // Both platforms, because a sweep that had lost one of the two trees would still pass
    // the line above on the other one's four.
    expect(new Set(sites.map((s) => s.file.split('/')[0])), 'one platform has gone').toEqual(
      new Set(['app', 'mobile']),
    );
  });

  it('writes the row when it is pressed, at every one of those places', () => {
    const empty: string[] = [];
    for (const { file, source, press } of sites) {
      if (press === null) {
        // Not an overfire on a correct change: `Button` is the house control, and §6.131
        // took the hand-drawn ones out of `AddToList` because they lost their press state.
        // A watchlist control that is not a `Button` is a second finding, not a false one.
        empty.push(`${file}: the name is not on a <Button>, so this check cannot tell which `
          + 'control it belongs to — draw it with `Button`, as the other five sites do');
        continue;
      }
      // The press reaches the writer directly — `() => addToWatchlist(id, kind)` — or it
      // names a function in this file that does. `setNoting(true)` is neither, which is
      // the whole finding.
      if (press.includes(WRITER)) continue;
      const named = /^\(?\s*\)?\s*(?:=>)?\s*(?:void\s+)?([A-Za-z_$][\w$]*)\s*\(?\s*\)?\s*$/.exec(
        press.trim(),
      );
      const body = named ? bodyOf(source, named[1]) : undefined;
      if (body?.includes(WRITER)) continue;
      empty.push(`${file}: pressing it runs \`${press.trim() || '(no onPress)'}\`, which never `
        + 'reaches addToWatchlist');
    }
    expect(empty, 'a control named for an add that does not add').toEqual([]);
  });

  /**
   * And the note stays where the note belongs.
   *
   * The clause above would be satisfied by a row that adds *and* opens a composer, which
   * is not the decision that was taken. The note is *why you saved it*; §6.167 put it on
   * the watchlist row itself, `TitleDetail.tsx` cites that as its reason for having no
   * composer, and `watchlist.empty` — "Add something from Discover, then say why you saved
   * it" — names the two screens that each do their half.
   *
   * So the question this asks is which screens compose a watchlist note, and the answer is
   * the two watchlist screens. A third one is the state this sprint removed, growing back.
   */
  it('does not also open a note composer, which is the watchlist row\'s job', () => {
    const composers = TREES.flatMap((tree) => filesUnder(tree)).filter((file) =>
      stripComments(readFileSync(resolve(ROOT, file), 'utf8')).includes(
        'COPY.watchlist.notePlaceholder',
      ),
    );
    expect(composers.sort()).toEqual([
      'app/src/screens/Watchlist.tsx',
      'mobile/app/(tabs)/watchlist.tsx',
    ]);
  });
});
