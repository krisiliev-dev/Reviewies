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

export function shots() {
  return SHOT_DIRS.flatMap((dir) =>
    readdirSync(resolve(ROOT, dir))
      .filter((f) => f.endsWith('.png'))
      .map((f) => `${dir}/${f}`),
  );
}

export function unnamed(doc = readFileSync(resolve(ROOT, 'docs/research/09-app-first-pivot.md'), 'utf8')) {
  return shots().filter((p) => !doc.includes(p.split('/').pop().replace(/\.png$/, '')));
}

if (process.argv[1] === import.meta.filename) {
  const all = shots();
  const left = unnamed();
  console.log(`${all.length} shots, ${left.length} never named in doc 9\n`);
  for (const p of left) console.log(p);
}
