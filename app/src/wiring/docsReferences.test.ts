import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  SHOT_DIRS,
  census,
  filedBy,
  missingShotDirs,
  scriptChangedAt,
  shots,
  staleBefore,
  unnamed,
} from '../../../design/unread.mjs';
import { stripMarkdownComments } from '@reviewies/core/test/source';

/**
 * A cross-reference has to point at a section that exists.
 *
 * These documents are the record of why the product is the way it is, and they lean on
 * each other constantly — "§6.51 gave the words one owner", "this is §6.18's bug again".
 * A reader following one of those is the whole point of writing them down.
 *
 * The drift has one cause, and it is mechanical. Every section is written to close a
 * numbered task, so while writing §6.79 the number in mind is *126*, not 79. Six
 * references across the doc named the task instead of the section — task 96 written
 * where §6.49 was meant, 104 for §6.57, 107 for §6.60 — and each one either points at
 * nothing or, worse, would point at a real and unrelated section once the numbering
 * catches up. §6.79 found them by chasing one that looked wrong.
 *
 * Nothing caught it because nothing reads these files as anything but prose. §6.72's
 * lesson was that a guard reading prose as code catches nothing; this is the other half —
 * prose that nothing reads at all.
 */
const ROOT = resolve(import.meta.dirname, '../../..');
const DOCS = resolve(ROOT, 'docs/research');

/**
 * CommonMark allows a heading up to three spaces of indentation, and one section in doc 9
 * had one. A guard that missed it would have reported four references to a section that
 * is really there — the reason this is a regex rather than a `startsWith('#')`.
 */
const HEADING = /^ {0,3}#{2,6}\s+(\d+(?:\.\d+)*)/gm;

/** A reference in the prose: §6.79, §7, §1.1. */
const REFERENCE = /§(\d+(?:\.\d+)*)/g;

const FILES = readdirSync(DOCS)
  .filter((name) => name.endsWith('.md'))
  .sort();

/** Read once — these files are large and every test wants the same text. */
const TEXT = new Map(
  FILES.map((name) => [name, stripMarkdownComments(readFileSync(resolve(DOCS, name), 'utf8'))]),
);

/**
 * Pooled across every document on purpose: doc 9 cites doc 1's §1.1 and doc 10's
 * sections, and those are the references most worth keeping honest.
 */
const SECTIONS = new Set<string>();
/**
 * Where each number was seen, per document, so a number claimed twice inside one can be
 * reported by location.
 *
 * Per document rather than pooled, because pooled is not a defect: every one of these
 * files has its own §1, and doc 9 citing doc 1's §1.1 across that collision is the
 * arrangement the resolution check above was written for. Inside a single document a
 * repeat is unambiguously a mistake. Pooling was the first version of this check, and
 * it reported nineteen — which is what a check looks like when it is measuring the
 * convention rather than the error.
 */
const HEADINGS = new Map<string, Map<string, number[]>>();
for (const [name, text] of TEXT) {
  const inDoc = new Map<string, number[]>();
  for (const match of text.matchAll(HEADING)) {
    SECTIONS.add(match[1]);
    const line = text.slice(0, match.index).split('\n').length;
    inDoc.set(match[1], [...(inDoc.get(match[1]) ?? []), line]);
  }
  HEADINGS.set(name, inDoc);
}

describe('cross-references in the research documents', () => {
  it('reads the documents rather than an empty directory', () => {
    expect(FILES.length).toBeGreaterThan(8);
    // The document this guard was written for, and the two it cites most.
    expect(SECTIONS).toContain('6.79');
    expect(SECTIONS).toContain('7');
    expect(SECTIONS.size).toBeGreaterThan(100);
  });

  it('gives every section a number of its own', () => {
    /*
     * The check above resolves a reference to *a* heading. It cannot tell that two
     * headings answer to the same number, and the moment two do, every reference to
     * either is ambiguous while still resolving — the exact shape this file was written
     * about, one level up. §6.87 found 6.82 and 6.83 each used twice: once by the
     * iPhone work and again by the design sprints a day later, because a section is
     * numbered by hand from the last one visible on screen.
     *
     * A duplicate is worse than a dangling reference. A dangling one announces itself
     * to a reader; a duplicated one quietly sends half the readers to the wrong place.
     */
    const twice: string[] = [];
    let headings = 0;
    for (const [name, inDoc] of HEADINGS) {
      for (const [number, lines] of inDoc) {
        headings++;
        if (lines.length > 1) twice.push(`docs/research/${name}  §${number} at ${lines.join(', ')}`);
      }
    }
    expect(headings, 'nothing parsed as a heading').toBeGreaterThan(100);
    expect(twice).toEqual([]);
  });

  it('points every § at a section that exists', () => {
    const dangling: string[] = [];
    let found = 0;
    for (const [name, text] of TEXT) {
      text.split('\n').forEach((line, index) => {
        for (const match of line.matchAll(REFERENCE)) {
          found++;
          if (!SECTIONS.has(match[1])) {
            dangling.push(`${relative(ROOT, resolve(DOCS, name))}:${index + 1}  §${match[1]}`);
          }
        }
      });
    }
    // Documents that had stopped citing each other would pass silently.
    expect(found, 'nothing in the record cites anything').toBeGreaterThan(200);
    expect(dangling).toEqual([]);
  });
});

/**
 * The same failure in the other direction: a document that names a file.
 *
 * `docs/deploying.md` tells somebody worried about the TMDB token that the provider
 * interface is in `app/src/metadata/provider.ts`. It moved to `core/` when §6.35 pulled
 * the platform-agnostic half out, and the sentence stayed. That one is worse than a
 * dangling §, because deploying.md is an instruction rather than a record — it sends a
 * person to edit a path that has not existed since the pivot.
 */
const CITED = /\b(?:app|mobile|core|bridge|relay|extension|scripts|supabase|docs)\/[A-Za-z0-9_./()-]+\.(?:ts|tsx|mjs|js|sql|md|json)\b/g;

/**
 * Paths a document names on purpose without them existing — a file being proposed, or
 * one deliberately absent. Empty today; the test below fails if an entry stops being
 * needed, so this cannot quietly become a list of things nobody fixed.
 */
const NOT_ON_DISK: Record<string, string> = {
  // §6.79 quotes `docs/deploying.md`'s old sentence verbatim, to show what it used to
  // send people to. A faithful quotation of a wrong path is the one honest reason to
  // name a file that is not there.
  'app/src/metadata/provider.ts': '§6.79 quotes the sentence that used to name it',
  /*
   * `docs/design/architecture.md` names the two screens it deleted, which is the same honest
   * reason as the entry above: a document recording *what moved* has to be able to say what
   * it moved. Section 1 quotes both files to show that the difference between them was real
   * and lived only in the source, and section 4 says where the content went. Naming the
   * destination instead would make the paragraph about the repair rather than about the
   * finding — and the finding is the part worth keeping.
   *
   * `docs/design/components.md` also names the phone one, in a line-numbered measurement
   * taken while it existed. One entry answers for both.
   */
  'mobile/app/calendar.tsx': 'architecture.md records its deletion and has to name it',

  /**
   * Files the design system specifies but nobody has built yet.
   *
   * A specification names the path it intends, which is the opposite failure from a
   * document pointing at a file that moved — and this guard was written for the second.
   * These are deliberately NOT permanent: the stale-exemption test below fails the
   * moment any of them exists, so each entry deletes itself as the work lands, and the
   * list doubles as what is left to build.
   */

  // What the token and component specs still name and nobody has built. Six entries
  // were here this morning and are gone because the files landed — the stale check
  // below took them out rather than anybody remembering to.
  'app/src/ui/fontBundle.test.ts': 'docs/design/tokens.md specifies it — not yet built',
  'app/src/ui/typeScale.test.ts': 'docs/design/tokens.md specifies it — not yet built',
  'app/src/ui/watchingDim.test.ts': 'docs/design/tokens.md specifies it — not yet built',
};

/** Every markdown file in docs/, not just the research directory. */
function markdown(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) markdown(path, out);
    else if (entry.name.endsWith('.md')) out.push(path);
  }
  return out;
}

describe('files the documents name', () => {
  const cited = new Map<string, string>();
  for (const file of markdown(resolve(ROOT, 'docs'))) {
    for (const match of stripMarkdownComments(readFileSync(file, 'utf8')).matchAll(CITED)) {
      if (!cited.has(match[0])) cited.set(match[0], relative(ROOT, file));
    }
  }

  it('finds the paths rather than an empty set', () => {
    expect(cited.size).toBeGreaterThan(40);
    // Three long-standing citations across three different documents.
    for (const path of ['app/smoke.mjs', 'mobile/smoke.mjs', 'core/src/copy.ts']) {
      expect([...cited.keys()], `nothing cites ${path}`).toContain(path);
    }
  });

  it('names only paths that exist', () => {
    const missing: string[] = [];
    for (const [path, where] of cited) {
      if (path in NOT_ON_DISK) continue;
      if (!existsSync(resolve(ROOT, path))) missing.push(`${where}: ${path}`);
    }
    expect(missing).toEqual([]);
  });

  it('keeps no excuse for a path that is now on disk', () => {
    const stale = Object.keys(NOT_ON_DISK).filter((path) => existsSync(resolve(ROOT, path)));
    expect(stale, 'these are exempted but exist').toEqual([]);
  });
});

/**
 * And the same failure where it is read most: a comment in the source.
 *
 * Nineteen guards open with a paragraph explaining which section made them necessary,
 * and those paragraphs are read far more often than the document is. Two blocks in
 * `app/smoke.mjs` were headed with task numbers 25 and 24 while their own bodies cited
 * §6.70 and §6.69 correctly, and `core/src/copy.ts` credited tasks 98 and 99 for rules
 * that live in §6.51 and §6.52.
 *
 * Which is also why a wrong number is written here without a §: the sigil makes a
 * citation, and a number being *reported* is not one. The checker cannot tell them
 * apart, and the prose is clearer for the distinction anyway.
 *
 * Comments are not stripped here, deliberately: the comment *is* the subject.
 */
const WORKSPACES = ['app', 'core', 'mobile', 'bridge', 'relay', 'extension', 'scripts', 'supabase'];

function code(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.expo') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) code(path, out);
    else if (/\.(tsx?|mjs|sql)$/.test(entry.name)) out.push(path);
  }
  return out;
}

describe('cross-references in the source', () => {
  const files = WORKSPACES.flatMap((name) => code(resolve(ROOT, name)));

  it('reads the source rather than an empty tree', () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it('points every § in a comment at a section that exists', () => {
    const dangling: string[] = [];
    let found = 0;
    for (const file of files) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          for (const match of line.matchAll(REFERENCE)) {
            found++;
            if (!SECTIONS.has(match[1])) {
              dangling.push(`${relative(ROOT, file)}:${index + 1}  §${match[1]}`);
            }
          }
        });
    }
    // Guards that had stopped explaining themselves would pass silently.
    expect(found, 'nothing in the source cites the record').toBeGreaterThan(100);
    expect(dangling).toEqual([]);
  });

  it('can still say how much of the design record is unread', () => {
    /*
     * §6.178 turned "eighty-six shots are unread, of 134" from a sentence carried by hand
     * through eight entries into `design/unread.mjs`, and this is what stops that script
     * quietly measuring nothing.
     *
     * ## The clause this replaced could not fail for its own subject
     *
     * The first version checked that every entry in `SHOT_DIRS` exists and holds `.png`
     * files. Planted the exact mistake it was written against — `design/real/t/p/w300`,
     * which holds sixty-three **TMDB poster fixtures** and which a first pass at this
     * measurement really did count — and the suite went **green**: that directory exists,
     * it holds PNGs, the total is over a hundred, the backlog is a subset. Every assertion
     * satisfied, and the script now measuring poster art. §6.121 in a guard written the
     * same hour as the thing it guards.
     *
     * ## What tells them apart
     *
     * Not the file type and not the count. A shot of the product is a file **a capture
     * script wrote**, so the check is against the harness rather than against the disk:
     * every directory in `SHOT_DIRS` must be some `capture*.mjs`'s `OUT`, and every `OUT`
     * must be in `SHOT_DIRS`. Both directions, because a new capture script filing into a
     * fifth directory would otherwise leave its shots outside the backlog for ever —
     * §6.157's hole, which is what this whole entry is about.
     */
    const scripts = readdirSync(resolve(ROOT, 'design')).filter((f) => /^capture.*\.mjs$/.test(f));
    expect(scripts.length, 'no capture scripts, so nothing files shots').toBeGreaterThan(3);
    const outs = new Set(
      scripts.flatMap((f) => [
        ...readFileSync(resolve(ROOT, 'design', f), 'utf8').matchAll(
          /const OUT = new URL\('\.\/([a-z-]+)\//g,
        ),
      ].map((m) => `design/${m[1]}`)),
    );
    expect([...outs].sort(), 'a capture script files somewhere the backlog does not count')
      .toEqual([...SHOT_DIRS].sort());

    const all = shots();
    const left = unnamed();

    /*
     * Three numbers about the backlog — but only where there is a backlog to see.
     *
     * Every shot directory is gitignored: `git ls-files design/screens` returns nothing, and
     * they exist only where a capture script has run. So this clause asserted a hundred
     * photographs on a checkout that could not have any, and §6.187 is how that surfaced —
     * a device agent cloned the repository on a Mac and found `verify` red for three reasons,
     * none of them the code. `unread.mjs` threw a raw `ENOENT` before that; it reports which
     * directories it could not open now.
     *
     * **A checkout with no photographs is not a record with nothing in it.** §6.57, for the
     * third time in this file's neighbourhood, and the reason the two cases are separated
     * rather than the assertions being softened: where the shots *are* present the three
     * numbers below are exactly as strict as they were. What changes is that the absence of
     * a design run is now reported as an absence rather than as a failing record.
     *
     * The clause above this one still runs either way — it compares `SHOT_DIRS` against the
     * capture scripts' own `OUT` paths, which are source and are always readable. That is the
     * half that actually guards the register, and it is deliberately not behind this branch.
     */
    if (missingShotDirs().length) {
      expect(
        all.length,
        'some shot directories are missing and others are not, so the count is of a half-built design run',
      ).toBe(0);
      return;
    }

    expect(all.length, 'the design record has no shots in it').toBeGreaterThan(100);
    expect(left.length, 'every shot is named, which has never been true').toBeGreaterThan(0);
    expect(left.length, 'no shot has ever been named, so the proxy is broken')
      .toBeLessThan(all.length);
  });

  /**
   * The census has two categories, and this makes it show them apart **on demand**.
   *
   * ## What went wrong
   *
   * Fifty-five shots — thirty-eight in `design/web-real`, seventeen in
   * `design/real-screens` — photographed the five-tab bar, a Search destination, `/calendar`
   * and Discover as a list of rows with two buttons. The information-architecture rework
   * deleted all four the same evening. `unread.mjs` had no way to tell a shot nobody has read
   * from a shot of a build nobody can reach, so all thirty-eight of the web-real ones sat
   * inside the reported backlog. The number was not merely large; it was the wrong shape,
   * and it had been reported that way for a sprint. Task 228, written without a § because
   * the section that will hold it is not in the document yet and the sigil is a citation.
   *
   * ## Why the check plants rather than reads
   *
   * Because asserting *the current numbers* is the failure this file already has three
   * entries about. `expect(stale).toBe(0)` goes red the next time somebody fixes a comment
   * in a `capture*.mjs` — a correct change — and a rule that fires on correct changes is a
   * rule people learn to route around. `expect(stale).toBeGreaterThan(0)` is worse: it goes
   * red the moment the design record is *healthy*, which is the state this is all for.
   *
   * Neither number is the property. The property is that the census can **separate its two
   * categories**, and the only way to see that is to hand it one of each and look. So two
   * files are written into a real shot directory — one stamped before the last commit that
   * touched the capture script filing there, one stamped now — and both are named. A census
   * that puts them in the same bucket is the defect it was written to fix, whatever its
   * totals happen to be that day.
   *
   * The plant is removed in a `finally`. Both live in a gitignored directory and both are
   * named for what they are, so the worst case of a hard crash mid-run is two obvious files.
   */
  it('tells a photograph of a deleted architecture from a shot nobody has read', () => {
    /*
     * Named first, and by file. A census with no second category fails this clause on a
     * `TypeError` from whichever line happens to call it, and the reader is left with
     * "filedBy is not a function" and a line number in a *test*. The defect is in
     * `design/unread.mjs`, so the message says so.
     */
    for (const [name, fn] of Object.entries({ census, filedBy, staleBefore })) {
      expect(
        typeof fn,
        `design/unread.mjs exports no ${name}(), so it cannot tell a shot of a deleted architecture from one nobody has read`,
      ).toBe('function');
    }
    shots();
    const here = SHOT_DIRS.filter((d) => !missingShotDirs().includes(d));
    if (!here.length) return; // §6.187: no design run in this checkout, nothing to plant into.

    /*
     * A directory exactly one capture script files into, so the cutoff is the exact one and
     * not the conservative earliest-of-several `staleBefore` falls back to. `design/screens`
     * takes shots from two scripts and is deliberately not the fixture: a check should be run
     * against the case it can state precisely.
     */
    const by = filedBy();

    /*
     * And the map is the scripts' own, re-derived here rather than trusted.
     *
     * This is the half that a hand-written table passes silently. `design/screens` is filed
     * into by **two** scripts — `capture.mjs` and `capture-signedin.mjs` — and a census that
     * lists only the first is not obviously broken: it still separates stale from unread, on
     * every directory, including the one the plant below uses. It simply judges sixty-one
     * shots against the wrong script and says so with a straight face. So the mapping is read
     * out of `design/capture*.mjs` a second time, by a different reader, and compared.
     */
    const declared = new Map(SHOT_DIRS.map((d) => [d, [] as string[]]));
    for (const file of readdirSync(resolve(ROOT, 'design')).filter((f) => /^capture.*\.mjs$/.test(f))) {
      for (const [, out] of readFileSync(resolve(ROOT, 'design', file), 'utf8').matchAll(
        /const OUT = new URL\('\.\/([a-z-]+)\//g,
      )) {
        declared.get(`design/${out}`)?.push(`design/${file}`);
      }
    }
    for (const [d, scripts] of declared) {
      expect(
        [...(by.get(d) ?? [])].sort(),
        `design/unread.mjs judges ${d} against a different set of capture scripts than the ones that file into it`,
      ).toEqual([...scripts].sort());
    }

    /*
     * **Every** directory exactly one capture script files into, not the first one found.
     *
     * Measured, not assumed. With the plant going into only the first — `design/web`, by the
     * order of `SHOT_DIRS` — a census that returned `false` for `design/real-screens` and
     * judged everything else correctly passed all eleven clauses of this file. Seventeen
     * shots exempt from the whole census, silently, and nothing here could see it, because
     * the clause was written against *a* directory rather than against the directories.
     *
     * `design/screens` is left out on purpose: two scripts file into it, so its cutoff is the
     * conservative earliest rather than an exact date, and the clause below owns that case.
     */
    const single = here.filter((d) => (by.get(d) ?? []).length === 1);
    expect(single.length, 'no shot directory has exactly one capture script filing into it')
      .toBeGreaterThan(0);

    for (const dir of single) {
      const cutoff = staleBefore(dir);
      expect(cutoff, `nothing says when ${dir}'s capture script last changed`).toBeGreaterThan(0);

      const past = resolve(ROOT, dir, 'zz-census-plant-stale.png');
      const fresh = resolve(ROOT, dir, 'zz-census-plant-unread.png');
      try {
        for (const file of [past, fresh]) writeFileSync(file, '');
        // An hour before the capture script last changed, and now. Nothing subtle: the two
        // cases are meant to be unmistakable, because a fixture that only just separates
        // tests the arithmetic rather than the rule.
        const before = new Date(cutoff - 3_600_000);
        utimesSync(past, before, before);

        const { stale, unread } = census();
        expect(stale, `${dir}/zz-census-plant-stale.png predates its own capture script and the census calls it backlog`)
          .toContain(`${dir}/zz-census-plant-stale.png`);
        expect(unread, `${dir}/zz-census-plant-unread.png is unread and the census does not say so`)
          .toContain(`${dir}/zz-census-plant-unread.png`);
        // And the other way, because a census that called everything stale would pass the two
        // clauses above on the first one alone.
        expect(stale, `${dir}/zz-census-plant-unread.png was taken after its capture script and is not a photograph of the past`)
          .not.toContain(`${dir}/zz-census-plant-unread.png`);
        expect(unread, `${dir}/zz-census-plant-stale.png is a photograph of the past and must not be counted as backlog`)
          .not.toContain(`${dir}/zz-census-plant-stale.png`);
      } finally {
        for (const file of [past, fresh]) rmSync(file, { force: true });
      }
    }
  });

  /**
   * Where two capture scripts share a directory, the cutoff is the **earlier** of them.
   *
   * Nothing in a `.png` says which script walked to it, so the only claim `design/screens`
   * supports is *this shot predates every script that could have taken it*. Take the later
   * one instead and every shot from whichever script had not changed is accused of
   * photographing a build that still exists — a census that is confidently wrong about
   * sixty-one shots, which is worse than the one it replaced.
   *
   * The two spellings differ on exactly one window: a shot stamped **between** the earlier
   * script's last change and the later one's. `min` calls it current, `max` calls it a
   * photograph of the past, and no assertion about totals can see the difference. So a shot
   * is planted in that window.
   *
   * Skipped, with the reason, when the window is empty — two scripts committed together
   * have the same date and there is nothing to tell apart. That is a real state of the
   * repository rather than a failure, and a clause that went red for it would be a rule
   * firing on a correct change.
   */
  it('judges a directory two capture scripts share against the earlier of them', () => {
    shots();
    const by = filedBy();
    const dir = SHOT_DIRS.find(
      (d) => !missingShotDirs().includes(d) && (by.get(d) ?? []).length > 1,
    );
    if (!dir) return; // No shared directory in this checkout, so there is no window.

    const dates = (by.get(dir) ?? []).map(scriptChangedAt);
    const [earliest, latest] = [Math.min(...dates), Math.max(...dates)];
    if (latest - earliest < 2000) return; // Committed together; the window is empty.

    const between = resolve(ROOT, dir, 'zz-census-plant-between.png');
    try {
      writeFileSync(between, '');
      const at = new Date((earliest + latest) / 2);
      utimesSync(between, at, at);
      expect(
        census().stale,
        `${dir}/zz-census-plant-between.png is newer than the earliest script filing into ${dir}, ` +
          'so nothing establishes it photographs a build that is gone',
      ).not.toContain(`${dir}/zz-census-plant-between.png`);
    } finally {
      rmSync(between, { force: true });
    }
  });
});
