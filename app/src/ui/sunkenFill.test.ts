import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SUNK_FILLS } from '@reviewies/core/ui/surface';

/**
 * Every static sunken fill in the product names its reason, or it is not there.
 *
 * `surface.ts` says what the sunken ground is for — *held down, and the inside of a plate*
 * — and a press is self-limiting: it exists while a finger is on it, and both platforms
 * write it as `active:` or a pressed style. A fill that is simply **painted and left** is
 * the other half, and until §6.167 nothing had counted them.
 *
 * The one that started it is `15-title.png`: the streaming service drawn as a `groundWell`
 * plate inside the `groundRaised` *Where to watch* card — two steps darker than its own
 * container, the only element in a hundred and thirty screenshots darker than the thing it
 * sits in, and neither a control nor an input. Nothing was wrong with the colour; the fill
 * was the whole mistake.
 *
 * The shape is `bareControl.test.ts`'s EXEMPT table: a sentence per entry, so the next one
 * has to be argued for rather than typed. This is not a ban — nine of these are wells and
 * belong — it is a requirement to say which.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const withoutProse = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/** Every screen and component either platform draws. */
const TREES = ['app/src', 'mobile/app', 'mobile/src'];

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist', 'dist-signedin', 'dist-real', '.expo'].includes(entry.name)) continue;
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) filesUnder(path, out);
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

/**
 * A sunken fill that is not a press.
 *
 * A press is self-limiting — it exists while a finger is down — so `active:bg-ground-well`
 * is not what this is about. Every other Tailwind prefix is: `disabled:bg-ground-well` is a
 * fill painted and left for as long as the control cannot be pressed, which is why
 * `MatchImports` is in the table and not exempt from it. So the variant chain in front of
 * the utility is read rather than the whole line, and only `active` clears it.
 *
 * The phone writes `theme.groundWell`, and its presses live in `Pressable`'s `pressed`
 * style — the same token spelled the same way, with no prefix to read — so there the test
 * is whether the word `pressed` is on the line.
 */
function staticSunkenFills(source: string): string[] {
  const hits: string[] = [];
  for (const line of withoutProse(source).split('\n')) {
    for (const [, prefixes] of line.matchAll(/([\w:-]*?)bg-ground-well/g)) {
      if (!prefixes.split(':').includes('active')) hits.push(line.trim());
    }
    if (/theme\.groundWell/.test(line) && !/pressed/.test(line)) hits.push(line.trim());
  }
  return hits;
}

describe('the sunken ground, where it is painted and left', () => {
  it('is claimed by a file that actually paints one', () => {
    // Non-vacuity from the other side: a table entry for a file that has stopped painting
    // one is a reason nobody can check, which is §6.41's shape in a register.
    const stale = Object.keys(SUNK_FILLS).filter((path) => staticSunkenFills(read(path)).length === 0);
    expect(stale, 'a file in SUNK_FILLS no longer paints one').toEqual([]);
  });

  it('carries a sentence beside each name, which is all a length can tell', () => {
    /*
     * Named for what it proves rather than for what the register is for.
     *
     * The first draft of this said "gives a reason, not just a name" and a plant walked
     * straight through it: `'a name and not a reason'` is six words, and six words pass a
     * length check. A word count cannot read an argument — §6.153's shape, an instrument
     * that can only return one kind of answer — so the clause says *length*, and the
     * reading is the reviewer's job. What it does buy is the thing the register is for: a
     * new entry cannot be waved through with a word.
     */
    const thin = Object.entries(SUNK_FILLS).filter(([, why]) => why.split(' ').length < 5);
    expect(thin, 'an entry too short to be a sentence').toEqual([]);
  });

  it('is painted nowhere the register does not name', () => {
    const unclaimed: string[] = [];
    for (const dir of TREES) {
      for (const file of filesUnder(dir)) {
        if (file in SUNK_FILLS) continue;
        for (const line of staticSunkenFills(read(file))) {
          unclaimed.push(`${file}: ${line}`);
        }
      }
    }
    expect(
      unclaimed,
      'a sunken fill nobody has said what is meant to sit in it — see core/src/ui/surface.ts',
    ).toEqual([]);
  });
});
