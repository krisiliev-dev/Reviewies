import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * Every TypeScript file is in the program of a config that a script actually runs.
 *
 * `everyWorkspaceRuns.test.ts` asks the same question about *tests*: a `test` script
 * exists, test files exist, and — the version that took three tries — the runner
 * collects them. This is that question about the **typechecker**, and the answer was no.
 *
 * `app/tsconfig.app.json` excludes `src/wiring`, `src/test` and every `*.test.ts` with
 * the comment "typechecked separately via tsconfig.test.json". That file existed, said
 * `noUnusedLocals: false`, and **nothing referenced it**: `app/tsconfig.json` listed the
 * app and node projects and not the test one, and `app` had no `typecheck` script for
 * `npm run verify` to find. So eighty-seven files were excluded from the build by a
 * comment naming a mechanism that did not run — §6.41's rule, in the one place nobody
 * thinks to check it, because a comment explaining an exclusion reads like a decision.
 *
 * The plant: `const PLANTED: number = 'not a number';` appended to
 * `app/src/ui/masthead.test.ts`. `npm run build` exited **0**. Vitest transpiles without
 * checking types and oxlint is not a typechecker, so nothing else was looking either.
 *
 * `tsc --showConfig` resolves a config's `include`/`exclude`/`references` to the actual
 * file list, in under half a second and without checking anything, which is what makes
 * this affordable to ask about every workspace on every run.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8')) as Record<string, never>;

const WORKSPACES = ((readJson(resolve(ROOT, 'package.json')) as { workspaces?: string[] })
  .workspaces ?? []) as string[];

/**
 * Configs a script names, found by reading the scripts rather than by listing configs.
 *
 * The direction matters. A guard that walked `tsconfig*.json` and checked each one would
 * have passed on the bug: `tsconfig.test.json` was a perfectly good config, and the
 * defect was that nothing invoked it. So start from what `npm run verify` runs — `test`,
 * `typecheck` and `build` in every workspace — and follow `tsc` to the config it loads.
 */
function configsRunBy(workspace: string): string[] {
  const pkg = readJson(resolve(ROOT, workspace, 'package.json')) as {
    scripts?: Record<string, string>;
  };
  const found = new Set<string>();
  for (const script of Object.values(pkg.scripts ?? {})) {
    for (const call of script.split('&&')) {
      if (!/\btsc\b/.test(call)) continue;
      /*
       * Not `\b-[pb]`. A word boundary needs a word character on one side, and there is
       * none between a space and a hyphen, so that spelling matched nothing and every
       * `-p` config read as the workspace's default `tsconfig.json` — which made this
       * clause report all sixty-seven of `app`'s test files as unchecked *after* they
       * had been wired up. The first version of a guard being wrong in the direction of
       * failing loudly is the good case; it is still wrong.
       */
      const project = /(?:^|\s)-(?:p|b|-project|-build)(?:\s+(\S+))?/.exec(call)?.[1]
        ?? 'tsconfig.json';
      found.add(resolve(ROOT, workspace, project));
    }
  }
  return [...found];
}

/** A `tsc -b` solution file holds no files of its own; follow it to the leaves. */
function withReferences(config: string, seen = new Set<string>()): string[] {
  if (seen.has(config) || !existsSync(config)) return [...seen];
  seen.add(config);
  const shown = JSON.parse(
    execFileSync('npx', ['tsc', '--showConfig', '-p', config], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
  ) as { references?: { path: string }[] };
  for (const ref of shown.references ?? []) {
    withReferences(resolve(dirname(config), ref.path), seen);
  }
  return [...seen];
}

function programOf(config: string): { files: string[]; options: Record<string, unknown> } {
  const shown = JSON.parse(
    execFileSync('npx', ['tsc', '--showConfig', '-p', config], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
  ) as { files?: string[]; compilerOptions?: Record<string, unknown> };
  const base = dirname(config);
  return {
    files: (shown.files ?? []).map((f) => resolve(base, f)),
    options: shown.compilerOptions ?? {},
  };
}

function sourcesUnder(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.expo', 'android', 'ios'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourcesUnder(path, out);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(path);
  }
  return out;
}

/**
 * Where each workspace keeps the TypeScript it is responsible for.
 *
 * Not "everything under the workspace": a workspace root holds `vite.config.ts`,
 * `vitest.*.config.ts` and the like, which the tooling loads through its own machinery
 * rather than through the app's program. The directories below are the code, and a new
 * one that nothing checks is exactly what this is for — so the list is per workspace and
 * the clause after it fails when a workspace grows a source directory not named here.
 */
const SOURCE_DIRS: Record<string, string[]> = {
  core: ['src'],
  app: ['src'],
  mobile: ['app', 'src'],
  relay: ['src'],
  bridge: ['src'],
  extension: ['src'],
};

describe('every TypeScript file', () => {
  it('names a source directory for each workspace, and no workspace has an unnamed one', () => {
    expect(Object.keys(SOURCE_DIRS).sort()).toEqual([...WORKSPACES].sort());
    // A directory in the list that is gone is an excuse outliving its subject (§6.41);
    // a directory of sources not in the list is the hole this whole file is about.
    const wrong: string[] = [];
    for (const [workspace, dirs] of Object.entries(SOURCE_DIRS)) {
      for (const dir of dirs) {
        if (!existsSync(resolve(ROOT, workspace, dir))) wrong.push(`${workspace}/${dir} is gone`);
      }
      for (const entry of readdirSync(resolve(ROOT, workspace), { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (['node_modules', 'dist', '.expo', 'android', 'ios', 'assets', 'public'].includes(entry.name)) continue;
        if (dirs.includes(entry.name)) continue;
        if (sourcesUnder(resolve(ROOT, workspace, entry.name)).length > 0) {
          wrong.push(`${workspace}/${entry.name} holds TypeScript and is checked by nothing`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('is in the program of a config that a script runs', () => {
    const unchecked: string[] = [];
    for (const workspace of WORKSPACES) {
      const configs = configsRunBy(workspace).flatMap((c) => withReferences(c));
      expect(configs.length, `${workspace}: no script runs tsc at all`).toBeGreaterThan(0);

      const checked = new Set(configs.flatMap((c) => programOf(c).files));
      const onDisk = (SOURCE_DIRS[workspace] ?? []).flatMap((d) =>
        sourcesUnder(resolve(ROOT, workspace, d)),
      );
      expect(onDisk.length, `${workspace}: found no sources, so this proved nothing`)
        .toBeGreaterThan(0);

      for (const file of onDisk) {
        if (!checked.has(file)) unchecked.push(relative(ROOT, file));
      }
    }
    // Read a failure as: this file compiles in the bundler and is checked by no
    // typechecker, so its types are decoration.
    expect(unchecked).toEqual([]);
  }, 60_000);

  it('is checked with the unused-code flags on, in every workspace', () => {
    /*
     * `tsconfig.test.json` set `noUnusedLocals: false` — the second half of the same
     * defect, and the more tempting half, because turning it off is how a config stops
     * failing without anyone having to delete it. The resolved options are read here
     * rather than the file's own text: an inherited `false` from a base config reads
     * identically at the call site and is invisible in a diff of this repo.
     */
    const lax: string[] = [];
    for (const workspace of WORKSPACES) {
      for (const config of configsRunBy(workspace).flatMap((c) => withReferences(c))) {
        const { files, options } = programOf(config);
        if (files.length === 0) continue; // a solution file; its leaves are checked above
        for (const flag of ['noUnusedLocals', 'noUnusedParameters'] as const) {
          if (options[flag] !== true) lax.push(`${relative(ROOT, config)}: ${flag} is not on`);
        }
      }
    }
    expect(lax).toEqual([]);
  }, 60_000);
});
