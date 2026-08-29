import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NOT_A_REVEAL, REVEALS } from '@reviewies/core/ui/reveals';

/**
 * Every reveal is photographed open, and every reveal is in the register.
 *
 * §6.157 found that `18-lists-in.png` shows two **collapsed** list rows and the signed-in
 * pass has never opened one. The row that shows a list's titles had never been photographed
 * on either platform.
 *
 * The shape of that is worse than the instance. §6.129's rule — composing is revealed, not
 * resident — has been applied five times, and **every application moves content out of the
 * shot the design track takes**. The product got better and its coverage got worse, once per
 * sprint, with nothing connecting the two. A register alone would not have stopped it: what
 * stops it is the second clause below, which finds a revealed state in a screen that nobody
 * registered.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const withoutProse = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist', 'dist-signedin', 'dist-real', '.expo'].includes(entry.name)) {
      continue;
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(path, out);
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

const SCREENS = [...filesUnder('app/src'), ...filesUnder('mobile/app'), ...filesUnder('mobile/src')];

/** The capture scripts, which are where a shot name has to appear to have been taken. */
const CAPTURES = ['design/capture.mjs', 'design/capture-signedin.mjs', 'design/capture-web.mjs'];

describe('a state you have to open', () => {
  it('is registered with what it shows and where it is photographed', () => {
    expect(REVEALS.length, 'the register is empty').toBeGreaterThan(5);
    for (const reveal of REVEALS) {
      expect(reveal.shows.length, `${reveal.shot} does not say what it shows`).toBeGreaterThan(20);
      expect(reveal.screens.length, `${reveal.shot} names no screen`).toBe(2);
      reveal.screens.forEach((screen, i) => {
        // The file exists and actually holds the state the register names — per platform,
        // because the two do not always agree: the lists disclosure is `openId` on the web
        // and `open` on the phone, which the register records rather than smooths over.
        const source = withoutProse(read(screen));
        expect(source, `${screen} has no ${reveal.states[i]} state`).toMatch(
          new RegExp(`\\[${reveal.states[i]}, set`),
        );
      });
    }
  });

  it('is photographed open by a capture script', () => {
    /*
     * The shot name, in a capture script. Screenshots are not committed — `design/.gitignore`
     * says why — so the thing a source clause can hold is that somebody wrote the walk.
     *
     * A run that cannot reach the state still fails at the time, because every shot carries
     * a needle: `capture.mjs`'s `MUST_SHOW` and §6.157's `shoot(…, mustContain)`. The two
     * halves are the pair — this one says a walk was written, that one says it arrived.
     */
    const scripts = CAPTURES.map(read).join('\n');
    const unphotographed = REVEALS.filter((r) => !scripts.includes(r.shot));
    expect(unphotographed.map((r) => `${r.shot} — ${r.shows}`)).toEqual([]);
  });

  it('has nothing revealed in a screen that the register has never heard of', () => {
    /*
     * The half that matters. A register somebody has to remember to add to is a register
     * that goes stale the first sprint anybody is busy — and this whole task exists because
     * five reveals were added over five sprints and the design track noticed none of them.
     *
     * So: find the shape in the source. A `useState` seeded `false` or from a `*_OPEN` rule,
     * on a screen, is a revealed state; anything found that is neither registered nor
     * excused by name is the sprint's finding.
     */
    const found = new Set<string>();
    for (const file of SCREENS) {
      const source = withoutProse(read(file));
      for (const [, name] of source.matchAll(
        /const \[(\w+), set\w+\] = useState(?:<[^>]*>)?\(\s*(?:false|\w+_OPEN)\s*\)/g,
      )) {
        found.add(name);
      }
    }

    expect(found.size, 'the sweep found no revealed state at all').toBeGreaterThan(4);
    const registered = new Set(REVEALS.flatMap((r) => r.states));
    const unknown = [...found].filter((n) => !registered.has(n) && !(n in NOT_A_REVEAL));
    expect(unknown, 'a screen reveals something the register has never heard of').toEqual([]);
  });

  it('keeps no excuse for a state that no longer exists', () => {
    // §6.41, and `screen.test.ts` does the same for its two exemption tables: an excuse that
    // outlives its condition is the next thing to mislead somebody.
    const sources = SCREENS.map(read).join('\n');
    for (const name of Object.keys(NOT_A_REVEAL)) {
      expect(sources, `${name} is excused and no longer exists`).toContain(name);
      expect(
        NOT_A_REVEAL[name].length,
        `${name} is excused without a reason`,
      ).toBeGreaterThan(30);
    }
  });
});
