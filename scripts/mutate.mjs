/**
 * Change one line, run the tests, see whether anything notices.
 *
 *   node scripts/mutate.mjs <file> "<test scope>" [indices]
 *
 *   node scripts/mutate.mjs core/src/sync/engine.ts "src/sync"
 *   node scripts/mutate.mjs core/src/data/repo.ts "src/data src/sync" 10,21,36
 *
 * `file` is repo-relative; `scope` is passed to `vitest run` inside the workspace that
 * owns the file; `indices` re-runs a chosen few from a previous listing.
 *
 * ## What this is for
 *
 * Every guard in this repository is proved by planting the one violation its author had
 * in mind. That proves each guard catches the case somebody thought of; it says nothing
 * about which *other* lines could change with the suite still green. This answers that,
 * and §6.75 is what it found the first time it ran — an eighteen-mutation function that
 * survived intact, a threshold nobody had ever crossed, and a test that measured a
 * constant with the same constant.
 *
 * It is a tool, not a guard. It is deliberately not in `npm run verify`: a mutation run
 * takes tens of minutes, and its output needs a person to classify.
 *
 * ## Two rules paid for in wasted time
 *
 * **Restore on a signal, not only on exit.** A `finally` does not run when the process is
 * killed, and a harness that dies leaves a mutant sitting in the working tree — which is
 * worse than any finding it could have produced. §6.75 killed a stuck run and then spent
 * twenty minutes wondering why three unrelated suites had gone red.
 *
 * That is why the test run is spawned asynchronously rather than with `execFileSync`.
 * §6.76 wrote the signal handlers first and proved they did nothing: a synchronous child
 * blocks the event loop, so `SIGTERM` sits in the queue until the run it was meant to
 * interrupt has finished anyway. And because `SIGKILL` can never be handled at all, the
 * original is also written beside the file as `.mutant-backup` and restored by the next
 * invocation, so the worst case is one stale mutant rather than a permanent one.
 *
 * **A mutant that does not parse proves nothing.** `Map<string, number>` with the `<`
 * flipped is a syntax error, and the run that fails on it fails before a single test
 * executes. Reported as INVALID rather than counted as a kill.
 *
 * ## Two rules for reading the output
 *
 * **Triage narrow, confirm wide.** Scoping to one directory is four times faster and
 * produces a survivor list that is half wrong — a symbol declared in `data/` is often
 * tested from `sync/`. Every survivor has to be re-run against a scope wide enough to
 * include its real tests before it is believed.
 *
 * **Distrust a kill.** A flaky test, or one killed by the runner's default timeout rather
 * than by its own assertion, kills mutants for reasons that have nothing to do with the
 * change. Check the named failure is a test that *should* have caught it.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blankLiterals } from '../core/src/test/source.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [, , file, scope, only] = process.argv;
if (!file || (scope === undefined && !process.env.MUTATE_CMD)) {
  console.error('usage: node scripts/mutate.mjs <file> "<test scope>" [indices]');
  console.error('       MUTATE_CMD="<command>" node scripts/mutate.mjs <file> "" [indices]');
  process.exit(2);
}

const path = resolve(ROOT, file);
const workspace = resolve(ROOT, file.split('/')[0]);
// See "Restore on a signal" above. `exit` covers the normal and thrown paths; the signal
// handlers cover being killed, which is how this actually goes wrong.
const backup = `${path}.mutant-backup`;
// A previous run that was killed outright (`kill -9`, a container stopping) could not
// restore anything. Do it here, before reading the file as though it were the original.
if (existsSync(backup)) {
  console.error(`Restoring ${file} from a previous run that did not finish.`);
  writeFileSync(path, readFileSync(backup, 'utf8'));
}

const original = readFileSync(path, 'utf8');
writeFileSync(backup, original);

const restore = () => {
  writeFileSync(path, original);
  rmSync(backup, { force: true });
};
process.on('exit', restore);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    restore();
    process.exit(1);
  });
}

/**
 * The operators, as [what to find in the blanked source, what to put there].
 *
 * Spaces around the comparison operators on purpose: `Map<string, number>` is written
 * without them by the formatter, so requiring them keeps generics out of the sample
 * without needing to parse types. Whatever slips through is caught as INVALID.
 */
const OPERATORS = [
  [/ <= /g, () => ' < '],
  [/ >= /g, () => ' > '],
  [/ < /g, () => ' <= '],
  [/ > /g, () => ' >= '],
  [/ === /g, () => ' !== '],
  [/ !== /g, () => ' === '],
  [/ && /g, () => ' || '],
  [/ \|\| /g, () => ' && '],
  [/!(?=[A-Za-z_$(])/g, () => ''],
  [/\breturn true\b/g, () => 'return false'],
  [/\breturn false\b/g, () => 'return true'],
  [/(?<![\w.$])(\d+)(?![\w.])/g, (m) => String(Number(m[1]) + 1)],
];

// Found in the literal-blanked copy so a comparison inside a string, a comment or a regex
// is never mutated, and applied to the original at the same offsets — `blankLiterals`
// preserves every character position, which is the whole reason it exists.
const code = blankLiterals(original);
const mutants = [];
for (const [pattern, rewrite] of OPERATORS) {
  pattern.lastIndex = 0;
  let match;
  while ((match = pattern.exec(code))) {
    const line = code.slice(0, match.index).split('\n').length;
    mutants.push({
      at: match.index,
      len: match[0].length,
      from: original.slice(match.index, match.index + match[0].length),
      to: rewrite(match),
      line,
      source: original.split('\n')[line - 1].trim().slice(0, 90),
    });
  }
}
mutants.sort((a, b) => a.at - b.at);

/**
 * One test run, asynchronously, so the signal handlers above can actually fire.
 *
 * `MUTATE_CMD` replaces the vitest invocation entirely, for code whose only exercise is
 * a suite vitest does not run — the bridge's `e2e.mjs` against a fake television, or a
 * smoke run in a real browser. Without it those files report every mutant as a survivor,
 * which is true of the unit tests and not of the product:
 *
 *   MUTATE_CMD='npm run smoke --workspace bridge' node scripts/mutate.mjs bridge/src/index.ts ''
 */
function run(scopes, cwd) {
  const override = process.env.MUTATE_CMD;
  const [command, args] = override
    ? ['sh', ['-c', override]]
    : ['npx', ['vitest', 'run', ...scopes.split(' ').filter(Boolean), '--silent']];
  return new Promise((settle) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('close', (code) => settle({ code: code ?? 1, output }));
    child.on('error', (e) => settle({ code: 1, output: String(e) }));
  });
}

const chosen = only ? new Set(only.split(',').map((n) => n.trim())) : undefined;
let killed = 0;
let survived = 0;
let invalid = 0;

for (const [index, mutant] of mutants.entries()) {
  if (chosen && !chosen.has(String(index))) continue;
  writeFileSync(
    path,
    original.slice(0, mutant.at) + mutant.to + original.slice(mutant.at + mutant.len),
  );

  const { code: exitCode, output } = await run(scope, workspace);

  let verdict = 'SURVIVED';
  let detail = '';
  if (exitCode !== 0) {
    verdict = /Transform failed|Parse failure|Expected .* but found|error TS\d/.test(output)
      ? 'INVALID'
      : 'killed';
    // The first two named failures, so a kill can be checked against what should have
    // caught it rather than taken on trust.
    detail = (output.match(/× [^\n]+/g) ?? []).slice(0, 2).join(' | ');
  }

  if (verdict === 'killed') killed++;
  else if (verdict === 'INVALID') invalid++;
  else survived++;

  console.log(
    `${String(index).padStart(3)} ${verdict.padEnd(8)} L${String(mutant.line).padStart(4)} ` +
      `${JSON.stringify(mutant.from)}→${JSON.stringify(mutant.to)}  ${mutant.source}` +
      (detail ? `\n         ${detail}` : ''),
  );
}

restore();
console.log(
  `\n${file}: ${killed + survived + invalid} mutants, ${killed} killed, ${survived} survived, ` +
    `${invalid} did not parse`,
);
