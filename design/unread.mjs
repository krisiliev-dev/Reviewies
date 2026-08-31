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
 * ## Unread is not the only way a shot can fail to be backlog
 *
 * Thirty-eight shots in `design/web-real` and seventeen in `design/real-screens`
 * photographed the **five**-tab bar, a Search destination, `/calendar`, and Discover as a
 * list of rows with two buttons. The information-architecture rework deleted all four at
 * 21:22 on 2026-08-30; the shots were taken at 06:34 that morning. Every one of them was
 * counted here as unread backlog, and the backlog number was reported that way for a
 * sprint — so the number was not merely large, it was **the wrong shape**. A photograph of
 * a build nobody can reach is not something anybody should go and read. Task 228, and
 * written without a § because the section that will hold it is not in doc 9 yet.
 *
 * So the census has two categories now, and `stale()` is the one that says which shots are
 * photographs of the past. The direction of the split matters: a stale shot is subtracted
 * from the backlog rather than added to it, because the answer to it is *re-run the pass*,
 * not *go and look*.
 *
 * Run: `node design/unread.mjs`
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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

/**
 * Which capture scripts file into which directory — read out of the scripts, not typed here.
 *
 * **The mapping is not one-to-one and assuming it is gives a confidently wrong census.**
 * `design/screens` is written by *two* scripts: `capture.mjs` (the phone pass) and
 * `capture-signedin.mjs` (the signed-in pass). Attribute all sixty-one of its shots to
 * `capture.mjs` and every signed-in shot older than `capture.mjs`'s last commit is accused
 * of photographing a build that still exists; attribute them all to `capture-signedin.mjs`
 * and the phone's are excused. Either way the number is stated with a confidence nothing in
 * it earns, which is worse than the number it replaces.
 *
 * So the `OUT` literal is read from each `capture*.mjs`, exactly as
 * `app/src/wiring/docsReferences.test.ts` already reads it to check `SHOT_DIRS` against the
 * harness. One `const OUT = new URL('./<dir>/'` per script, in source, always readable —
 * and a *fifth* capture script filing into a fifth directory appears here the day it is
 * written rather than the day somebody remembers this table exists.
 */
export function filedBy() {
  const by = new Map(SHOT_DIRS.map((d) => [d, []]));
  for (const file of readdirSync(resolve(ROOT, 'design')).filter((f) => /^capture.*\.mjs$/.test(f))) {
    const source = readFileSync(resolve(ROOT, 'design', file), 'utf8');
    for (const [, dir] of source.matchAll(/const OUT = new URL\('\.\/([a-z-]+)\//g)) {
      by.get(`design/${dir}`)?.push(`design/${file}`);
    }
  }
  return by;
}

/**
 * When a capture script last **changed**, as epoch milliseconds.
 *
 * The last commit that touched it, rather than its mtime on disk, and the difference is the
 * whole reason this is a git call and not a `statSync`. Every file in a fresh clone has the
 * mtime of the clone, so an mtime rule would report the entire design record as stale to
 * anybody who had just checked the repository out — §6.187's shape exactly, where a device
 * agent found `verify` red for three reasons and none of them the code.
 *
 * ## Why not `max(commit, mtime)`, which looks more complete
 *
 * Because it inverts on the ordinary sequence. Edit a capture script, re-run its pass, then
 * commit: the commit lands *after* the shots, `max` picks it, and every shot the run just
 * took is called a photograph of the past. A rule that fires on the correct sequence is a
 * rule people learn to ignore.
 *
 * What the commit-only rule costs instead is stated rather than hidden: between editing a
 * capture script and committing it, shots taken with the *old* script are not yet called
 * stale. That is the direction to be wrong in — this never accuses a shot that is current,
 * so `stale` is a floor and the backlog it is subtracted from is a ceiling, which is the
 * same direction the naming proxy at the head of this file already errs in.
 *
 * An uncommitted script — a new pass not yet added — has no commit to read. Its own mtime
 * answers then, because a script that has never been committed cannot have shots older than
 * a commit it does not have, and reporting `0` would silently excuse every shot in its
 * directory for ever.
 */
const changedCache = new Map();
export function scriptChangedAt(script) {
  if (changedCache.has(script)) return changedCache.get(script);
  let at = 0;
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%ct', '--', script], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    at = out ? Number(out) * 1000 : 0;
  } catch {
    at = 0;
  }
  if (!at) {
    try {
      at = statSync(resolve(ROOT, script)).mtimeMs;
    } catch {
      at = 0;
    }
  }
  changedCache.set(script, at);
  return at;
}

/**
 * The moment before which a shot in this directory is a photograph of the past.
 *
 * One script files here: that script's own last change, and the answer is exact.
 *
 * **Two or more: the earliest of them.** Not the latest, and this is the conservative half
 * of the mapping above. `design/screens` takes shots from both the phone pass and the
 * signed-in pass, and nothing in a `.png` on disk says which walked to it — so the only
 * claim the directory supports is *this shot predates every script that could have taken
 * it*, which is unarguable. The latest would accuse shots from whichever script had not
 * changed. `ambiguous` in the census counts how many shots are being judged this way, so
 * the softness is a number in the report rather than a footnote nobody reads.
 */
export function staleBefore(dir, by = filedBy()) {
  const scripts = by.get(dir) ?? [];
  if (!scripts.length) return 0;
  return Math.min(...scripts.map(scriptChangedAt));
}

/**
 * Shots older than the capture script that took them.
 *
 * A shot's mtime is when the shutter fired: `page.screenshot` writes the file, and nothing
 * else in this repository rewrites one. That is a real property of the disk rather than a
 * proxy, which is what makes this half of the census firmer than the naming half above.
 */
export function stale(all = shots()) {
  const by = filedBy();
  const before = new Map(SHOT_DIRS.map((d) => [d, staleBefore(d, by)]));
  return all.filter((p) => {
    const dir = p.slice(0, p.lastIndexOf('/'));
    const cutoff = before.get(dir) ?? 0;
    if (!cutoff) return false;
    try {
      return statSync(resolve(ROOT, p)).mtimeMs < cutoff;
    } catch {
      return false;
    }
  });
}

/**
 * The two numbers, separated — and the third that says how much of it is soft.
 *
 * `unread` is what the backlog actually is: never named in doc 9 **and** not a photograph of
 * a build that no longer exists. Stale comes out first because the answer to a stale shot is
 * to re-run its pass, and reading it would be reading the past.
 */
export function census() {
  const all = shots();
  const past = new Set(stale(all));
  const neverNamed = new Set(unnamed());
  const by = filedBy();
  return {
    all,
    stale: [...past],
    unread: all.filter((p) => neverNamed.has(p) && !past.has(p)),
    /** Shots in a directory more than one capture script files into. */
    ambiguous: all.filter((p) => (by.get(p.slice(0, p.lastIndexOf('/'))) ?? []).length > 1).length,
  };
}

if (process.argv[1] === import.meta.filename) {
  const { all, stale: past, unread, ambiguous } = census();
  console.log(
    `${all.length} shots: ${unread.length} unread, ${past.length} stale — ` +
      `${all.length - unread.length - past.length} read and current\n`,
  );
  if (missingShotDirs().length) {
    console.error(
      `Could not look in ${missingShotDirs().length} of ${SHOT_DIRS.length} directories — ` +
        `${missingShotDirs().join(', ')}. Run \`npm run design\` first; the count above is of what ` +
        'this checkout can see, which is not the same as what exists.',
    );
  }
  const by = filedBy();
  for (const dir of SHOT_DIRS) {
    const cutoff = staleBefore(dir, by);
    console.log(
      `  ${dir} ← ${(by.get(dir) ?? []).join(', ') || 'nothing'}` +
        `${cutoff ? ` (stale before ${new Date(cutoff).toISOString()})` : ''}`,
    );
  }
  if (ambiguous) {
    console.log(
      `\n${ambiguous} shots sit in a directory more than one capture script files into, so ` +
        'they are judged against the earliest of those scripts and this count is a floor.',
    );
  }
  if (past.length) {
    console.log(`\nstale — re-run the pass, do not read these (${past.length}):`);
    for (const p of past) console.log(`  ${p}`);
  }
  console.log(`\nunread — never named in doc 9 (${unread.length}):`);
  for (const p of unread) console.log(`  ${p}`);
}
