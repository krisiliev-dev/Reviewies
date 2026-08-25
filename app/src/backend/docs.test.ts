import { describe, expect, it } from 'vitest';
import { globSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The deploy documentation has to keep up with the directory.
 *
 * Not pedantry. The README claimed "all 9 migrations" deployed while the code had come
 * to depend on functions that arrive in the tenth and eleventh, and a status table that
 * overstates what is deployed is worse than no table — it is exactly what someone checks
 * before trusting the system. A test is the only thing that keeps prose honest, because
 * prose does not fail.
 */
const ROOT = resolve(__dirname, '../../..');

describe('deploy documentation', () => {
  it('names every migration', () => {
    const migrations = readdirSync(resolve(ROOT, 'supabase/migrations')).filter((f) =>
      f.endsWith('.sql'),
    );
    const doc = readFileSync(resolve(ROOT, 'supabase/README.md'), 'utf8');

    expect(migrations.length).toBeGreaterThan(0);
    const missing = migrations.filter((file) => !doc.includes(file));
    expect(missing).toEqual([]);
  });

  it('names every edge function', () => {
    // Same failure, different directory: a function nobody deploys is a feature that
    // silently does not exist.
    const functions = readdirSync(resolve(ROOT, 'supabase/functions'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    const doc = readFileSync(resolve(ROOT, 'supabase/README.md'), 'utf8');

    expect(functions.length).toBeGreaterThan(0);
    expect(functions.filter((name) => !doc.includes(name))).toEqual([]);
  });
});

/**
 * The rest of the prose, held to the same standard.
 *
 * The migration and function lists above exist because a table overstating what was
 * deployed is exactly what somebody checks before trusting the system. The same is true
 * of everything else the documentation claims: a command nobody can run, a switch nobody
 * knows about, and a subsystem that is not mentioned at all are all the same failure,
 * and prose does not fail on its own.
 */
const readmes = () =>
  [
    'README.md',
    'app/README.md',
    'core/README.md',
    'mobile/README.md',
    'bridge/README.md',
    'relay/README.md',
    'extension/README.md',
    'supabase/README.md',
    'docs/deploying.md',
  ]
    .map((path) => readFileSync(resolve(ROOT, path), 'utf8'))
    .join('\n');

describe('what the documentation claims', () => {
  it('names every command someone is expected to run', () => {
    const docs = readmes();
    const missing: string[] = [];

    for (const workspace of ['.', 'app', 'core', 'mobile', 'bridge', 'relay', 'extension']) {
      const pkg = JSON.parse(readFileSync(resolve(ROOT, workspace, 'package.json'), 'utf8'));
      for (const script of Object.keys(pkg.scripts ?? {})) {
        // The conventional four explain themselves and appear in every workspace.
        if (['dev', 'build', 'test', 'lint', 'preview', 'start'].includes(script)) continue;
        if (!docs.includes(script)) missing.push(`${workspace}: ${script}`);
      }
    }

    expect(missing).toEqual([]);
  });

  it('names every switch that changes what the tests do', () => {
    // A live suite nobody knows how to turn on is a suite nobody runs, and one that
    // turns itself on because a token happens to be present is somebody else's flake.
    const docs = readmes();
    const switches = new Set<string>();

    for (const file of globSync('{core,app}/src/**/*.ts', { cwd: ROOT })) {
      const source = readFileSync(resolve(ROOT, file), 'utf8');
      for (const [, name] of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) {
        switches.add(name);
      }
    }

    expect(switches.size).toBeGreaterThan(0);
    expect([...switches].filter((name) => !docs.includes(name))).toEqual([]);
  });

  it('accounts for every part of the core', () => {
    // The layout in the README is how somebody finds the code. A directory missing from
    // it is a subsystem that, as far as the documentation is concerned, does not exist.
    const areas = readdirSync(resolve(ROOT, 'core/src'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== 'test')
      .map((entry) => entry.name);
    const layout = readFileSync(resolve(ROOT, 'README.md'), 'utf8');

    expect(areas.length).toBeGreaterThan(5);
    expect(areas.filter((name) => !layout.includes(`src/${name}/`))).toEqual([]);
  });
});

/**
 * No counts in the prose.
 *
 * Every README in this repository has claimed a number of tests, and every one of those
 * numbers had rotted: the bridge said 43 when it had 24, the core said 386 when it had
 * 552, the root said 516 and 165 and 50 and 47 when it had none of those. A count is
 * the one fact in a document that is guaranteed to be wrong by the next commit, and
 * being confidently wrong about how much is tested is worse than saying nothing.
 *
 * `npm test` prints the number. The prose says what the tests cover.
 */
describe('the prose', () => {
  it('does not count things that will have changed by tomorrow', () => {
    const stale: string[] = [];

    for (const path of [
      'README.md',
      'app/README.md',
      'core/README.md',
      'mobile/README.md',
      'bridge/README.md',
      'relay/README.md',
      'extension/README.md',
      'supabase/README.md',
      'docs/deploying.md',
    ]) {
      for (const [claim] of readFileSync(resolve(ROOT, path), 'utf8').matchAll(
        /\b\d+ (?:tests?|checks?)\b/g,
      )) {
        stale.push(`${path}: ${claim}`);
      }
    }

    expect(stale).toEqual([]);
  });
});
