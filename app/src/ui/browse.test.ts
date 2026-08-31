import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '@reviewies/core/test/source';
import { BOX, BOX_COLUMNS } from '@reviewies/core/ui/box';
import { WELL_RATED } from '@reviewies/core/discover/filters';

/**
 * The shelf, held to the two decisions that are easiest to lose.
 *
 * `docs/design/architecture.md` section 5 turned Discover from a list of shows with buttons
 * into a shelf of boxes you look along and turn over. `core/src/ui/box.ts` owns the
 * measurements and the composition; this holds the two renderers to the parts of that a
 * type-check cannot see — what is **printed** on a box, and where the actions are.
 */
const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => stripComments(readFileSync(resolve(ROOT, p), 'utf8'));

const BROWSE = {
  web: 'app/src/ui/Browse.tsx',
  phone: 'mobile/src/ui/Browse.tsx',
} as const;
const BOTH = Object.entries(BROWSE) as Array<[keyof typeof BROWSE, string]>;

describe('the browse shelf', () => {
  it('reads two renderers rather than an empty string', () => {
    // §6.121: every clause below passes against a file that could not be read.
    for (const [platform, file] of BOTH) {
      expect(read(file).length, platform).toBeGreaterThan(1000);
      expect(read(file), `${platform} does not draw a box`).toContain('boxUnder');
    }
  });

  it('never prints the crowd score, on either platform', () => {
    /*
     * `architecture.md`'s third refusal, and the one thing in this sprint that a reviewer
     * would have to look at a screenshot to catch otherwise.
     *
     * `SearchResult.rating` was added so the shelf could be **narrowed** by it —
     * `WELL_RATED` is the line — and `direction.md` refused the whole poster-wall register
     * on the rule that *browsing is reading, not shopping*. A number in the corner of every
     * box is the fastest way there is to cross that line, and it is one line of JSX away at
     * every moment, on a field that is sitting right there in the object being rendered.
     *
     * So: the filter may read it and the box may not draw it. What is forbidden is the
     * *value* reaching the page — `{item.rating}`, `String(item.rating)`, a template with
     * it in — rather than the word appearing in the file, which it does not here at all.
     */
    const printed: string[] = [];
    for (const [platform, file] of BOTH) {
      const source = read(file);
      for (const m of source.matchAll(/\brating\b/g)) {
        printed.push(`${platform}: ${source.slice(Math.max(0, m.index - 40), m.index + 20).trim()}`);
      }
    }
    expect(
      printed,
      'the crowd score is a filter and never a figure — docs/design/architecture.md refusal 3',
    ).toEqual([]);

    // Non-vacuity from the other side: the number exists and something does read it, or the
    // clause above is a rule about a field nothing has.
    expect(WELL_RATED).toBeGreaterThan(0);
    // The whole comparison rather than the field name: `clauses.test.ts` refuses a needle
    // that its file carries twice, and `result.rating` is written twice there — once to ask
    // whether the crowd has voted at all and once to compare. The clause here is about the
    // comparison, so the comparison is what it names.
    expect(read('core/src/discover/filters.ts')).toContain('result.rating >= WELL_RATED');
  });

  it('puts genre, year and title on the front and nothing else', () => {
    /*
     * The three things printed on a spine, which is the whole of the finding: *"large
     * thumbnails carrying genre, release date and title"*. `boxUnder` composes the first two
     * so the two platforms cannot punctuate them differently — the defect `poster.ts`
     * records from the other direction, where one number was written twice and drifted.
     */
    for (const [platform, file] of BOTH) {
      const source = read(file);
      expect(source, `${platform} composes the under-line itself`).toContain('boxUnder(item)');
      // And the facts line is on the back, where there is room for it.
      expect(source, `${platform} does not draw the facts at all`).toContain('boxFacts(item)');
    }
  });

  it('keeps the two actions on the back, where the decision is made', () => {
    /*
     * `row.ts`'s naming rule, squared. A shelf of twenty boxes each carrying **Track** and
     * **Watchlist** is forty controls with two names between them, and §6.96's collision
     * clause is what measures that. A box is one control with two faces: the front is a
     * press that turns it over, and both verbs live behind it.
     *
     * Read positionally rather than by counting: everything before the point where the box
     * turns over is the front, and the front may not offer either verb.
     */
    for (const [platform, file] of BOTH) {
      const source = read(file);
      const turns = source.indexOf('setOver(true)');
      const back = source.indexOf('if (over)');
      expect(turns, `${platform} has no press that turns a box over`).toBeGreaterThan(-1);
      expect(back, `${platform} has no back to a box`).toBeGreaterThan(-1);
      /*
       * The back is written first and returns early, so everything from the press that
       * turns the box over to the end of the file is the front. Positional rather than a
       * count, because "two buttons somewhere in this file" is exactly what a shelf is
       * allowed to have — the claim is about *which face* they are on.
       */
      expect(back, `${platform} draws the back after the front`).toBeLessThan(turns);
      const face = { back: source.slice(back, turns), front: source.slice(turns) };
      for (const verb of ['COPY.controls.trackTitle', 'COPY.controls.addToWatchlist']) {
        expect(face.back, `${platform} lost ${verb} from the back of a box`).toContain(verb);
        expect(face.front, `${platform} puts ${verb} on the front of a box`).not.toContain(verb);
      }
    }
  });

  it('counts its columns from the table on both platforms', () => {
    /*
     * Two across on a phone is the finding's own number — a *box*, the size of a hand,
     * rather than the thumbnail Discover already had — so it is a decision and it has an
     * owner. The phone computes a width from it; the web writes Tailwind class names, which
     * cannot be assembled at runtime because the scanner reads source text (`Choice.tsx`'s
     * `GAP` records the same trap). So the web's two names are rebuilt from the table here
     * rather than left to agree with it by hand.
     */
    const web = read(BROWSE.web);
    expect(web, 'the web writes a column count by hand').toContain(
      `grid-cols-${BOX_COLUMNS.phone}`,
    );
    expect(web, 'the web writes its wide column count by hand').toContain(
      `sm:grid-cols-${BOX_COLUMNS.wide}`,
    );
    expect(web).toContain('COLUMNS[BOX_COLUMNS.phone]');
    expect(web).toContain('AT_WIDTH[BOX_COLUMNS.wide]');

    /*
     * And the table is *used*, not merely read.
     *
     * A plant walked through the four clauses above: keep `NARROW` and `WIDE` exactly as
     * they are, and write the class names into the `className` by hand beside them. Every
     * needle above is still in the file — the tables hold the literals, the lookups still
     * read `BOX_COLUMNS` — and the grid draws whatever the hand-written string says. Only
     * `oxlint` noticed, as a warning about two unused variables, and a warning does not fail
     * `verify`.
     *
     * §6.139's shape: a clause easier to satisfy than its name. So the rule is stated the
     * way it is meant: **the class names have one home**, which is the two tables, and a
     * `className` may not contain one. Backticks as well as quotes, because the correct
     * spelling here is a template literal and a plant would reach for one.
     */
    expect(
      web,
      'a column class is written into a className by hand, beside a table that says otherwise',
    ).not.toMatch(/className=\{?[`"][^`"]*grid-cols/);
    for (const literal of ["'grid-cols-", "'sm:grid-cols-"]) {
      const home = (web.split(literal).length - 1);
      expect(home, `${literal}… should live only in its lookup table`).toBe(2);
    }

    const phone = read(BROWSE.phone);
    expect(phone, 'the phone guesses a percentage instead of measuring').toContain(
      'BOX_COLUMNS.phone',
    );
    expect(phone, 'the phone writes the gap by hand').toContain('BOX.gap');
    expect(phone, 'the phone writes the shape by hand').toContain('BOX.ratio');
    // The one number a size names; the height follows. `poster.ts` records what the other
    // arrangement cost: two points of dead ground under every listing row in the app.
    expect(BOX.ratio).toBeLessThan(1);
  });

  it('clamps each part of a box to the same number of lines on both platforms', () => {
    /*
     * A box's height is its neighbours', so how many lines each part may take is a property
     * of the grid rather than of one renderer — `ROW_LINES`' argument, one component over.
     *
     * The web cannot read the table: Tailwind compiles from source text, so `line-clamp-${n}`
     * generates nothing. So the numbers are **checked** here rather than read there, which is
     * the same arrangement `choice.test.ts` uses for `CHOICE_SIZE`'s classes and for the same
     * reason. The phone reads them, so only one side can drift and this is what catches it.
     */
    const web = read(BROWSE.web);
    const phone = read(BROWSE.phone);
    for (const [what, n] of [
      ['title', BOX.lines.title],
      ['under', BOX.lines.under],
    ] as const) {
      expect(web, `the web clamps the ${what} to something other than ${n}`).toContain(
        `line-clamp-${n}`,
      );
    }
    expect(phone, 'the phone writes its title clamp by hand').toContain(
      'numberOfLines={BOX.lines.title}',
    );
    expect(phone, 'the phone writes its second line clamp by hand').toContain(
      'numberOfLines={BOX.lines.under}',
    );
  });

  it('clamps the synopsis to the ground rather than to a number', () => {
    /*
     * The two clamps above are constants and this one cannot be, which is the whole of
     * `backLines`' argument in `core/src/ui/box.ts`: a title is clamped so that a long name
     * cannot make a box taller, and the synopsis is clamped so that it fills the panel — and
     * the panel is 304 points on a phone, 333 at a 420 window and 383 at 1280.
     *
     * `BOX.backLines: 6` was the same number for all three. Measured against real TMDB it
     * overran the phone's row by 26 points and left 40 to 90 points of the web's panel
     * empty while truncating, which is one constant wrong in both directions at once.
     *
     * So the rule this holds is that **neither renderer states a synopsis clamp**. What a
     * clause like this cannot see is where the number came from once it is a variable, so
     * it is written against the two spellings a fixed one would have to take: a
     * `line-clamp-n` on the web that is not one of the front's two, and a `numberOfLines`
     * on the phone whose value is not a call.
     */
    const web = read(BROWSE.web);
    const phone = read(BROWSE.phone);

    for (const [platform, source] of [
      ['web', web],
      ['phone', phone],
    ] as const) {
      expect(source, `${BROWSE[platform]} does not measure the ground the synopsis has`).toContain(
        'backLines(',
      );
    }

    /*
     * The web's only `line-clamp-n` classes are the front's, and they are the front's
     * numbers. Written as a set rather than as a count so that the failure names the class
     * that appeared rather than saying a total moved.
     */
    const clamps = [...web.matchAll(/line-clamp-(\w+)/g)].map((m) => m[1]);
    expect(
      [...new Set(clamps)].sort(),
      `a synopsis clamp is written into ${BROWSE.web} by hand — core/src/ui/box.ts owns it now`,
    ).toEqual([String(BOX.lines.under), String(BOX.lines.title)].sort());

    /*
     * And the phone's synopsis takes a computed count. `numberOfLines={BOX.lines.…}` is the
     * front's two and is checked above; anything else on this file must be an expression.
     */
    for (const [, value] of phone.matchAll(/numberOfLines=\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g)) {
      const front = /^BOX\.lines\./.test(value.trim());
      expect(
        front || /backLines\(/.test(value),
        `${BROWSE.phone} clamps a synopsis to ${value.trim()} — a number where the ground ` +
          `belongs; core/src/ui/box.ts owns it`,
      ).toBe(true);
    }
  });

  it('lets one function say what a title is and when it is from', () => {
    /*
     * The fourth surface, and the one that had no owner.
     *
     * The same title read four ways: `Drama · 2001` on a box's front, `Series` on its back,
     * `Series · 2005` on a search row and `2022` on the title page. Three of those are
     * decisions and `core/src/ui/box.ts` now carries all three arguments; the search row was
     * not one. It composed the kind and the year into a `meta` prop **in each screen**, the
     * same characters on both platforms, which is the defect `boxUnder` exists to prevent
     * and which nothing caught because the two copies agreed.
     *
     * So the rule is that neither screen builds that line itself. Written against the
     * spelling rather than the output, because the output is what the two copies already got
     * right — this is about where it comes from.
     */
    const screens = {
      web: 'app/src/screens/Discover.tsx',
      phone: 'mobile/app/(tabs)/discover.tsx',
    } as const;
    for (const file of Object.values(screens)) {
      const source = read(file);
      expect(source.length, `${file} could not be read`).toBeGreaterThan(1000);
      expect(source, `${file} does not read the fact line from the box`).toContain(
        'boxFacts(result)',
      );
      /*
       * And it does not also keep a copy. `COPY.kinds` is legitimate elsewhere on these
       * screens — the kind filter's two labels are exactly that — so the needle is the
       * ternary that turns a `kind` into a word, which is the composition itself.
       */
      expect(
        source,
        `${file} still turns a kind into a word by hand beside the function that does it`,
      ).not.toMatch(/kind === 'show' \? COPY\.kinds\.show : COPY\.kinds\.film/);
    }
  });

  it('groups the reason rather than repeating it on every box', () => {
    /*
     * All three design directions arrived at this independently — `direction.md` calls it
     * "verbatim the same fix" — and §6.169 photographed what it replaces: thirty rows each
     * carrying the same sentence in the slot `copy.ts` calls "the line that separates a
     * recommendation from an advert". A line that says the same thing on every row is the
     * group they are in, not the thing that tells them apart.
     *
     * `screenMode.test.ts` holds the other half — that a *trending* box is given no reason
     * at all, because it is not because of anything you watched.
     */
    for (const [platform, file] of BOTH) {
      const source = read(file);
      expect(source, `${platform} does not group its shelf`).toContain('groupsOf(items)');
      expect(source, `${platform} draws the reason on the box`).not.toMatch(
        /note=\{[^}]*because/,
      );
      expect(source, `${platform} does not draw the reason as a heading`).toMatch(
        /<Section[^>]*>\{because\}<\/Section>/,
      );
    }
  });
});
