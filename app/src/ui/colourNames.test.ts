import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { stripComments } from '@reviewies/core/test/source';
import { border, color, label } from '@reviewies/core/tokens';

/**
 * A colour class that names nothing paints nothing, and says so to no one.
 *
 * This is the failure mode §6.90 was one deleted export away from shipping. Tailwind v4
 * generates a utility only for a name in the `@theme` block, and the seven legacy colours
 * left that block when their sites did. A `bg-accent` surviving anywhere would not error,
 * would not warn, and would not appear in the compiled stylesheet — the element simply
 * renders transparent, on one screen, in one state, for one person.
 *
 * The phone has TypeScript for this: `theme.accent` stopped compiling the moment the key
 * was deleted. The web has nothing, so it has this.
 *
 * `(?<![\w-])` and not `\b` in front of each namespace. A hyphen is a non-word character,
 * so `\b` matches in the middle of `text-stroke-hairline` and reads it as the `stroke-`
 * namespace holding a colour called `hairline` — and it read the string
 * `'add-to-list offered'` as the `to-` namespace holding `list`. Both were reported as
 * undefined colours by the first version.
 */
const ROOT = resolve(import.meta.dirname, '../../..');

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.expo') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, out);
    else if (/\.(tsx?|css)$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

const WEB = sources(resolve(ROOT, 'app/src'));
const PHONE = ['mobile/app', 'mobile/src'].flatMap((t) => sources(resolve(ROOT, t)));

/** `groundRaised` -> `ground-raised`, the same transform the generator uses. */
const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * Everything the `@theme` block defines, plus what Tailwind provides without it.
 * `black` is the one built-in this app uses — Watching Mode's true-black backdrop.
 */
const DEFINED = new Set<string>([
  ...Object.keys(color.dark).map(kebab),
  ...label.dark.map((_, i) => `label-${i}`),
  'black', 'white', 'transparent', 'current', 'inherit',
]);

/**
 * Six of the seven that were the whole build until §6.90.
 *
 * `ink` is deliberately not in the list, and the reason is the sharpest thing in this
 * file. The legacy palette's `ink` was the page *background*, near-black; the token
 * table's `ink` is the *writing*, near-white. The string survived the migration with an
 * inverted meaning, so a guard keyed on the string cannot tell a stale `bg-ink` from a
 * correct `text-ink` — and listing it here reported all three legitimate uses as
 * violations the moment they were written.
 *
 * What catches the real failure is the clause below on `action.label`, which checks a
 * relationship rather than a name. A stray `bg-ink` — a near-white page — is not caught
 * by anything and is written down in §7 rather than pretended about.
 */
const LEGACY = /\b(?:bg|text|border|from|to|via|ring|fill|stroke|divide|placeholder|caret|outline|decoration|accent|shadow)-(surface-?2|surface|edge|text|muted|accent)(?![\w-])/g;

/** Namespaces whose every value is a colour, so an unknown name is unambiguous. */
const COLOUR_ONLY =
  /(?<![\w-])(?:bg|border|from|to|via|fill|stroke|divide|caret|accent)-([a-z][a-z0-9-]*)(?:\/\d+)?(?![\w-])/g;

/**
 * `border-t`, `border-2`, `bg-gradient-to-br` and friends are not colours.
 *
 * `border-` was listed as a colour-only namespace and is not: Tailwind shares it between
 * colour and width, exactly as it shares `text-` between colour and size. `border-t-tally`
 * — the tab bar's rule, 3pt — was reported as an undefined colour called "tally" the
 * moment it was written. The width tokens are read from the table rather than listed, so
 * a fifth one cannot be added without this knowing.
 */
const NOT_A_COLOUR = new Set([
  ...Object.keys(border),
  't', 'b', 'l', 'r', 'x', 'y', 's', 'e', 'solid', 'dashed', 'dotted', 'none', 'hidden',
  'gradient-to-br', 'gradient-to-b', 'gradient-to-r', 'gradient-to-t', 'gradient-to-l',
  'clip-text', 'clip-border', 'cover', 'contain', 'center', 'no-repeat', 'fixed', 'local',
]);

describe('every colour a class names', () => {
  it('reads both trees and a table rather than nothing', () => {
    expect(WEB.length).toBeGreaterThan(40);
    expect(PHONE.length).toBeGreaterThan(40);
    expect(DEFINED.size).toBeGreaterThan(20);
    // The table is the dark half; light must define exactly the same names or a screen
    // would be unstyled in exactly one theme.
    expect(Object.keys(color.light)).toEqual(Object.keys(color.dark));
  });

  it('keeps no legacy colour name on either platform', () => {
    const off: string[] = [];
    for (const path of [...WEB, ...PHONE]) {
      const text = stripComments(readFileSync(path, 'utf8'));
      text.split('\n').forEach((line, index) => {
        for (const match of line.matchAll(LEGACY)) {
          off.push(`${relative(ROOT, path)}:${index + 1}  ${match[0]}`);
        }
      });
    }
    expect(off, 'the seven went with their call sites in §6.90').toEqual([]);
  });

  it('writes the action label only where there is an action fill under it', () => {
    /*
     * `action.label` is #131114 — near-black, and the ONLY thing it is for is the label
     * printed on the near-white `action.fill` pill. On any other surface it is invisible.
     *
     * §6.90's migration put it on three elements that have no fill: the web's active tab
     * (near-black on the near-black tab bar), the remote drawer's refresh button, and Up
     * Next's outlined secondary pill. Two of those were the migration script eating its
     * own output a second time — a rule mapping `text-text` to `text-ink` ran before the
     * rule mapping `text-ink` to `text-action-label`, so a legacy name arrived at the
     * wrong token through the right one — and neither the colour-name guard nor the
     * render probe could see it, because every name involved is real and defined.
     *
     * The rule is the token's own definition: a label needs its fill in the same class
     * list. Nothing else in the app pairs them, so nothing else has to be excused.
     */
    const FILLS = /\bbg-(?:action-fill|working-fill|working-mark|ink|trouble)\b/;
    const off: string[] = [];
    let seen = 0;
    for (const path of WEB.filter((p) => p.endsWith('.tsx'))) {
      const text = stripComments(readFileSync(path, 'utf8'));
      text.split('\n').forEach((line, index) => {
        if (!/\btext-action-label\b/.test(line)) return;
        seen++;
        // The fill is often on the same element and sometimes on the ternary's other
        // branch, so the line is the unit. A line with both is a pill.
        if (FILLS.test(line)) return;
        off.push(`${relative(ROOT, path)}:${index + 1}  ${line.trim().slice(0, 70)}`);
      });
    }
    /*
     * The floor was 10 and is 7, because sprint 15 removed the accent fill from every
     * screen and `text-action-label` went with it — the remaining seven are inside the
     * component set, which is where they belong.
     *
     * Lowered deliberately rather than deleted. The floor is what stops this clause
     * passing because the scan found nothing, and it should keep falling only when
     * something is genuinely migrated: `accentFill.test.ts` now says outright that *no
     * screen* writes this ink, so if this number ever goes to zero that guard has been
     * broken too and both will say so.
     */
    /*
     * 6, down one: `WhereToWatch`'s country picker was the last screen drawing a chosen
     * chip as `bg-action-fill text-action-label`, and it is a `Choice` now. The note above
     * says the remaining sites belong inside the component set; this was the exception it
     * did not know about, because the clause that should have caught it read `Choice.tsx`
     * and nothing else.
     */
    expect(seen, 'nothing writes the action label at all').toBeGreaterThan(5);
    expect(off, 'action.label is near-black and only legible on the action fill').toEqual([]);
  });

  it('names only colours the token table defines', () => {
    /*
     * Class attributes only, so `.css` is out of scope here. The first version scanned
     * it too and reported `--stroke-hairline:` and `var(--border-width-mark)` as unknown
     * colours — a guard reading declarations as if they were classes, which is §6.72's
     * mistake wearing a different hat. The legacy check above still reads every file,
     * which is the clause that would catch a `bg-accent` left in a stylesheet.
     */
    const off: string[] = [];
    let seen = 0;
    for (const path of WEB.filter((p) => !p.endsWith('.css'))) {
      const text = stripComments(readFileSync(path, 'utf8'));
      text.split('\n').forEach((line, index) => {
        for (const match of line.matchAll(COLOUR_ONLY)) {
          // `border-t-tally` captures as `t-tally`: the side is part of the utility, not
          // part of the name. Strip it before looking anything up.
          const name = match[1].replace(/^(?:t|b|l|r|x|y|s|e)-/, '');
          if (NOT_A_COLOUR.has(name) || NOT_A_COLOUR.has(match[1]) || /^\d/.test(name)) continue;
          seen++;
          if (DEFINED.has(name)) continue;
          off.push(`${relative(ROOT, path)}:${index + 1}  ${match[0]}`);
        }
      });
    }
    // A regex that stopped matching would report nothing and read as success.
    expect(seen, 'no colour class was recognised at all').toBeGreaterThan(80);
    expect(off, 'a name with no token compiles to no utility at all').toEqual([]);
  });
});
