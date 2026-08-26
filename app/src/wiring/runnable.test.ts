import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

/**
 * The code no suite runs and no compiler reads.
 *
 * §6.40 found the app's build broken for sixteen commits because nothing ran it but a
 * person deciding to. Three directories are further out than that: `scripts/`,
 * `supabase/functions/` and — until this sprint — `extension/`, none of which were
 * workspaces, none of which had a typecheck, and none of which any test touched. A
 * syntax error in `deploy-web.mjs` surfaces when somebody deploys. A stale import in an
 * edge function surfaces when somebody pushes it to Supabase and the bundle fails there.
 *
 * The extension is now a workspace with its own `tsc --noEmit`. The other two cannot be
 * fully checked from here — the edge functions are Deno and there is no Deno in this
 * container (§7) — but the two failures that actually happen to them can be:
 *
 *  - it does not parse
 *  - it imports something that is no longer there
 *
 * The second is the one worth having. The functions reach into `core/` by relative path,
 * on purpose, so the server and the client cannot disagree about what a fingerprint
 * means. That is a good decision with a cost: moving a file in core breaks a deployment
 * nobody will run for weeks, and nothing else in this repository would notice.
 */
const ROOT = resolve(import.meta.dirname, '../../..');

function filesUnder(dir: string, ext: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.temp') continue;
      const path = join(d, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(ext)) out.push(path);
    }
  };
  walk(dir);
  return out;
}

describe('the code nothing else runs', () => {
  const scripts = filesUnder(resolve(ROOT, 'scripts'), '.mjs');
  const functions = filesUnder(resolve(ROOT, 'supabase/functions'), '.ts');

  it('finds both sets rather than passing on an empty one', () => {
    expect(scripts.length).toBeGreaterThan(3);
    expect(functions.length).toBeGreaterThan(2);
  });

  it('every script parses', () => {
    // `node --check` reads the file as the module it is, without executing a line of it
    // — these deploy things and apply migrations, so running them is not an option.
    for (const script of scripts) {
      expect(() => execFileSync(process.execPath, ['--check', script], { stdio: 'pipe' }), script)
        .not.toThrow();
    }
  });

  it('every relative import a script makes still exists', () => {
    // Parsing is not enough, and this file said so from the start: the two failures it
    // names are "it does not parse" and "it imports something that is no longer there".
    // The second was only ever checked for the edge functions — a script could import a
    // file that had moved and `node --check` would pass it, which is §6.44's bug exactly.
    // §6.60 planted one and this suite said nothing.
    const broken: string[] = [];
    for (const script of scripts) {
      const source = readFileSync(script, 'utf8');
      for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
        const spec = match[1];
        const target = resolve(dirname(script), spec);
        const found = [target, `${target}.mjs`, `${target}.js`, join(target, 'index.mjs')].some(
          existsSync,
        );
        if (!found) broken.push(`${relative(ROOT, script)} → ${spec}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('every edge function parses', () => {
    // Parsed as TypeScript rather than typechecked: Deno's globals and its jsr:/npm:
    // specifiers are not something tsc can resolve, and pretending otherwise would be a
    // check that fails for the wrong reason. What this catches is a syntax error, which
    // is the failure that has actually happened to a function in this repository.
    const bad: string[] = [];
    for (const fn of functions) {
      const source = readFileSync(fn, 'utf8');
      const parsed = ts.createSourceFile(fn, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
      // `parseDiagnostics` is not on the public type, which is why it is reached for by
      // name here: it is the only thing that reports a syntax error without asking the
      // compiler to resolve a single import.
      const errors = (parsed as unknown as { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics;
      if (errors.length) bad.push(`${relative(ROOT, fn)}: ${errors[0].messageText}`);
    }
    expect(bad).toEqual([]);
  });

  it('every relative import an edge function makes still exists', () => {
    const broken: string[] = [];
    for (const fn of functions) {
      const source = readFileSync(fn, 'utf8');
      for (const [, spec] of source.matchAll(/from\s+'(\.[^']+)'/g)) {
        const target = resolve(dirname(fn), spec);
        // Written with the extension for Deno's sake; tolerate either spelling so this
        // does not become a check on the import style rather than on the file.
        const found = [target, `${target}.ts`, join(target, 'index.ts')].some(existsSync);
        if (!found) broken.push(`${relative(ROOT, fn)} → ${spec}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('would notice if one of them did not', () => {
    // Non-vacuity: the resolver above must actually be able to fail. A path that is not
    // there has to come back not-there, or the assertion is decoration.
    const missing = resolve(ROOT, 'core/src/fingerprint/notAFile');
    expect([missing, `${missing}.ts`, join(missing, 'index.ts')].some(existsSync)).toBe(false);
  });
});
