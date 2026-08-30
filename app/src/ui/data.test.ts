import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DATA_FACE, DATA_UNIT_FACE, splitFigure } from '@reviewies/core/ui/data';
import { type } from '@reviewies/core/tokens';

/**
 * `Data`, and the two ways a number goes wrong.
 *
 * Mono on the whole value string printed **`7  days`** — a word at a typewriter's letter
 * spacing. And mono on anything containing a digit put four *sentences* in it: "You look
 * behind the crowd by 12s", "disputed · one person · 3 of 5", "S1E6 · Episode 6", and an
 * episode's own name. Both are the same mistake from opposite ends: the face is for
 * machine-readable literals, and neither a unit nor a sentence is one.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist', '.expo'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(path, out);
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

describe('a figure', () => {
  it('keeps its unit out of the mono face', () => {
    // The exact string from the screenshot, and the shapes around it.
    expect(splitFigure('7 days')).toEqual({ figure: '7', unit: 'days' });
    expect(splitFigure('2.4 days watched')).toEqual({ figure: '2.4', unit: 'days watched' });
    expect(splitFigure('12 episodes')).toEqual({ figure: '12', unit: 'episodes' });
    // No space, so all figure — the unit is bound to the numeral.
    expect(splitFigure('6.0h')).toEqual({ figure: '6.0h', unit: '' });
    expect(splitFigure('12:34')).toEqual({ figure: '12:34', unit: '' });
    expect(splitFigure('192.168.1.4')).toEqual({ figure: '192.168.1.4', unit: '' });
    // And a measure that is only a word never reaches the mono face at all.
    expect(splitFigure('Nothing yet')).toEqual({ figure: '', unit: 'Nothing yet' });
  });

  it('reads a literal whole, whether or not there is a digit in it', () => {
    /*
     * The split decided what was machine-readable by asking whether the string had a digit
     * in it, and a filename is the case that breaks: `watched-2024.csv` came back mono and
     * `letterboxd.csv` came back as a *unit* — the body face, the same face as the
     * `— skipped` beside it — for two files in one import report.
     *
     * These are the names the importers actually take, plus the address a Roku reports.
     * `kind` is the fix and this clause is the reason for it: every one of them below is
     * all figure now, and the paired assertion says what the guess used to do instead.
     */
    for (const value of [
      'letterboxd.csv',
      'imdb.csv',
      'ratings.csv',
      'My Library.csv',
      'export.json',
      'trakt export.json',
      'livingroom.local',
      'apple-tv.local',
    ]) {
      expect(splitFigure(value, 'literal'), value).toEqual({ figure: value, unit: '' });
      // Not a fact about the string: as a measure, every one of these is prose.
      expect(splitFigure(value).figure, `${value} needed no marking, so kind proves nothing`)
        .not.toBe(value);
    }

    // The ones the digit test happened to get right are unchanged by saying so out loud.
    for (const value of ['watched-2024.csv', '192.168.1.4', 'S02E07']) {
      expect(splitFigure(value, 'literal'), value).toEqual({ figure: value, unit: '' });
      expect(splitFigure(value), value).toEqual({ figure: value, unit: '' });
    }

    // A literal is never split, even where a measure would have found a unit in it.
    expect(splitFigure('My Library.csv', 'literal')).toEqual({
      figure: 'My Library.csv',
      unit: '',
    });
    // And `measure` is still the default, so the nineteen sites that pass nothing are safe.
    expect(splitFigure('7 days', 'measure')).toEqual(splitFigure('7 days'));
  });

  it('is drawn by one component on each platform and by nothing else', () => {
    /*
     * Ten sites on the web and thirteen on the phone named the face by hand, and the last
     * one to go was the remote drawer's `12:34 / 45:00 · paused`. Keeping that would have
     * meant a written exemption in this clause — the §6.59 shape, an excuse that outlives
     * what it excuses — so the line became three things instead of one string.
     *
     * The clause counts what it scanned, so a rename cannot turn it into an empty pass.
     */
    const web: string[] = [];
    let webFiles = 0;
    for (const file of filesUnder('app/src')) {
      if (file.endsWith('ui/Data.tsx')) continue;
      webFiles++;
      for (const m of read(file).matchAll(/className="([^"]*font-data[^"]*)"/g)) {
        web.push(`${file}: ${m[1]}`);
      }
    }
    expect(webFiles, 'no web files scanned, so this proved nothing').toBeGreaterThan(20);
    expect(web).toEqual([]);

    const phone: string[] = [];
    let phoneFiles = 0;
    for (const file of [...filesUnder('mobile/app'), ...filesUnder('mobile/src')]) {
      if (file.endsWith('ui/Data.tsx')) continue;
      phoneFiles++;
      for (const m of read(file).matchAll(/type\.family\.data\.name/g)) phone.push(`${file}: ${m[0]}`);
    }
    expect(phoneFiles, 'no phone files scanned, so this proved nothing').toBeGreaterThan(20);
    expect(phone).toEqual([]);
  });

  it('sets its figures tabular, which is the whole reason for the face', () => {
    /*
     * The phone set `fontVariant: ['tabular-nums']` at 2 of its 13 number sites and the web
     * set `tabular-nums` at 8 of its 10 — and the star rating had the tabular *without* the
     * face here and the face *without* the tabular there, which is one value drawn two
     * wrong ways. A proportional face with tabular figures gets half of what the direction
     * asks for; mono without them gets the other half.
     */
    const web = read('app/src/ui/Data.tsx');
    const phone = read('mobile/src/ui/Data.tsx');
    expect(web).toContain('font-data font-medium tabular-nums');
    /*
     * The `figure` style, not the file. `toContain` on the whole thing passed with the
     * property deleted, because the component's own header sentence quotes it — a needle
     * the haystack carries twice, one copy of it in prose. `clauses.test.ts` named this
     * line and the plant confirmed it, in that order.
     */
    const figureStyle = /\n  figure: \{([^{}]*)\},/.exec(phone)?.[1] ?? '';
    expect(figureStyle, 'no figure style to read').toBeTruthy();
    expect(figureStyle).toContain("fontVariant: ['tabular-nums']");

    /*
     * And the unit does *not* wear it — which is the clause this file was missing.
     *
     * The first version asserted only that the figure's class string appeared in the
     * component. Planting it onto the unit's span as well left that true, so `7  days`
     * came back and eleven other clauses stayed green. A file containing a string is not
     * the element carrying it: §6.109, in a guard written to catch §6.112's own defect.
     */
    const webUnit = /<span[^>]*>\{figure \? ' ' : ''\}\{unit\}<\/span>/.exec(web)?.[0]
      ?? /<span([^>]*)>[^<]*\{unit\}/.exec(web)?.[0];
    expect(webUnit, 'no unit span to read').toBeTruthy();
    expect(webUnit, 'the unit is in the mono face — this is `7  days`').not.toContain('font-data');
    expect(webUnit).not.toContain('FIGURE_CLASS');

    // The phone's unit reads one named style, and that style is the body face.
    expect(phone).toMatch(/style=\{styles\.unit\}[^>]*>\{figure \? ' ' : ''\}\{unit\}/);
    const unitStyle = /\n  unit: \{([^{}]*)\},/.exec(phone)?.[1] ?? '';
    expect(unitStyle, 'no unit style to read').toBeTruthy();
    expect(unitStyle).toContain('DATA_UNIT_FACE');
    expect(unitStyle, 'the unit went back into mono with the figure').not.toContain('DATA_FACE]');
    // The face and its weight from the table, not spelled twice.
    expect(DATA_FACE).toBe('data');
    expect(type.family[DATA_FACE].weight).toBe('500');
    expect(DATA_UNIT_FACE).toBe('body');
    expect(read('mobile/src/ui/Data.tsx')).toContain('type.family[DATA_FACE].name');
    expect(read('mobile/src/ui/Data.tsx')).toContain('type.family[DATA_UNIT_FACE].name');
  });

  it('is not what a sentence containing a number is drawn in', () => {
    /*
     * Stage 2 gave the mono face to anything with a digit in it. These four are named
     * individually because a count would pass with the wrong four: each is a sentence, and
     * the numbers inside them are read as words rather than compared down a column.
     */
    const sentences = [
      ['mobile/app/watching/[targetId].tsx', 'driftText'],
      ['mobile/app/watching/[targetId].tsx', 'episode'],
      ['mobile/src/ui/ContentWarnings.tsx', 'votes'],
      ['mobile/app/comments/[targetId].tsx', 'episode'],
    ] as const;
    for (const [file, style] of sentences) {
      const line = new RegExp(`^  ${style}: \\{.*$`, 'm').exec(read(file))?.[0] ?? '';
      expect(line, `${file}'s ${style} has no style to read`).toBeTruthy();
      expect(line, `${file}'s ${style} is a sentence in the mono face`).toContain(
        'type.family.body.name',
      );
    }
  });

  it('is what every figure on both platforms is drawn with', () => {
    /*
     * Named rather than counted. The four places a number *is* the content — a stat tile, a
     * sync backlog, a running clock, a star rating — plus the three sites holding a literal
     * that is not a number and wants the same face for the same reason: a filename on each
     * platform, and the phone's device address.
     *
     * The needle used to be the whole clause, and the whole clause was that the call site
     * *exists*. `<Data value={f.name}` stayed true through every version of the split,
     * including the one that drew `letterboxd.csv` in the body face — the clause named the
     * defect's own site and could not see it, which is §6.109 again: a call site is not the
     * behaviour behind it. So each row now carries the `kind` its value needs and a value
     * that site really produces, and the assertions below are about what comes out.
     */
    for (const [file, needle, sample] of [
      ['app/src/screens/Stats.tsx', '<Data value={value} size="s20" />', '7 days'],
      ['app/src/screens/AccountPanel.tsx', '<Data value={pending} size="s20" />', '12'],
      [
        'app/src/screens/WatchingMode.tsx',
        '<Data value={formatTimecode(clock.positionMs)}',
        '1:04:12',
      ],
      ['app/src/ui/StarRating.tsx', '<Data value={value.toFixed(1)}', '4.5'],
      ['mobile/app/stats.tsx', '<Data value={value} size="s20" style={styles.figureValue} />', '6.0h'],
      ['mobile/app/(tabs)/more.tsx', '<Data value={value} size="s20"', '0'],
      [
        'mobile/app/watching/[targetId].tsx',
        '<Data value={formatTimecode(clock.positionMs)}',
        '12:34',
      ],
      ['mobile/src/ui/StarRating.tsx', '<Data value={value.toFixed(1)}', '3.0'],
    ] as const) {
      expect(read(file), `${file} draws its figure by hand`).toContain(needle);
      // A measure: the numerals are the figure, and nothing of it is left in the body face.
      const { figure } = splitFigure(sample);
      expect(figure, `${file}'s ${sample} is not drawn in the mono face`).toBeTruthy();
      expect(sample.startsWith(figure), `${file}'s ${sample} lost its head to the unit`).toBe(true);
    }

    /*
     * And the three that are literals. The needle carries `kind="literal"` because that is
     * the load-bearing half — without it the call site is the one that shipped the defect —
     * and the sample is a real name with no digit in it, which is what the old rule missed.
     */
    for (const [file, needle, sample] of [
      ['app/src/ui/ImportFiles.tsx', '<Data value={f.name} kind="literal"', 'letterboxd.csv'],
      [
        'mobile/src/ui/ImportFiles.tsx',
        '<Data value={file.name} kind="literal"',
        'letterboxd.csv',
      ],
      [
        'mobile/src/devices/RemotePanel.tsx',
        '<Data value={found.address} kind="literal"',
        'livingroom.local',
      ],
    ] as const) {
      expect(read(file), `${file} does not tell Data its value is a literal`).toContain(needle);
      expect(splitFigure(sample, 'literal'), sample).toEqual({ figure: sample, unit: '' });
    }

    /*
     * The kind has to reach the split, or the prop above is decoration. Both renderers pass
     * it through, and neither of them calls the split with the value alone.
     */
    for (const renderer of ['app/src/ui/Data.tsx', 'mobile/src/ui/Data.tsx']) {
      const source = read(renderer);
      expect(source, `${renderer} drops kind on the floor`).toContain(
        'splitFigure(String(value), kind)',
      );
      expect(source, `${renderer} has no kind to pass`).toContain("kind = 'measure'");
    }
  });
});
