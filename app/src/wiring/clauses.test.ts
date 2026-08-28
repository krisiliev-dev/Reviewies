import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * The guards, read as source, for the one mistake they keep making.
 *
 * §6.108 planted a deletion against a clause written twenty minutes earlier and it passed:
 * `toContain('text-s14')` on the whole of `Choice.tsx` was satisfied by the *row*
 * constant after the *chip* had lost its size. §6.109 swept for the rest and found six,
 * every one of them the same shape and five of them mine — including a clause that
 * checked the selected state stepped its label up, satisfied four times over by
 * `text-ink-secondary` in a table it was not looking at.
 *
 * **A file containing a string is not the construct carrying it.** When a needle occurs
 * more than once in the file a clause reads, the clause cannot say which one it found,
 * and it passes when the one it means is deleted. That is mechanically detectable, which
 * is what this is: the sweep, kept running, so the next clause of that shape fails when
 * it is written rather than four sprints later when somebody happens to plant against it.
 *
 * What it does not catch is a needle unique today in a file that grows a second one
 * tomorrow — at which point this clause starts failing and says so, which is the point.
 * `declarationOf` in `core/src/test/source.ts` is the answer in almost every case.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

function testFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist', '.expo'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) testFiles(path, out);
    else if (entry.name.endsWith('.test.ts')) out.push(path);
  }
  return out;
}

/**
 * Which file an `expect()` subject is reading, when it is reading one whole.
 *
 * Only the two spellings these suites actually use: `expect(read('path'))`, and a `const`
 * assigned from `read`/`readFileSync`/`stripComments` at the top of the file. Anything
 * narrower than a whole file — a captured match, a filtered line, a declaration — is not
 * this clause's business, and not resolving it is how that stays true.
 */
function wholeFileRead(subject: string, source: string): string | undefined {
  const direct = /^read\('([^']+)'\)$/.exec(subject);
  if (direct) return direct[1];
  const assigned = new RegExp(
    `\\bconst ${subject}\\s*=\\s*(?:strip(?:Comments)?\\()?read(?:FileSync)?\\(\\s*'([^']+)'`,
  ).exec(source);
  return assigned?.[1];
}

interface Ambiguous {
  where: string;
  target: string;
  needle: string;
  occurrences: number;
}

function ambiguous(): Ambiguous[] {
  const found: Ambiguous[] = [];
  for (const file of testFiles('app/src')) {
    const source = read(file);
    for (const m of source.matchAll(/expect\(\s*(read\('[^']*'\)|\w+)\s*[,)]/g)) {
      const rest = source.slice(m.index + m[0].length, m.index + m[0].length + 400);
      const call = /^[^\n]*?\.(not\.)?(toContain|toMatch)\(\s*(['"])(.+?)\3/s.exec(rest);
      // `not.toContain` is a different claim: "this file says it nowhere" is exactly what
      // a whole-file read is for, and more occurrences make it stronger rather than weaker.
      if (!call || call[1]) continue;
      const target = wholeFileRead(m[1], source);
      if (!target) continue;
      let text: string;
      try {
        text = read(target);
      } catch {
        continue;
      }
      const needle = call[4];
      const occurrences = text.split(needle).length - 1;
      if (occurrences > 1) {
        const line = source.slice(0, m.index).split('\n').length;
        found.push({ where: `${file}:${line}`, target, needle, occurrences });
      }
    }
  }
  return found;
}

describe('what the guards assert against', () => {
  it('never reads a whole file for a needle that file carries more than once', () => {
    const offenders = ambiguous().map(
      (a) => `${a.where}\n     '${a.needle}' occurs ${a.occurrences}x in ${a.target}\n` +
        '     → declarationOf(source, name), or a regex naming the construct',
    );
    expect(offenders).toEqual([]);
  });

  it('is looking at something, rather than finding nothing to look at', () => {
    /*
     * The clause above passes trivially if the scan matches no `expect` at all — which is
     * how a check like this rots: a suite renames its helper, the pattern stops matching,
     * and an empty list is reported as a clean bill of health. §6.56's rule, applied to a
     * guard reading guards. Measured at the time of writing: 60-odd whole-file
     * assertions across eight files.
     */
    let subjects = 0;
    for (const file of testFiles('app/src')) {
      const source = read(file);
      for (const m of source.matchAll(/expect\(\s*(read\('[^']*'\)|\w+)\s*[,)]/g)) {
        if (wholeFileRead(m[1], source)) subjects++;
      }
    }
    expect(subjects, 'the scan found no whole-file assertions, so it proved nothing')
      .toBeGreaterThan(30);
  });
});
