import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT } from './pairs';

const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

/**
 * Failures that reach somebody, rather than being dropped on the way.
 *
 * The same bug has now been found four times, in four places, wearing the same clothes:
 * an empty state that is really a failed request. §6.33 separated "no lists" from "could
 * not ask". Doc 10 §6 was a search that said *Searching…* for ever. §6.56 was a
 * signed-out Lists screen saying "No lists yet" over a Create box whose button did
 * nothing. §6.57 — this one — found `fetchListItems` dropping its `failed`, and four
 * writes that returned `void` and swallowed the error entirely.
 *
 * **An empty state is a claim about somebody's own data.** Code that cannot tell
 * "nothing" from "I could not look" makes that claim falsely, and the person reading it
 * has no way to know. So this checks the two halves of the path:
 *
 *  - a core function that talks to the server has to be *able* to report a failure —
 *    `Promise<void>` from a module that calls `getClient()` is a swallowed error by
 *    construction, whatever the screens do;
 *  - a screen that calls one has to *bind* the result, because a result nobody looks at
 *    is the same as no result at all.
 *
 * What it cannot see: whether the bound result is then rendered. `const result = await …`
 * followed by silence would pass here and fail a reader. That is the line where a
 * source-level check stops and the browser suites take over — §6.56 drives the offline
 * cases end to end for exactly that reason.
 */

/** Calls that may fail and say so, and where a caller is allowed to ignore that. */
const IGNORED: Record<string, string> = {};

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const sources = (dir: string): string[] => {
  const out: string[] = [];
  const walk = (at: string) => {
    for (const entry of readdirSync(resolve(ROOT, at), { withFileTypes: true })) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) {
        if (!/node_modules|dist|\.expo/.test(entry.name)) walk(path);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
    }
  };
  walk(dir);
  return out;
};

/** The core modules that speak to the backend, which is where a swallowed error starts. */
const backendModules = () =>
  sources('core/src').filter((file) => strip(read(file)).includes('getClient()'));

/** `export async function name(…): Promise<X>` → the name, its return type, its body. */
function exportedAsync(
  source: string,
): Array<{ name: string; returns: string; body: string }> {
  const found: Array<{ name: string; returns: string; body: string }> = [];
  const clean = strip(source);
  const pattern = /export\s+async\s+function\s+(\w+)\s*\(([\s\S]*?)\)\s*:\s*(Promise<[\s\S]*?>)\s*\{/g;
  for (const match of clean.matchAll(pattern)) {
    // Brace-counted to the end of the function, so "does this throw" is asked of the
    // body rather than of whatever happens to follow it.
    let depth = 1;
    let i = match.index + match[0].length;
    while (i < clean.length && depth > 0) {
      if (clean[i] === '{') depth++;
      else if (clean[i] === '}') depth--;
      i++;
    }
    found.push({
      name: match[1],
      returns: match[3].replace(/\s+/g, ' '),
      body: clean.slice(match.index + match[0].length, i),
    });
  }
  return found;
}

/** Whether a return type can carry a failure at all. */
const reportsFailure = (returns: string) =>
  /\bok:\s*false\b|\bfailed\b|\|\s*undefined|Promise<boolean>|Promise<string \| undefined>/.test(
    returns,
  );

describe('failures that reach somebody', () => {
  it('gives every backend call a way to report that it failed', () => {
    const swallowed: string[] = [];
    for (const file of backendModules()) {
      for (const fn of exportedAsync(read(file))) {
        // `Promise<void>` from a module that talks to the server, and no `throw` in the
        // body: the error has nowhere to go. Seven of these existed — removeFromList,
        // setListVisibility, unfollow, blockPerson, unblockPerson, deleteComment,
        // clearContentWarningVote — beside siblings that reported properly. Throwing is
        // a perfectly good way to report, which is what `signIn` and `postComment` do.
        if (fn.returns === 'Promise<void>' && !/\bthrow\b/.test(fn.body)) {
          swallowed.push(`${file}#${fn.name}`);
        }
      }
    }
    // A function here either reports its failure or throws; `void` is neither. If one
    // genuinely cannot fail in a way anybody could act on, say so in a comment and give
    // it a return type that says so too.
    expect(swallowed).toEqual([]);
  });

  it('binds the result everywhere one is offered', () => {
    // Which functions report a failure, read off the core rather than listed here — a
    // hardcoded list would go stale the first time somebody added one.
    const reporting = new Set<string>();
    for (const file of backendModules()) {
      for (const fn of exportedAsync(read(file))) {
        if (reportsFailure(fn.returns)) reporting.add(fn.name);
      }
    }
    expect(reporting.size).toBeGreaterThan(8);

    const unbound: string[] = [];
    for (const file of [...sources('app/src'), ...sources('mobile/app'), ...sources('mobile/src')]) {
      const src = strip(read(file));
      for (const name of reporting) {
        for (const match of src.matchAll(new RegExp(`\\bawait\\s+${name}\\s*\\(`, 'g'))) {
          // What comes immediately before decides it: an assignment, an argument, a
          // return or a ternary all catch the result; a statement on its own line does
          // not. Read backwards over whitespace rather than by pattern, because
          // `const x = await f(` and `  await f(` differ only in what precedes them.
          const before = src.slice(0, match.index).trimEnd();
          const last = before.at(-1) ?? '';
          const used = '=(,[?:&|'.includes(last) || /\breturn$/.test(before);
          if (used) continue;
          const key = `${file}#${name}`;
          if (!IGNORED[key]) unbound.push(key);
        }
      }
    }
    expect([...new Set(unbound)]).toEqual([]);
  });

  it('keeps no exemption that no longer describes a call', () => {
    const live = new Set<string>();
    for (const file of [...sources('app/src'), ...sources('mobile/app'), ...sources('mobile/src')]) {
      const src = strip(read(file));
      for (const key of Object.keys(IGNORED)) {
        const name = key.split('#')[1];
        if (key.startsWith(file) && new RegExp(`\\b${name}\\s*\\(`).test(src)) live.add(key);
      }
    }
    expect(Object.keys(IGNORED).filter((key) => !live.has(key))).toEqual([]);
  });

  it('reads the core rather than trusting a list', () => {
    // Non-vacuity, for both halves above.
    const modules = backendModules();
    expect(modules.length).toBeGreaterThan(4);
    expect(modules.some((m) => m.endsWith('social/lists.ts'))).toBe(true);
    const lists = exportedAsync(read('core/src/social/lists.ts'));
    expect(lists.map((f) => f.name)).toContain('removeFromList');
    expect(reportsFailure(lists.find((f) => f.name === 'removeFromList')!.returns)).toBe(true);
  });
});
