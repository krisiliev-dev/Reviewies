import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { blankLiterals } from '@reviewies/core/test/source';

/**
 * Every test asserts something.
 *
 * §6.73 taught the runner to say which files it collects. This is the question one layer
 * further in: a file can be collected, and a test inside it can run to completion, and
 * still prove nothing — because it never asserts. That failure is completely silent. It
 * adds one to the passed count like any other test, and the only way to notice is to
 * read the body.
 *
 * §6.74 read all 1,192 of them and found none, which is the answer worth keeping rather
 * than the answer worth celebrating: it is true today and nothing was holding it true.
 *
 * ## What counts as asserting
 *
 * `expect(` in the body, or a call to a named assertion helper — `expectComplete(...)`
 * in `tombstones.test.ts` is a real assertion wearing a different name, and demanding
 * everything be inlined would make the suites worse to read. The helper has to exist in
 * the same file and contain an `expect(` of its own, so the name alone does not satisfy
 * this.
 *
 * ## What it cannot see
 *
 * An assertion that runs but cannot fail — `expect(count).toBeGreaterThanOrEqual(0)` —
 * looks identical to a real one from here. §6.74 found two of those by reading, and §7
 * records that nothing mechanical is watching for more.
 */
const ROOT = resolve(import.meta.dirname, '../../..');
const WORKSPACES = (
  JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { workspaces: string[] }
).workspaces;

/**
 * Tests that assert nothing, on purpose.
 *
 * Empty, and it should stay that way — but the §6.41 rule applies to this list as much
 * as any other: an exemption outlives its reason unless something checks, so the second
 * test below reads it back.
 */
const ASSERTS_NOTHING: Record<string, string> = {};

function testFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.expo') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) testFiles(path, out);
    else if (/\.test\.[cm]?[jt]sx?$/.test(entry.name)) out.push(relative(ROOT, path));
  }
  return out;
}

/** The index of the `}` closing the block that opens at `from`. */
function closes(code: string, from: number): number {
  let depth = 0;
  for (let i = from; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

/** The index of the `)` closing the call whose `(` is at `from`. */
function closesCall(code: string, from: number): number {
  let depth = 0;
  for (let i = from; i < code.length; i++) {
    if (code[i] === '(') depth++;
    else if (code[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

interface Case {
  name: string;
  body: string;
}

/**
 * Every test in a file, with the source of its body.
 *
 * Reads the literal-blanked copy so a brace inside a string or a regex cannot end a
 * block early — which is exactly the mistake this guard made on its first run, on eleven
 * files, and reported as eleven findings.
 */
function cases(source: string): Case[] {
  const code = blankLiterals(source);
  const found: Case[] = [];
  // Not `.test(` on a regex, and not the tail of `submit(` — hence the lookbehind.
  const heads = /(?<![.\w$])(it|test)(\.\w+)*\s*\(/g;
  let head: RegExpExecArray | null;
  while ((head = heads.exec(code))) {
    const each = (head[2] ?? '').includes('each');
    const openedAt = head.index + head[0].length - 1;
    const named = /^\s*(['"`])([\s\S]*?)\1/.exec(source.slice(openedAt + 1));
    if (each) {
      // `it.each(table)(name, callback)` — the body is inside the second call.
      const table = closesCall(code, openedAt);
      const second = code.indexOf('(', table);
      const end = closesCall(code, second);
      if (table < 0 || second < 0 || end < 0) continue;
      const inner = /^\s*(['"`])([\s\S]*?)\1/.exec(source.slice(second + 1));
      found.push({ name: inner?.[2] ?? '(each)', body: code.slice(second, end + 1) });
      continue;
    }
    const opens = code.indexOf('{', openedAt);
    const end = opens < 0 ? -1 : closes(code, opens);
    if (end < 0) continue;
    found.push({ name: named?.[2]?.replace(/\s+/g, ' ') ?? '(computed)', body: code.slice(opens, end + 1) });
  }
  return found;
}

/** Does this body assert — directly, or through a helper in the same file that does? */
function asserts(body: string, whole: string): boolean {
  if (/\bexpect\s*\(/.test(body)) return true;
  for (const helper of body.match(/\bexpect[A-Z]\w*(?=\s*\()/g) ?? []) {
    const declared = new RegExp(`(function|const)\\s+${helper}\\b`).test(whole);
    if (declared && new RegExp(`${helper}[\\s\\S]{0,2000}?expect\\s*\\(`).test(whole)) return true;
  }
  return false;
}

describe('every test', () => {
  const files = WORKSPACES.flatMap((name) => testFiles(join(ROOT, name)));

  it('is found, in every workspace, rather than an empty list being cleared', () => {
    expect(files.length).toBeGreaterThan(50);
    for (const name of WORKSPACES) {
      expect(files.some((f) => f.startsWith(`${name}/`)), `nothing scanned in ${name}`).toBe(true);
    }
    // And the bodies parse. A brace matcher that gives up returns nothing, which would
    // read as "no test asserts nothing" just as loudly as a clean sweep.
    const total = files.reduce((n, f) => n + cases(readFileSync(join(ROOT, f), 'utf8')).length, 0);
    expect(total).toBeGreaterThan(1000);
  });

/*
 * The two clauses below read and parse **every test file in every workspace** — about a
 * thousand `it()` bodies across ninety files, with a regex sweep over each. That is
 * legitimately slow: alone they take six and a half seconds of test time.
 *
 * §6.189 gave them an explicit budget, because vitest's default is 5,000ms and the pair had
 * been **failing under full-suite load and passing alone** — a check that answers differently
 * depending on what else the machine is doing. This session reported `verify` green several
 * times on runs where they happened to win the race, which is the whole problem: a clause
 * nobody can rely on is worse than one that is simply absent, because it is still consulted.
 * §6.161 fixed four checks of exactly this kind and this pair was not among them.
 *
 * The budget is not a loosening. What each clause asserts is unchanged; the default was a
 * claim that reading a thousand test bodies is fast, and that claim was false. Thirty seconds
 * is six times the measured cost under load, which is slack against a busy machine rather
 * than against a slow clause — if either ever approaches it, the sweep has grown a real
 * problem and should be read rather than re-budgeted.
 */
const READS_EVERY_TEST_FILE = 30_000;

  it('asserts something', () => {
    const silent: string[] = [];
    for (const file of files) {
      const source = readFileSync(join(ROOT, file), 'utf8');
      for (const one of cases(source)) {
        if (asserts(one.body, blankLiterals(source))) continue;
        const key = `${file} :: ${one.name}`;
        if (!(key in ASSERTS_NOTHING)) silent.push(key);
      }
    }
    expect(silent).toEqual([]);
  }, READS_EVERY_TEST_FILE);

  it('keeps no exemption for a test that asserts after all', () => {
    const live = new Set(
      files.flatMap((file) => {
        const source = readFileSync(join(ROOT, file), 'utf8');
        return cases(source)
          .filter((one) => !asserts(one.body, blankLiterals(source)))
          .map((one) => `${file} :: ${one.name}`);
      }),
    );
    expect(Object.keys(ASSERTS_NOTHING).filter((key) => !live.has(key))).toEqual([]);
  }, READS_EVERY_TEST_FILE);
});
