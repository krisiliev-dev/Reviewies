/**
 * Which shots the record has never named, and how many.
 *
 * ## Why this is a script and not a number in a sentence
 *
 * "Eighty-six shots are unread, of 134" was carried by hand through eight entries of doc 9,
 * decremented each sprint by whoever remembered. §6.157's shape exactly: a register somebody
 * has to update goes stale the first sprint anybody is busy.
 *
 * §6.178 went looking for how stale and nearly filed a finding that the count was wrong by
 * a factor of two — because a first pass counted `design/real/t/p/w300/*.png`, which are
 * TMDB **poster fixtures** for the snapshot server, not screenshots of the product. The
 * count was right all along. That near miss is the argument for this file: a number nobody
 * can re-derive is a number nobody can check, including the person who wrote it.
 *
 * ## What it actually measures, which is not quite "read"
 *
 * A shot whose basename appears somewhere in `docs/research/09-app-first-pivot.md`. That is
 * a **proxy**: a shot can be named in passing without being looked at, and a shot can be
 * looked at and produce nothing worth writing down. It is stated here rather than left for
 * somebody to assume, and it is the honest direction to be wrong in — this over-counts what
 * has been read, so the real backlog is at least this big.
 *
 * Run: `node design/unread.mjs`
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

/** The four directories that hold screenshots of the product. Nothing else does. */
export const SHOT_DIRS = [
  'design/screens',
  'design/web',
  'design/web-real',
  'design/real-screens',
];

/**
 * Directories that exist, and the ones this checkout cannot see.
 *
 * `git ls-files design/screens` returns **nothing** — every shot directory is gitignored and
 * exists only where a capture script has run. So on a fresh clone `readdirSync` threw, and
 * `docsReferences.test.ts`, which reads this to report the backlog, failed with a raw `ENOENT`
 * for anybody who had not run a design pass. §6.187, found by an agent checking the tree out
 * on a Mac.
 *
 * A missing directory is **not zero shots**. That is §6.57, which this file's own header
 * already invokes about the proxy it measures, and it is the same distinction one level down:
 * "the record has read everything" and "I cannot see the photographs" are different answers
 * and only one of them is about the record. `absent` is returned so a caller can say which.
 */
export function shots() {
  const found = [];
  const absent = [];
  for (const dir of SHOT_DIRS) {
    let entries;
    try {
      entries = readdirSync(resolve(ROOT, dir));
    } catch {
      absent.push(dir);
      continue;
    }
    for (const f of entries) if (f.endsWith('.png')) found.push(`${dir}/${f}`);
  }
  missing = absent;
  return found;
}

/**
 * Which directories the last `shots()` could not open. Empty after a design run.
 *
 * A separate export rather than a property hung on the function, because a property on a
 * function is invisible to the type `tsc` infers for an imported `.mjs` and the consumer
 * would not compile. Found by `npm run verify` immediately, which is the argument for
 * running it rather than the workspace's own typecheck.
 */
let missing = [];
export const missingShotDirs = () => missing;

/**
 * Named, meaning the whole basename appears — not a prefix of a longer one.
 *
 * `doc.includes(basename)` was the first spelling and it **under-counts**, because a longer
 * shot name credits every shorter one it starts with. Four shots were reported as read on
 * that basis alone: `dark-06-stats` because the doc writes `dark-06-stats-year` twice and
 * the plain stats screen never; `dark-10-settings`, `narrow-discover` and
 * `wide-title-one-piece` because their `-foot` shots are named and their heads are not.
 *
 * The asymmetry is the tell: naming a foot silently credits its head, and naming a head
 * never credits its foot. Four of 137 is not a large error, but it is one in the direction
 * that flatters — and this file's own header already says the proxy over-counts reading,
 * so a second over-count on top of it is the one to remove. §6.182.
 */
export function unnamed(doc = readFileSync(resolve(ROOT, 'docs/research/09-app-first-pivot.md'), 'utf8')) {
  return shots().filter((p) => {
    const name = p.split('/').pop().replace(/\.png$/, '');
    // Not followed by another name character, so `dark-06-stats-year` does not answer for
    // `dark-06-stats`. A trailing `.png`, a backtick, a space or a full stop all count.
    return !new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![-A-Za-z0-9])`).test(doc);
  });
}

if (process.argv[1] === import.meta.filename) {
  const all = shots();
  const left = unnamed();
  console.log(`${all.length} shots, ${left.length} never named in doc 9\n`);
  if (missingShotDirs().length) {
    console.error(
      `Could not look in ${missingShotDirs().length} of ${SHOT_DIRS.length} directories — ` +
        `${missingShotDirs().join(', ')}. Run \`npm run design\` first; the count above is of what ` +
        'this checkout can see, which is not the same as what exists.',
    );
  }
  for (const p of left) console.log(p);
}
