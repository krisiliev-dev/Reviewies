/**
 * What has never executed.
 *
 * Reads the report `npm run coverage` writes and prints the only part of it worth
 * reading: files nothing entered at all, and functions nothing ever called. Not a
 * percentage — this repository's standard is a named guard that fails for a stated
 * reason, and a coverage number is the opposite of that. It drifts, it can be gamed by
 * testing the easy half, and it says nothing about *which* line matters.
 *
 * What it is good for is the question §6.67 could not answer: is there code the product
 * runs that no test has ever entered? `SupabaseBackend.fromEnv()` was catastrophically
 * wrong for the life of the product and nothing had ever called it.
 *
 * Run it against the whole monorepo at once (`npm run coverage`) and never per
 * workspace. A per-workspace report is wrong in both directions and silent about it:
 * `core/src/devices/relayUrl.ts` comes back entirely dead because the suite that
 * executes it lives in `relay/`, and `core/src/data/adapters/sqlite.ts` comes back
 * three-quarters dead because the SQLite config is a separate run. §6.68.
 */
import { readFileSync } from 'node:fs';

const files = process.argv.length > 2 ? process.argv.slice(2) : ['coverage/coverage-final.json'];
const rows = [];
let totalFns = 0;
let deadFns = 0;

for (const path of files) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  for (const [file, cov] of Object.entries(data)) {
    const short = file.replace(/^.*\/Reviewies\//, '');
    const fnMap = cov.fnMap ?? {};
    const counts = cov.f ?? {};
    const never = [];
    for (const [id, meta] of Object.entries(fnMap)) {
      totalFns++;
      if ((counts[id] ?? 0) === 0) {
        deadFns++;
        never.push(`${meta.name || '(anonymous)'}:${meta.decl?.start?.line ?? '?'}`);
      }
    }
    const statements = Object.values(cov.s ?? {});
    const ranStatements = statements.filter((n) => n > 0).length;
    rows.push({
      file: short,
      fns: Object.keys(fnMap).length,
      never,
      statements: statements.length,
      ranStatements,
    });
  }
}

// Files nothing entered at all come first: those are whole subsystems, not gaps.
const untouched = rows.filter((r) => r.ranStatements === 0 && r.statements > 0);
const partial = rows
  .filter((r) => r.ranStatements > 0 && r.never.length > 0)
  .sort((a, b) => b.never.length - a.never.length);

console.log(`FILES: ${rows.length}   FUNCTIONS: ${totalFns}   NEVER RUN: ${deadFns}\n`);
console.log(`=== NEVER ENTERED AT ALL (${untouched.length} files) ===`);
for (const r of untouched.sort((a, b) => b.statements - a.statements)) {
  console.log(`  ${r.file}  (${r.statements} statements, ${r.fns} functions)`);
}
console.log(`\n=== PARTIALLY RUN: functions never called (${partial.length} files) ===`);
for (const r of partial) {
  console.log(`  ${r.file}  ${r.ranStatements}/${r.statements} statements`);
  console.log(`      ${r.never.join(', ')}`);
}
