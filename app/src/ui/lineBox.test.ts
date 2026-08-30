import { describe, expect, it } from 'vitest';
import { globSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { leading, text, type } from '@reviewies/core/tokens';
import { ROW_LEADING, ROW_LINES } from '@reviewies/core/ui/row';
import { NOTE } from '@reviewies/core/ui/note';
import { FIELD_BOX } from '@reviewies/core/ui/field';

/**
 * A leading may not be tighter than the face it is set in, because on iOS that crops.
 *
 * ## The fact this rests on, which nothing here could previously state
 *
 * React Native does not treat a `lineHeight` as a suggestion. It sets **both** ends of the
 * paragraph style to it:
 *
 * ```objc
 * CGFloat lineHeight = _lineHeight * self.effectiveFontSizeMultiplier;
 * paragraphStyle.minimumLineHeight = lineHeight;
 * paragraphStyle.maximumLineHeight = lineHeight;   // Libraries/Text/RCTTextAttributes.mm:140–143
 * ```
 *
 * `maximumLineHeight` is a clamp. Below the face's own line box it does not loosen or
 * tighten the setting — it makes the line fragment shorter than the glyphs standing in it,
 * and TextKit then draws them into a frame that no longer holds them. The loss is bottom
 * first, it is a fixed fraction of the em, and so it is invisible at 100% and grows with the
 * reader's Dynamic Type setting: **exactly** the shape the only device report this product
 * has ever had describes, *"text is clipped at the bottom"* at the largest step.
 *
 * ## Why it has to be a clause and cannot be a measurement here
 *
 * `react-native-web` emits `line-height` as an ordinary CSS rule, and CSS lets glyphs
 * overflow a short line box in plain sight rather than cropping them. So the export that
 * `mobile/smoke.mjs` drives and that every design pass photographs would show a tight
 * leading as *slightly overlapping lines* and never as a crop — green here, cropped on the
 * one platform that ships. That asymmetry is `phoneTextScaling.test.ts`'s argument for its
 * own third clause, and this is its sibling: same file, same platform, the other direction.
 *
 * ## Why it reads the fonts rather than a list of ratios
 *
 * Because the rule is about a **pair**. `l120` is 1.2 and perfectly safe in Archivo Regular,
 * whose own box is 1.088 em; the same 1.2 in Archivo Narrow, whose box is 1.347 em, clamps
 * away 0.147 em of line — 7.4pt for a reader at the largest step. A clause that blacklisted
 * `l120` would fail a correct change on one face and pass a defect on the other, which is
 * the failure §6.185 and §6.187 between them have now cost four guards. So the box is read
 * out of the `.ttf` itself: `head.unitsPerEm` and `hhea`'s ascender, descender and line gap,
 * which is what CoreText builds a used rect from and what a browser calls `normal`.
 *
 * The six faces, measured rather than typed:
 *
 * | face | its own line box |
 * | --- | --- |
 * | Archivo Narrow Bold / SemiBold | 1.347 em |
 * | Archivo Regular | 1.088 em |
 * | IBM Plex Mono Medium | 1.300 em |
 * | Newsreader Regular / Italic | 1.000 em |
 *
 * Newsreader's is the one worth looking at twice: 1470 up and 530 down on a 2000 unit em,
 * which sums to the em exactly. Nothing can be tighter than that without cropping, and
 * `l100` — which is in the table, for the single glyphs that have no line box worth the name
 * — is precisely that value. It is allowed here, because *equal to* the box is not shorter
 * than it, and a mark set in a face at its own metrics loses nothing.
 */
const ROOT = resolve(import.meta.dirname, '../../..');

/**
 * A face's own line box, in ems, out of the file the app ships.
 *
 * Twenty lines of table walking rather than a dependency, because the two numbers wanted are
 * at fixed offsets in two tables every TrueType file has, and a font library would be a new
 * dependency for `head.unitsPerEm` and three `int16`s. `hhea` and not OS/2 `sTypo`: all six
 * of these faces set `USE_TYPO_METRICS` **and** carry identical values in both, so the
 * choice cannot matter here — and where it ever does, `hhea` is what CoreText reads.
 */
function lineBoxEm(path: string): number {
  const buf = readFileSync(path);
  const tables: Record<string, number> = {};
  for (let i = 0; i < buf.readUInt16BE(4); i++) {
    const at = 12 + i * 16;
    tables[buf.toString('ascii', at, at + 4)] = buf.readUInt32BE(at + 8);
  }
  const upem = buf.readUInt16BE(tables.head + 18);
  const ascender = buf.readInt16BE(tables.hhea + 4);
  const descender = buf.readInt16BE(tables.hhea + 6);
  const lineGap = buf.readInt16BE(tables.hhea + 8);
  return (ascender - descender + lineGap) / upem;
}

/**
 * How far a face's glyphs actually reach, above and below the baseline, in ems.
 *
 * The box above is what a renderer *measures*; this is what the type *does*, and the two
 * questions are different. A single line only needs the box to hold its own glyphs. A run
 * that draws **two** lines needs more than that: line 2's ascenders sit one line box below
 * line 1's baseline, so the two collide unless the leading is at least the whole ink span —
 * the tallest ascender plus the deepest descender. That is the sum this returns.
 *
 * Latin-1 and Latin Extended-A, and no further, because that is what these screens draw and
 * because the whole-font extremes are not a fair test of a reading measure: Archivo Regular
 * has a glyph reaching 0.394 em below the baseline somewhere in its 653, and holding a row
 * title to that would forbid the ratio the whole build is set in for the sake of a character
 * no screen here has ever printed. Where a screen does print one, `design/measure.mjs`'s
 * census reads the ink of the actual words on the actual page and this table is not the
 * instrument.
 */
function inkSpanEm(path: string): number {
  const buf = readFileSync(path);
  const tables: Record<string, number> = {};
  for (let i = 0; i < buf.readUInt16BE(4); i++) {
    const at = 12 + i * 16;
    tables[buf.toString('ascii', at, at + 4)] = buf.readUInt32BE(at + 8);
  }
  const upem = buf.readUInt16BE(tables.head + 18);
  const longLoca = buf.readInt16BE(tables.head + 50) === 1;
  // The format 4 subtable, which every one of these six carries and which covers the whole
  // of the range this cares about.
  const cmap = tables.cmap;
  let sub = 0;
  for (let i = 0; i < buf.readUInt16BE(cmap + 2); i++) {
    const at = cmap + 4 + i * 8;
    const candidate = cmap + buf.readUInt32BE(at + 4);
    if (buf.readUInt16BE(candidate) === 4) sub = candidate;
  }
  const segX2 = buf.readUInt16BE(sub + 6);
  const endO = sub + 14;
  const startO = endO + segX2 + 2;
  const deltaO = startO + segX2;
  const rangeO = deltaO + segX2;
  let above = 0;
  let below = 0;
  for (let cp = 0x20; cp <= 0x17f; cp++) {
    let gid = 0;
    for (let seg = 0; seg < segX2 / 2; seg++) {
      if (cp > buf.readUInt16BE(endO + seg * 2)) continue;
      const from = buf.readUInt16BE(startO + seg * 2);
      if (cp < from) break;
      const delta = buf.readInt16BE(deltaO + seg * 2);
      const range = buf.readUInt16BE(rangeO + seg * 2);
      if (range === 0) gid = (cp + delta) & 0xffff;
      else {
        const at = rangeO + seg * 2 + range + (cp - from) * 2;
        const g = buf.readUInt16BE(at);
        gid = g === 0 ? 0 : (g + delta) & 0xffff;
      }
      break;
    }
    if (!gid) continue;
    const a = longLoca ? buf.readUInt32BE(tables.loca + gid * 4) : buf.readUInt16BE(tables.loca + gid * 2) * 2;
    const b = longLoca
      ? buf.readUInt32BE(tables.loca + gid * 4 + 4)
      : buf.readUInt16BE(tables.loca + gid * 2 + 2) * 2;
    if (a === b) continue;
    above = Math.max(above, buf.readInt16BE(tables.glyf + a + 8));
    below = Math.max(below, -buf.readInt16BE(tables.glyf + a + 4));
  }
  return (above + below) / upem;
}

/** Every bundled face, by the `fontFamily` name React Native knows it as. */
const FACES = Object.fromEntries(
  globSync('assets/fonts/*.ttf', { cwd: ROOT }).map((file) => [
    file.replace(/^.*\//, '').replace(/\.ttf$/, ''),
    { box: lineBoxEm(resolve(ROOT, file)), ink: inkSpanEm(resolve(ROOT, file)) },
  ]),
);
const BOXES: Record<string, number> = Object.fromEntries(
  Object.entries(FACES).map(([name, { box }]) => [name, box]),
);

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist', '.expo'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(path, out);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

/**
 * Every `StyleSheet` entry on the phone that states both a size and a leading, with the face
 * it is set in.
 *
 * Read as a **style object** rather than as a line, because the three facts are three
 * properties of one entry and nothing guarantees their order or that they share a line —
 * `Row.tsx`'s `note` is written across five. Braces are balanced from the entry's opening
 * one so that a nested object or a call with a brace in it does not end the entry early,
 * which is the trap `phoneTextScaling.test.ts`'s `valuesOf` was written for one property
 * along.
 */
function styledRuns(source: string): Array<{ name: string | null; entry: string; size: string | null; ratio: string | null; face: string }> {
  const out: Array<{ name: string | null; entry: string; size: string | null; ratio: string | null; face: string }> = [];
  for (const match of source.matchAll(/\blineHeight:/g)) {
    let start = match.index;
    for (let depth = 0; start >= 0; start--) {
      const c = source[start];
      if (c === '}' || c === ')' || c === ']') depth++;
      else if (c === '(' || c === '[') depth--;
      else if (c === '{') {
        if (depth === 0) break;
        depth--;
      }
    }
    let end = match.index;
    for (let depth = 0; end < source.length; end++) {
      const c = source[end];
      if ('({['.includes(c)) depth++;
      else if (')]'.includes(c)) depth--;
      else if (c === '}') {
        if (depth === 0) break;
        depth--;
      }
    }
    const entry = source.slice(start + 1, end);
    // The entry's own name, which is the `note:` immediately before its opening brace.
    const name = source.slice(Math.max(0, start - 40), start).match(/([A-Za-z_$][\w$]*)\s*:\s*$/)?.[1] ?? null;
    const size = entry.match(/lineHeight:[^,}]*?\btext\.(s\d+)/)?.[1] ?? entry.match(/\bfontSize:\s*text\.(s\d+)/)?.[1];
    // The ratio in `leadingOf(size, ratio)`, or whatever bare name stands in for the whole
    // call — `note.test.ts` allows both spellings and so must this.
    const ratio =
      (entry.match(/lineHeight:\s*leadingOf\([^,]+,\s*([^)]+)\)/) ??
        entry.match(/lineHeight:\s*([A-Za-z_$][\w$.[\]]*)\s*[,}]/))?.[1]?.trim() ?? null;
    const face = entry.match(/\bfontFamily:\s*type\.family\.(\w+)\.name/)?.[1];
    // A face is what puts an entry in scope: this rule compares a ratio against *a face's*
    // box, so an entry that names none has nothing to be measured against. A `lineHeight`
    // with a face and no readable ratio is the other case and is carried through as `null`,
    // to be reported rather than dropped.
    if (face) out.push({ name, entry: entry.replace(/\s+/g, ' ').trim().slice(0, 90), size: size ?? null, ratio, face });
  }
  return out;
}

/**
 * What a ratio expression at a call site actually is, resolved rather than pattern-matched.
 *
 * The sites do not all spell it the same way and should not have to: `Note` reads
 * `NOTE.note.leading`, the row reads `leading[ROW_LEADING.note]`, and a plain site writes
 * `leading.l143`. A clause that only understood the last of those would report the first two
 * as unreadable — and the temptation then is to skip them, which turns a guard into a guard
 * of whatever it happens to parse.
 *
 * So the expression is walked against the tables it can name. Anything outside them comes
 * back `undefined` and is **failed**, not skipped: a new spelling has to teach this clause
 * what it means, which is the ratchet §6.185 asks for. That is deliberately not the same as
 * failing a correct change — every existing spelling resolves, and a new table is one entry
 * in `SCOPE`.
 */
const SCOPE: Record<string, unknown> = { leading, ROW_LEADING, NOTE, FIELD_BOX };

/**
 * And a constant the file declared for itself, which `note.test.ts` already blesses.
 *
 * `mobile/app/(tabs)/_layout.tsx` names its label's line box once — `const LABEL_LINE =
 * leadingOf(text.s12, leading.l143)` — and uses it twice, because the bar measures its own
 * height from it. That is the better spelling and the clause has to follow it home rather
 * than treat it as unreadable. It is also the site closest to the device report: the tab bar
 * is the one piece of navigation on **both** screens a phone found text clipped on, and its
 * label is set in the title face, whose own box is 1.347 em. At `l143` it clears by 0.083 em.
 * At `l120` it would not, and nothing before this could have said so.
 */
function localConst(name: string, source: string): string | undefined {
  return source.match(
    new RegExp(`\\bconst\\s+${name}\\s*=\\s*leadingOf\\([^,]+,\\s*([^)]+)\\)`),
  )?.[1];
}

function resolve1(expr: string): unknown {
  const parsed = /^([A-Za-z_$][\w$]*)((?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])*)$/.exec(expr.trim());
  if (!parsed) return undefined;
  let cur: unknown = SCOPE[parsed[1]];
  for (const part of parsed[2].matchAll(/\.([A-Za-z_$][\w$]*)|\[([^\]]+)\]/g)) {
    if (cur === null || cur === undefined) return undefined;
    const key = part[1] ?? String(resolve1(part[2]));
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

describe('a line box holds the face it is set in', () => {
  it('reads the six bundled faces out of their own files', () => {
    // Non-vacuous: a glob that matched nothing would make every sweep below pass happily,
    // which is the §6.57 shape — a table of zeroes reported as a measurement.
    expect(Object.keys(BOXES).length).toBe(6);
    for (const [face, box] of Object.entries(BOXES)) {
      expect(box, `${face} reports an impossible line box`).toBeGreaterThan(0.5);
      expect(box, `${face} reports an impossible line box`).toBeLessThan(3);
    }
    /*
     * The two the rule actually turns on, pinned so that swapping a face for one with
     * different metrics is a red test rather than a silent change of what "tight" means.
     * Newsreader's is the em exactly — 1470 up, 530 down, 2000 to the em — which is why
     * `Row`'s two-line note collided when it was set solid.
     */
    expect(BOXES['ArchivoNarrow-SemiBold']).toBeCloseTo(1.347, 3);
    expect(BOXES['Newsreader-Italic']).toBeCloseTo(1.0, 3);
  });

  it('never states a leading tighter than the face on the phone', () => {
    const found: Array<{ where: string; entry: string; ratio: number; box: number; face: string; size: number | null }> = [];
    const unread: string[] = [];
    let scanned = 0;
    for (const file of [...filesUnder('mobile/app'), ...filesUnder('mobile/src')]) {
      const source = readFileSync(resolve(ROOT, file), 'utf8');
      for (const run of styledRuns(source)) {
        const family = (type.family as Record<string, { name: string | null }>)[run.face];
        // A face this app does not bundle — `jp` names the platform's own — has no file to
        // read and no claim to make. Recorded as unmeasured rather than as a pass.
        if (!family?.name || !(family.name in BOXES)) continue;
        scanned++;
        const expression =
          run.ratio && !/[.[]/.test(run.ratio) ? localConst(run.ratio, source) ?? run.ratio : run.ratio;
        const ratio = expression === null || expression === undefined ? undefined : resolve1(expression);
        if (typeof ratio !== 'number') {
          unread.push(`${file}: could not read the leading in — ${run.entry}`);
          continue;
        }
        found.push({
          where: file,
          entry: run.entry,
          ratio,
          box: BOXES[family.name],
          face: family.name,
          // What a clamp would actually cost, in points, so the failure reads as a loss
          // rather than as two ratios. `text[size]` is the size the entry is set at.
          size: run.size ? (text as Record<string, number>)[run.size] ?? null : null,
        });
      }
    }
    // §6.57 in the clause: a leading this cannot read is not a leading that passed.
    expect(unread, 'teach SCOPE the table this spelling comes from').toEqual([]);
    /*
     * Non-vacuous twice over: the sweep has to have matched real entries, and one of them
     * has to be the row's note — the entry this clause was written for. A regex that stopped
     * matching would otherwise report an empty list as a clean bill of health.
     */
    expect(scanned, 'the sweep found no phone leading to check').toBeGreaterThan(4);
    expect(
      found.some((f) => f.where.endsWith('ui/Row.tsx') && f.face === 'Newsreader-Italic'),
      'the row’s note is no longer in the sweep',
    ).toBe(true);

    const clamped = found
      .filter(({ ratio, box }) => ratio < box - 1e-9)
      .map(({ where, entry, ratio, box, face, size }) => {
        // 3.571 is the largest Dynamic Type step (`RCTAccessibilityManager.mm`), which is
        // where the loss is worst and where the one device report was taken.
        const lost = size === null ? null : Math.round((box - ratio) * size * 3.571 * 10) / 10;
        return (
          `${where}: ${ratio} in ${face}, whose own box is ${Math.round(box * 1000) / 1000}` +
          `${lost === null ? '' : ` — ${lost}pt of glyph cropped at the largest step`} — ${entry}`
        );
      });
    expect(
      clamped,
      'React Native clamps a line to a stated lineHeight, so one below the face’s own box ' +
        'crops the glyphs on iOS, bottom first, by a margin that grows with Dynamic Type',
    ).toEqual([]);
  });

  it('states what a row’s note is set at, on both renderers, and clears the face', () => {
    /*
     * The pair `ROW_LEADING` exists to keep in step. The phone reads the table; the web
     * cannot, for `CLAMP`'s reason — Tailwind generates the utilities it can see, so
     * `leading-${'{name}'}` built at runtime is a class that does not exist — so its class
     * stays literal and this is what binds it to the same number.
     *
     * Bound to `ROW_LEADING.note` and **not** to the string `l143`, which is the difference
     * between a clause and a coincidence. The first draft of this asserted `leading.l143` is
     * 1.43 — a fact about the token table that is true whatever the row does — and a plant
     * that moved the table to `l100` left it green with the phone at 1.000 and the web still
     * at 1.43: the two renderers apart again, in the clause written to hold them together.
     */
    const phone = readFileSync(resolve(ROOT, 'mobile/src/ui/Row.tsx'), 'utf8');
    const web = readFileSync(resolve(ROOT, 'app/src/ui/Row.tsx'), 'utf8');
    expect(phone, 'the phone does not read the table for the note’s leading').toContain(
      'leadingOf(text.s12, leading[ROW_LEADING.note])',
    );
    expect(web, 'the web does not state the note’s leading from the table').toContain(
      `leading-${ROW_LEADING.note} `,
    );

    /*
     * And the number in the table has to be one that works, which for this slot is a
     * stronger requirement than the sweep above.
     *
     * The sweep asks whether one line fits. `ROW_LINES` gives the note **two**, and two
     * lines have a second problem: line 2's ascenders sit one leading below line 1's
     * baseline, so they run into line 1's descenders unless the leading is at least the
     * face's whole ink span. Newsreader Italic's box is 1.000 em and its Latin-1 ink spans
     * 1.1845, so set solid the two lines overlap by 0.185 em — 2.2pt at `s12` and 7.9pt for
     * a reader at the largest Dynamic Type step. That is the defect this repair was for and
     * this is the clause that will not let it back: `l100` and `l120` both clear the box and
     * only one of them clears the glyphs.
     */
    for (const [slot, ratio] of Object.entries(ROW_LEADING)) {
      expect(
        ROW_LINES[slot as keyof typeof ROW_LINES],
        `${slot} states a leading but only draws one line, which is the sweep's job`,
      ).toBeGreaterThan(1);
      const face = styledRuns(phone).find((run) => run.name === slot)?.face;
      const name = face ? (type.family as Record<string, { name: string | null }>)[face]?.name : null;
      expect(name, `no bundled face found for the row's ${slot}`).toBeTruthy();
      const ink = FACES[name as string].ink;
      expect(
        (leading as Record<string, number>)[ratio],
        `${slot} is set in ${name}, whose glyphs span ${Math.round(ink * 10000) / 10000} em, ` +
          'so consecutive lines collide below that',
      ).toBeGreaterThanOrEqual(ink);
    }
  });

  it('would catch a tight leading that the export cannot show', () => {
    /*
     * The clause's own arithmetic, on the case it exists for, so that the rule is stated as
     * a number rather than only as a sweep. `l120` in the title face is the one somebody
     * reaches for to stop a heading looking loose.
     */
    const box = BOXES['ArchivoNarrow-SemiBold'];
    expect(leading.l120).toBeLessThan(box);
    const lost = (box - leading.l120) * text.s14;
    expect(Math.round(lost * 10) / 10, 'the loss at 100% Dynamic Type').toBe(2.1);
    // 3.571 is `RCTAccessibilityManager.mm`'s multiplier for the largest step, which is
    // where the only device report this product has was taken.
    expect(Math.round(lost * 3.571 * 10) / 10, 'the loss at the largest step').toBe(7.3);
  });
});
