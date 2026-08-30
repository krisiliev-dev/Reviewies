import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { globSync } from 'node:fs';

/**
 * The phone's only route to WCAG 1.4.4, guarded where it can be.
 *
 * The web app is checked properly: app/smoke.mjs renders every screen with the root
 * font size doubled and fails if the page grows a horizontal scrollbar or a control
 * leaves the viewport. It found two real defects that way — the star rating pushed off
 * the side of the screen, twice, the second time because the 48px minimum had been
 * written in rem and so doubled along with the text.
 *
 * The phone cannot be checked the same way. Text there scales through the operating
 * system's own setting, which react-native-web does not implement, so the export the
 * smoke suite drives renders at a fixed size whatever is asked of it. What is left to
 * guard is the thing that would silently switch the feature off: React Native scales
 * text only while `allowFontScaling` stays on, and one component opting out is invisible
 * until someone with large text opens that screen.
 *
 * There are three ways to break it and this file used to know two. Off, capped — and
 * **twice**, which is this sprint's finding and the clause at the bottom of this file.
 */
const ROOT = resolve(__dirname, '../../..');

function phoneSources(extension = 'tsx'): Array<{ path: string; source: string }> {
  return globSync(`mobile/{app,src}/**/*.${extension}`, { cwd: ROOT })
    .filter((path) => !path.includes('.test.'))
    .map((path) => ({ path, source: readFileSync(resolve(ROOT, path), 'utf8') }));
}

/**
 * Every phone source, screens and plain modules alike.
 *
 * The two clauses above read `.tsx` because a component is the only thing that can carry an
 * `allowFontScaling` prop. The clause at the bottom cannot: `mobile/src/ui/theme.ts` is where
 * `leadingOf` and `tracking` live, it has no JSX in it, and it is the one file where a single
 * line breaks every call site at once.
 */
const allPhoneSources = () => [...phoneSources('ts'), ...phoneSources('tsx')];

/**
 * A style property's whole value, to the end of it.
 *
 * Not a regex, and the reason is that the first draft of the clause below **was** one —
 * `/(?:lineHeight|letterSpacing):[^,;}\n]+/` — which gives up at the first comma, and the
 * first comma in `lineHeight: leadingOf(text.s14, leading.l143) * fontScale` is inside the
 * call. The clause read `lineHeight: leadingOf(text.s14`, found no scale in it, and passed
 * a live plant. §6.183 caught `padCell`'s repair the same way, one brace along: a guard's
 * own pattern is the last thing anybody plants against, and the only way to find it is to
 * plant.
 *
 * So the value is read by balancing brackets and stopping at the comma that actually ends
 * the property. Newlines are not an end — a value may be wrapped — which is why depth is
 * the thing being tracked rather than a line.
 */
function valuesOf(source: string, at: RegExp): string[] {
  const out: string[] = [];
  for (const match of source.matchAll(at)) {
    let depth = 0;
    let end = match.index + match[0].length;
    for (; end < source.length; end++) {
      const c = source[end];
      if ('([{'.includes(c)) depth++;
      else if (')]'.includes(c)) depth--;
      else if (c === '}') {
        if (depth === 0) break;
        depth--;
      } else if ((c === ',' || c === ';') && depth === 0) break;
      if (depth < 0) break;
    }
    out.push(source.slice(match.index, end));
  }
  return out;
}

describe('text scaling on the phone', () => {
  it('is never switched off', () => {
    const files = phoneSources();

    // Non-vacuous: a glob that matched nothing would pass the assertion below happily.
    expect(files.length).toBeGreaterThan(15);
    expect(files.some(({ source }) => source.includes('<Text'))).toBe(true);

    const optedOut = files
      .filter(({ source }) => /allowFontScaling\s*=\s*\{?\s*false/.test(source))
      .map(({ path }) => path);

    expect(optedOut).toEqual([]);
  });

  /**
   * The sequel to the check above, one line further on.
   *
   * `allowFontScaling={false}` switches scaling off and is the obvious defect.
   * `maxFontSizeMultiplier={1.4}` leaves it on and caps it, which is the same defect
   * wearing a reasonable face — and it is the change most likely to be made in good
   * faith, by somebody stopping a heading wrap at 200% without realising they have just
   * decided how large this app is allowed to be for everyone who needs it larger.
   *
   * Geometry reflows instead. That is what the equal-width transport cells are for.
   */
  it('never caps how far text may scale', () => {
    const files = phoneSources();
    expect(files.length).toBeGreaterThan(15);

    const capped = files
      .filter(({ source }) => /maxFontSizeMultiplier/.test(source))
      .map(({ path }) => path);

    expect(capped, 'let the layout reflow rather than capping the type').toEqual([]);
  });

  /**
   * The third way, and the one that looks like the fix.
   *
   * ## The fact this rests on
   *
   * A `lineHeight` handed to React Native is **already in the unit the platform scales**.
   * In the version this repo depends on:
   *
   * - iOS, both renderers: `lineHeight * effectiveFontSizeMultiplier`, which is the very
   *   same multiplier that grows the glyphs — `Libraries/Text/RCTTextAttributes.mm` and
   *   `ReactCommon/.../RCTAttributedTextUtils.mm`.
   * - Android: `toPixelFromSP(lineHeight)` whenever `allowFontScaling` is on, `sp` being
   *   the font-scaled unit — `TextAttributeProps.kt`, which puts `letterSpacing` through
   *   the same conversion.
   *
   * So multiplying a leading by `useWindowDimensions().fontScale` does not make it answer
   * the reader's setting. It makes it answer twice: at 200% a `leadingOf(14, 1.43)` of 20
   * ships as 40 and the platform draws it at 80, around 28pt glyphs. The lines do not
   * collide, they drift a line apart, which is a worse failure than the one it was meant to
   * repair and a much quieter one.
   *
   * ## Why a source clause and not a measurement
   *
   * Because there is nothing here to measure. `react-native-web` hardcodes
   * `Dimensions.fontScale` to 1 and `PixelRatio.getFontScale()` reads it, so the double
   * would be exactly 1x in the export every suite and every design pass drives — green
   * everywhere, wrong on both devices. That asymmetry is the whole reason this belongs in a
   * clause rather than in `mobile/smoke.mjs`.
   *
   * ## And it would not have fixed the one thing a phone has actually clipped
   *
   * The first device session found text cropped at the bottom of Up Next rows and the More
   * menu's rows at maximum Dynamic Type — the only text-scaling defect anything has observed
   * on real glass. Both screens draw those rows with `mobile/src/ui/Row.tsx`, and that file
   * sets **no `lineHeight` at all**. So the repair this clause forbids would have rewritten
   * eleven call sites, none of them the one that clips, and broken the leading on both
   * platforms on the way past. The fault at that site is argued out in `Row.tsx` itself.
   *
   * ## What is deliberately still allowed
   *
   * A font scale read for a **box**. `TAB_BAR_HEIGHT` is a module-load constant built from
   * a label's line box, and a bar sized for 17pt of label at 100% holds 17pt of label at
   * 300%; a `height` is not a unit React Native scales, so multiplying one is the correct
   * repair rather than a double. The rule is about the two properties the platform already
   * scales, and it is written that way so that fixing the boxes does not have to fight it —
   * §6.183's other lesson, that a guard which goes red on a repair is as wrong as one that
   * stays green on a defect.
   *
   * A scale reaching a `letterSpacing` **under an explicit `Platform.OS === 'ios'`** is
   * allowed too, and that is not a loophole, it is the one place the two shipping platforms
   * genuinely disagree: Android runs tracking through `toPixelFromSP` and iOS hands it to
   * `NSKernAttributeName` raw, so on iOS alone the tracking really does hold at 0.996pt
   * while the glyphs double — measured in the export at 0.083em, 0.042em and 0.028em across
   * 100/200/300%. Unconditionally multiplying it would fix iOS and double Android. Nobody
   * has taken that repair; if somebody does, this clause requires them to name the platform
   * they are taking it for.
   */
  it('never scales a leading or a tracking twice', () => {
    const files = allPhoneSources();
    expect(files.length).toBeGreaterThan(15);
    // Non-vacuous: the two properties have to be in the corpus for the sweep to mean anything.
    expect(files.filter(({ source }) => /lineHeight:/.test(source)).length).toBeGreaterThan(4);
    expect(files.filter(({ source }) => /letterSpacing:/.test(source)).length).toBeGreaterThan(1);

    const doubled: string[] = [];
    for (const { path, source } of files) {
      /*
       * The bindings a font scale can be sitting in, not the spelling `fontScale` — a plant
       * that reads `const { fontScale } = useWindowDimensions()` and then writes `* s` is
       * the same defect and the obvious next spelling of it. Both destructured and plain
       * assignments, because `PixelRatio.getFontScale()` arrives as neither.
       */
      const names = new Set(['fontScale']);
      for (const [, inner] of source.matchAll(/(?:const|let)\s*\{([^}]*)\}\s*=[^;\n]*/g)) {
        if (!/\bfontScale\b/.test(inner)) continue;
        for (const part of inner.split(',')) {
          const [from, to] = part.split(':').map((x) => x.trim());
          if (from === 'fontScale') names.add(to || from);
        }
      }
      for (const [, name] of source.matchAll(
        /(?:const|let)\s+(\w+)\s*=[^;\n]*(?:\bfontScale\b|getFontScale\s*\()/g,
      )) {
        names.add(name);
      }

      const scaled = new RegExp(`\\b(?:${[...names].join('|')})\\b|getFontScale\\s*\\(`);
      for (const declaration of valuesOf(source, /\b(?:lineHeight|letterSpacing):/g)) {
        if (!scaled.test(declaration)) continue;
        // Named above: iOS is the one platform that does not scale a kern for itself.
        const iosOnly =
          /letterSpacing:/.test(declaration) && /Platform\.OS === 'ios'/.test(declaration);
        if (!iosOnly) doubled.push(`${path}: ${declaration.trim()}`);
      }

      /*
       * And the same rule one layer in, because the tempting version of this is one line in
       * `theme.ts` rather than twenty at the sites — and a call site that says only
       * `leadingOf(text.s14, leading.l143)` is invisible to the sweep above. `note.test.ts`
       * and `type.test.ts` seal these two bodies by substring, which both of this sprint's plants
       * kept while breaking the behaviour: `Math.round(size * ratio) * getFontScale()` still
       * contains `Math.round(size * ratio)`.
       */
      if (path.endsWith('mobile/src/ui/theme.ts') || path === 'mobile/src/ui/theme.ts') {
        for (const [body] of source.matchAll(
          /export function (?:leadingOf|tracking)\([^)]*\)[^{]*\{[^}]*\}/g,
        )) {
          if (scaled.test(body)) doubled.push(`${path}: the derivation itself`);
        }
      }
    }

    expect(
      doubled,
      'React Native already scales these by the font scale; multiplying scales them twice',
    ).toEqual([]);
  });

  it('keeps the rating targets in absolute units', () => {
    // 24 CSS pixels is what WCAG 2.5.8 asks for, and it does not scale with text. On
    // the phone that is a plain number, which is already absolute; the web equivalent
    // was written in rem first and doubled, which is the mistake this remembers.
    const phone = readFileSync(resolve(ROOT, 'mobile/src/ui/StarRating.tsx'), 'utf8');
    expect(phone).toMatch(/const MIN_HALF = 24;/);

    const web = readFileSync(resolve(ROOT, 'app/src/ui/StarRating.tsx'), 'utf8');
    /*
     * The className attributes only. The comment above them names the mistake it is
     * remembering, and a test that reads prose would fail on the explanation.
     *
     * Template literals as well as quoted strings, since §6.143: the size class moved onto
     * this box when the glyph became a drawing, so the attribute became
     * `` className={`… ${text}`} `` and this clause failed — **with the 48px still in it**.
     * It was pinned to a quoting style rather than to the property it is named for, which
     * is the shape §6.139 wrote down, in a guard that had been right for twenty sections.
     */
    const classNames = [...web.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map(
      ([, quoted, templated]) => quoted ?? templated,
    );
    expect(classNames.some((value) => value.includes('min-w-[48px]'))).toBe(true);
    expect(classNames.some((value) => /\bmin-[wh]-\d/.test(value))).toBe(false);
  });
});
