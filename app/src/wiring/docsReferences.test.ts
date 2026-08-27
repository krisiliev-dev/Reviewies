import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
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

  /**
   * Files the design system specifies but nobody has built yet.
   *
   * A specification names the path it intends, which is the opposite failure from a
   * document pointing at a file that moved — and this guard was written for the second.
   * These are deliberately NOT permanent: the stale-exemption test below fails the
   * moment any of them exists, so each entry deletes itself as the work lands, and the
   * list doubles as what is left to build.
   */
  'core/src/ui/button.ts': 'docs/design/components.md specifies the shared button contract',
  'app/src/ui/Button.tsx': 'docs/design/components.md specifies the web half of it',
  'mobile/src/ui/Button.tsx': 'docs/design/components.md specifies the phone half of it',

  // What the token and component specs still name and nobody has built. Six entries
  // were here this morning and are gone because the files landed — the stale check
  // below took them out rather than anybody remembering to.
  'app/src/ui/fontBundle.test.ts': 'docs/design/tokens.md specifies it — not yet built',
  'app/src/ui/typeScale.test.ts': 'docs/design/tokens.md specifies it — not yet built',
  'app/src/ui/watchingDim.test.ts': 'docs/design/tokens.md specifies it — not yet built',
  'mobile/src/ui/fonts.ts': 'docs/design/tokens.md specifies it — not yet built',
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
});
