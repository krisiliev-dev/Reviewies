import { describe, expect, it } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * A failure that renders as absence.
 *
 * Twice this codebase has shipped the same bug in different clothes. The match-imports
 * screen went back to offering its button when a run failed, which looks identical to a
 * run that found nothing to do. And `{ data: null, error }` from supabase-js became an
 * empty array, so a broken query and an empty account are the same screen.
 *
 * The shape is always `if (error || !data) return []`. Two opposite facts — "there are
 * none" and "we could not ask" — collapse into one value, and every caller downstream
 * reads the first. The worst of them was content warnings, where "nobody has flagged
 * anything" is what somebody avoiding a trigger reads as an answer; the most expensive
 * was `fetchLists`, which `restoreAccount` uses to know what is already there, so a
 * failed read looked like an empty account and would have duplicated every list.
 *
 * So: a read whose emptiness a person or a decision depends on has to say which kind of
 * empty it is. The exemptions are the interesting part — each is somebody deciding that
 * this particular absence is safe to be silent about, written down where the next
 * person will have the same doubt.
 *
 * `fetchComments` is not in that list and is worth naming here: it already answers the
 * question, because `gated` says whether the server withheld the comments or there were
 * none. It was the shape everything else is being brought to, and it was written that
 * way from the start.
 */
const ROOT = resolve(__dirname, '../../..');

/**
 * Reads where returning nothing on failure is right, and why.
 *
 * The test is not that these are rare. It is that each one was thought about.
 */
const SILENT: Record<string, string> = {
  'social/people.ts:fetchBlocked':
    'Feeds a filter, never a screen. Failing open would show blocked people; failing closed shows nobody, which is the safe direction and is what an empty list does.',
  'social/people.ts:fetchEdge':
    'Following and followers. Worth distinguishing eventually; the screens say "Nobody yet" and the distinction has not been wired through. Named here rather than left looking deliberate.',
  'social/people.ts:searchPeople':
    'Same. A failed search reads as "no such person", which is misleading, and is the next one of these to fix.',
  'social/people.ts:findByHandle':
    'A failed lookup makes restoreAccount report "@name could not be found", which is a wrong statement about somebody else\'s account. Smaller than the harms fixed here — it skips rather than duplicating, and trying again fixes it — but it is wrong and unfinished rather than deliberate.',
  'social/contentWarnings.ts:fetchMyWarningVotes':
    'Your own positions, used to highlight buttons. Losing them shows no highlight rather than a wrong one.',
};

function readsIn(file: string): string[] {
  const source = readFileSync(resolve(ROOT, file), 'utf8');
  const found: string[] = [];
  let current = 'top-level';

  for (const line of source.split('\n')) {
    const declared = /^(?:export )?(?:async )?function ([A-Za-z0-9_]+)|^const ([A-Za-z0-9_]+) = (?:async )?\(/.exec(line);
    if (declared) current = declared[1] ?? declared[2];
    // The shape: an error checked and answered with emptiness.
    if (/if \(error[^)]*\) return (\[\]|undefined|new Map\(\))/.test(line)) {
      found.push(`${file.replace('core/src/', '')}:${current}`);
    }
  }
  return found;
}

describe('reads that answer a failure with emptiness', () => {
  const reads = globSync('core/src/social/*.ts', { cwd: ROOT })
    .filter((f) => !f.includes('.test.'))
    .flatMap(readsIn);

  it('is looking at the code it means to', () => {
    // If the pattern stops matching, everything below passes for the wrong reason.
    expect(reads.length).toBeGreaterThan(2);
  });

  it('has a written reason for every one of them', () => {
    expect(reads.filter((read) => !(read in SILENT))).toEqual([]);
  });

  it('keeps no reason for a read that no longer does it', () => {
    // Otherwise the list fills up with excuses for code that was fixed, and nobody can
    // tell which ones still mean anything.
    expect(Object.keys(SILENT).filter((key) => !reads.includes(key))).toEqual([]);
  });
});
