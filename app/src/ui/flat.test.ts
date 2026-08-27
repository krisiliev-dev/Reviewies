import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { stripComments } from '@reviewies/core/test/source';
import { elevation, color } from '@reviewies/core/tokens';

/**
 * Depth is three ground steps and a hairline. There are no elevation tokens, and that is
 * the token.
 *
 * This is the one guard in the set that protects a property the code already has rather
 * than one it must acquire: a census found zero shadow props in the whole phone app. It
 * is therefore the cheapest to land and the most likely to be worth having in a year,
 * because "we never used shadows" is folklore until something asserts it.
 *
 * Blur is refused for a reason worth stating, because it is the one that will be argued
 * with: a blurred surface makes contrast depend on whatever happens to be scrolling
 * behind it, so `contrast.test.ts` can no longer check it — and a rule that cannot be
 * checked is a rule this codebase does not have.
 */
const ROOT = resolve(import.meta.dirname, '../../..');

function sources(dir: string, exts: RegExp, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.expo') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, exts, out);
    else if (exts.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

const phone = ['mobile/app', 'mobile/src'].flatMap((t) => sources(resolve(ROOT, t), /\.tsx?$/));
const web = sources(resolve(ROOT, 'app/src'), /\.(tsx?|css)$/);

const SHADOW = /\b(shadowColor|shadowOpacity|shadowRadius|shadowOffset|elevation)\s*:/;
const BLUR = /\b(shadow-(?!none)[a-z0-9[]|drop-shadow|backdrop-blur|blur-(?!none)[a-z0-9[])/;

describe('the flat rule', () => {
  it('reads both trees rather than nothing', () => {
    expect(phone.length).toBeGreaterThan(30);
    expect(web.length).toBeGreaterThan(30);
  });

  it('describes depth as grounds, not as a scale', () => {
    // Three names, each pointing at a ground. A fourth would mean somebody wanted a
    // shadow and gave it a different name.
    expect(Object.keys(elevation)).toEqual(['sunken', 'base', 'raised']);
    for (const ground of Object.values(elevation)) {
      expect(color.dark).toHaveProperty(ground);
    }
  });

  it('has no shadow on the phone', () => {
    const offenders = phone
      .filter((f) => SHADOW.test(stripComments(readFileSync(f, 'utf8'))))
      .map((f) => relative(ROOT, f));
    expect(offenders, 'depth is a ground step and a rule').toEqual([]);
  });

  it('has no shadow or blur on the web', () => {
    const offenders = web
      .filter((f) => {
        const source = stripComments(readFileSync(f, 'utf8'));
        return SHADOW.test(source) || BLUR.test(source);
      })
      .map((f) => relative(ROOT, f));
    expect(offenders, 'a blurred surface cannot have its contrast checked').toEqual([]);
  });
});
