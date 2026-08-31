import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * A list row's title is the only cue by which somebody picks one row over another, and
 * `fetchListItems` does not return one.
 *
 * ## What this is a guard against
 *
 * `core/src/social/lists.ts`'s `ListItem` is `{ titleId, kind, note?, rank }` — four
 * machine fields and no name, because the server does not hold one. The name comes from
 * the **local title cache**, and each Lists screen widens the rows with it before
 * rendering: `item.name ?? item.titleId`. `Lists.tsx`'s own comment says why the fallback
 * is not good enough to live on — *"the web showed the raw `titleId` — a machine string on
 * the one screen whose entire content is titles somebody chose by hand"*.
 *
 * That widening was applied on the path that **opens** a list and not on the path that
 * **removes** an item from it, so `setItems(reloaded.items)` put four machine fields back
 * into the row state and every remaining row on the list redrew as its provider id. Driven
 * on a real build, signed in against `design/signedIn.mjs`, `/lists`, *Sunday nights*
 * expanded, one Remove pressed:
 *
 * ```
 * before  Open The Long Dark, on Sunday nights   Open Quiet Harbour, on Sunday nights
 * after   Open tmdb:tv:1, on Sunday nights       Open tmdb:movie:4, on Sunday nights
 * ```
 *
 * The row that was not touched loses its name too, in the title's own weight, and the
 * announced name goes with it. Removing one thing from a list is not a claim about what
 * the others are called.
 *
 * ## Why the clauses are shaped like this
 *
 * The **first** is the defect verbatim and nothing wider: rows are never set from a
 * `ListItemsResult`. It cannot fire on correct code, because there is no reading of this
 * screen under which the right thing to render is a row with no title in it.
 *
 * The **second** is the one that matters, and it is a guard on a *type*. `ListItem &
 * { name?: string }` is what let the defect compile: an optional property is satisfied by
 * its own absence, so `ListItem[]` is assignable to the row type and every path that
 * forgets the lookup type-checks. Made **required** — `name: string | undefined` — the
 * compiler rejects the whole class, including the spellings the first clause cannot see
 * (`const { items } = await fetchListItems(id); setItems(items)`). This clause exists so
 * that a future compile error is not answered by putting the `?` back, which is the one
 * repair that would silently restore the defect. `core/src/ui/button.ts` states the
 * principle for `ButtonContract`'s `name`, one component over and for the same reason:
 * *"Requiring both moves that whole class to the compiler."*
 *
 * Both platforms, because the phone got this right by a different route — it filters the
 * rows it already holds rather than re-reading them — and a guard that reads one of a pair
 * proves nothing about the other. `migrationParity.test.ts` is the file that learned that.
 */
const ROOT = resolve(__dirname, '../../..');

const SCREENS = [
  ['web', 'app/src/screens/Lists.tsx'],
  ['phone', 'mobile/app/lists.tsx'],
] as const;

const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

/** The balanced argument of every `setItems(` call in a source file. */
function setItemsArgs(source: string): string[] {
  const out: string[] = [];
  const CALL = 'setItems(';
  for (let at = source.indexOf(CALL); at !== -1; at = source.indexOf(CALL, at + 1)) {
    let depth = 1;
    let i = at + CALL.length;
    for (; i < source.length && depth > 0; i++) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')') depth--;
    }
    out.push(source.slice(at + CALL.length, i - 1));
  }
  return out;
}

describe('a list row keeps its title', () => {
  it('never sets the rows from a fetch result, which carries no titles', () => {
    for (const [platform, path] of SCREENS) {
      const args = setItemsArgs(read(path));
      expect(args.length, `${platform}: ${path} sets no list rows at all`).toBeGreaterThan(0);
      for (const arg of args) {
        expect(
          /^\s*(?:await\s+)?[A-Za-z_$][\w$]*\.items\s*$/.test(arg),
          `${platform}: ${path} renders a list from \`${arg.trim()}\` — a ListItemsResult ` +
            `has no name on it, so every row on that list redraws as its provider id`,
        ).toBe(false);
      }
    }
  });

  it('requires the name on the row type, so the compiler sees the path that forgets', () => {
    for (const [platform, path] of SCREENS) {
      const source = read(path);
      expect(
        source,
        `${platform}: ${path} declares the list row's name optional. An optional property ` +
          `is satisfied by its own absence, so a bare ListItem[] type-checks and the row ` +
          `falls back to its provider id at runtime instead of failing to build`,
      ).not.toMatch(/ListItem\s*&\s*\{\s*name\?\s*:/);
      expect(
        source,
        `${platform}: ${path} no longer widens a list row with a name at all`,
      ).toMatch(/ListItem\s*&\s*\{\s*name\s*:/);
    }
  });
});
