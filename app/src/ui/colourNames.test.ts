import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { stripComments } from '@reviewies/core/test/source';
import { color, label } from '@reviewies/core/tokens';

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

/** The seven that were the whole build until §6.90. */
const LEGACY = /\b(?:bg|text|border|from|to|via|ring|fill|stroke|divide|placeholder|caret|outline|decoration|accent|shadow)-(ink|surface-?2|surface|edge|text|muted|accent)(?![\w-])/g;

/** Namespaces whose every value is a colour, so an unknown name is unambiguous. */
const COLOUR_ONLY =
  /(?<![\w-])(?:bg|border|from|to|via|fill|stroke|divide|caret|accent)-([a-z][a-z0-9-]*)(?:\/\d+)?(?![\w-])/g;

/** `border-t`, `border-2`, `bg-gradient-to-br` and friends are not colours. */
const NOT_A_COLOUR = new Set([
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
          const name = match[1];
          if (NOT_A_COLOUR.has(name) || /^\d/.test(name)) continue;
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
