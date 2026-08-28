import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { stripComments } from '@reviewies/core/test/source';
import { elevation, color, radius } from '@reviewies/core/tokens';

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
 *
 * Radius belongs to the same rule and arrived later, with its 244 sites (§6.89). Late
 * Edition's argument is that every card in the old build was a rounded fill doing a
 * rule's job, and printed images have square corners — so the answer is three values and
 * a decision per site, not a scale. `none` for structure, `plate` for anything printed,
 * `pill` for the action shape and for things that are literally capsules. There is no
 * `sm`/`md`/`lg`/`xl` any more on either platform, which is what makes this checkable:
 * a fourth value would have to be typed as a number, and a number is what this catches.
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

/** `borderRadius: 12`, `borderTopLeftRadius: 8` — a number where a token belongs. */
const PHONE_RADIUS = /\bborder(?:Top|Bottom)?(?:Left|Right|Start|End)?Radius\s*:\s*[\d'"`]/g;

/** The legacy four, by name, on either platform. */
const LEGACY = /\bradius\.(sm|md|lg|xl)\b/g;

/**
 * Tailwind's own radius scale. `rounded-plate`, `rounded-none` and `rounded-pill` are
 * generated from the token table; everything else in the namespace is Tailwind's default
 * scale, which is the thing being replaced.
 */
const WEB_RADIUS =
  /\brounded(?:-(?:t|b|l|r|tl|tr|bl|br|s|e))?-(?:sm|md|lg|xl|2xl|3xl|full)\b|\brounded(?![-a-z])/g;
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

  it('describes radius as three values, not as a scale', () => {
    expect(Object.keys(radius)).toEqual(['none', 'plate', 'pill']);
    expect(radius.plate, 'a plate is a printed edge, not a rounded fill').toBeLessThan(4);
  });

  it('types no radius as a number on the phone', () => {
    const off: string[] = [];
    for (const path of phone) {
      const source = stripComments(readFileSync(path, 'utf8'));
      source.split('\n').forEach((line, index) => {
        for (const match of line.matchAll(PHONE_RADIUS)) {
          off.push(`${relative(ROOT, path)}:${index + 1}  ${match[0].trim()}`);
        }
      });
    }
    expect(off, 'radius.none | radius.plate | radius.pill').toEqual([]);
  });

  it('keeps no legacy radius name on either platform', () => {
    // `theme.ts` exported sm/md/lg/xl until every one of its 99 phone sites moved. The
    // export is deleted rather than deprecated: a legacy name that survives its last
    // call site is the next thing somebody reaches for out of habit.
    const off: string[] = [];
    for (const path of [...phone, ...web]) {
      const source = stripComments(readFileSync(path, 'utf8'));
      source.split('\n').forEach((line, index) => {
        for (const match of line.matchAll(LEGACY)) {
          off.push(`${relative(ROOT, path)}:${index + 1}  radius.${match[1]}`);
        }
      });
    }
    expect(off).toEqual([]);
  });

  it('writes no radius utility off the three on the web', () => {
    const off: string[] = [];
    let seen = 0;
    for (const path of web) {
      const source = stripComments(readFileSync(path, 'utf8'));
      source.split('\n').forEach((line, index) => {
        for (const match of line.matchAll(WEB_RADIUS)) {
          off.push(`${relative(ROOT, path)}:${index + 1}  ${match[0]}`);
        }
        seen += (line.match(/\brounded(?:-(?:t|b|l|r|tl|tr|bl|br|s|e))?-(?:none|plate|pill)\b/g) ?? []).length;
      });
    }
    // A scan that matched nothing at all would report no offenders and look like success.
    //
    // 99 after sprint 15, because every `rounded-pill` that was a hand-built accent
    // button went into `Button`, which writes one. Set to 80 rather than 95: a floor
    // trimmed to today's count fails on the next honest deletion and gets nudged again,
    // and this is here to notice a scan that has stopped matching, not to hold a total.
    /*
     * 78, down from 81, because `Poster` took `rounded-plate` off seven call sites and gave
     * it to one component — the same shrinkage `type.test.ts` and `space.test.ts` took when
     * `Section` and `Field` landed. The floor moves with the population rather than being
     * left slack above it; a slack floor is what let nine deleted tests through in §6.107.
     */
    /*
     * 74, down from 78. Four `rounded-plate` card fills went when `Block` replaced the
     * boxed section headings on `AccountPanel` and `People` — the population falling
     * because a component took the decision, which is the fourth sprint running that this
     * floor has moved for that reason rather than because a scan broke.
     */
    /*
     * 70, down from 74: four `rounded-plate` card fills became ruled rows. Fifth sprint
     * running this floor has moved because a fill stopped being a fill, which is the
     * direction's whole argument arriving one migration at a time.
     */
    /*
     * 51, down from 70 — the largest single fall this floor has taken, and the first from
     * a *call-site* migration rather than a component one. §6.131 turned nineteen
     * hand-drawn `rounded-pill` and `rounded-plate` controls into `Button`s across both
     * platforms. The population shrinks because the decision moved, which is the sixth
     * sprint running this has been the reason.
     */
    expect(seen, 'the web writes no radius utility at all').toBeGreaterThan(51);
    expect(off, 'rounded-none | rounded-plate | rounded-pill').toEqual([]);
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
