import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { stripComments } from '@reviewies/core/test/source';

/**
 * An unavailable control steps its colour. It never fades.
 *
 * The web has refused `disabled:opacity` on a filled action since `appearance.test.ts`
 * was written, and the reason is recorded there: it "gave a maroon block with dark red
 * lettering — it read as broken rather than as waiting". **The phone had eight of these
 * and no guard at all**, which is the asymmetry §6.94 closed.
 *
 * There is a second argument the web's version does not make, and it is the stronger one:
 * an `opacity` is invisible to a contrast check for ever. §6.90 made exactly this case for
 * Watching Mode's auto-dim — "the dim is a palette, not an opacity" — and a disabled
 * control is the same problem with a different name. A named colour can be measured; 0.4
 * of an unnamed one cannot.
 *
 * Scoped to the phone, because the web's half already exists in `appearance.test.ts` and
 * two guards saying the same thing about one platform is how a rule ends up half-enforced.
 */
const ROOT = resolve(import.meta.dirname, '../../..');

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.expo') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

const PHONE = ['mobile/app', 'mobile/src'].flatMap((t) => sources(resolve(ROOT, t)));

/**
 * A fractional opacity in a StyleSheet. Not `opacity: 1` and not `opacity: 0` — the first
 * is a no-op and the second is "not here at all", which is a different decision from
 * "here but unavailable" and is checked by the parked-off-screen rule instead.
 */
const FADE = /\bopacity:\s*0?\.\d+/g;

/**
 * The reaction stream's drift is the one fractional opacity that is not a state.
 *
 * It is a moving emoji fading as it crosses the band — decoration, on a surface with no
 * text on it, and the thing it is doing is *motion*. This is a rule about what an
 * unavailable control looks like; it has nothing to say about that.
 */
const NOT_A_STATE: Record<string, string> = {
  'mobile/src/ui/ReactionStream.tsx': 'A reaction fading as it drifts is motion, not a state.',
};

describe('what an unavailable control looks like on the phone', () => {
  it('reads the tree rather than nothing', () => {
    expect(PHONE.length).toBeGreaterThan(40);
    // Non-vacuous: the pattern must still find the one legitimate use.
    const stream = readFileSync(resolve(ROOT, 'mobile/src/ui/ReactionStream.tsx'), 'utf8');
    expect(stripComments(stream)).toMatch(FADE);
  });

  it('steps a colour rather than fading', () => {
    const off: string[] = [];
    for (const path of PHONE) {
      const rel = relative(ROOT, path);
      if (rel in NOT_A_STATE) continue;
      const text = stripComments(readFileSync(path, 'utf8'));
      text.split('\n').forEach((line, index) => {
        for (const match of line.matchAll(FADE)) off.push(`${rel}:${index + 1}  ${match[0]}`);
      });
    }
    expect(off, 'a fade cannot be measured; a named colour can').toEqual([]);
  });

  it('keeps no excuse for a file that has stopped fading', () => {
    // The same shape as every other exemption in this repository: an entry that is no
    // longer needed fails, rather than sitting there being wrong (§6.59).
    for (const [rel, reason] of Object.entries(NOT_A_STATE)) {
      const text = stripComments(readFileSync(resolve(ROOT, rel), 'utf8'));
      expect(text, `${rel} no longer fades: ${reason}`).toMatch(FADE);
    }
  });
});
