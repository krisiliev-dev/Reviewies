import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * The commands this repository tells people to run.
 *
 * §6.44's bridge could not start, and the command that could not start it was printed in
 * its own README. Nothing checks a README, so a documented command can name a file that
 * moved, a script that was renamed, or a workspace that no longer exists, and the only
 * report is somebody's confusion months later. The same is true one level in: a
 * `package.json` script can name a file that is not there.
 *
 * This does not run anything — running them is a sprint, and §6.45 was that sprint. What
 * it checks is the cheap half that rots on its own: every path a command names exists,
 * and every `npm run` names a script some workspace actually has.
 */
const ROOT = resolve(import.meta.dirname, '../../..');

const WORKSPACES = ['.', 'core', 'app', 'mobile', 'relay', 'bridge', 'extension'];

function scriptsOf(workspace: string): Record<string, string> {
  const path = join(ROOT, workspace, 'package.json');
  if (!existsSync(path)) return {};
  return (JSON.parse(readFileSync(path, 'utf8')).scripts ?? {}) as Record<string, string>;
}

/**
 * Every fenced block in every README and doc, line by line, with the directory the block
 * has walked itself into.
 *
 * A block that says `cd app` and then `node smoke.mjs` means `app/smoke.mjs`, and reading
 * the second line alone would report a file that is plainly there. Tracked per block,
 * because a `cd` in one block says nothing about the next.
 */
function documentedLines(): Array<{ file: string; line: string; cwd: string }> {
  const out: Array<{ file: string; line: string; cwd: string }> = [];
  const docs = [
    'README.md',
    ...WORKSPACES.filter((w) => w !== '.').map((w) => `${w}/README.md`),
    'supabase/README.md',
    ...readdirSync(join(ROOT, 'docs'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => `docs/${f}`),
  ];
  for (const file of docs) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    let fenced = false;
    // Every block starts at the repository root, including a workspace's own README —
    // they say `cd bridge` as their first line precisely because that is where a reader
    // is standing.
    let cwd = '.';
    for (const raw of readFileSync(path, 'utf8').split('\n')) {
      if (raw.startsWith('```')) {
        fenced = !fenced;
        cwd = '.';
        continue;
      }
      if (!fenced) continue;
      const line = raw.trim();
      const moved = /\bcd\s+([\w./-]+)/.exec(line);
      if (moved) cwd = relative(ROOT, resolve(ROOT, cwd, moved[1])) || '.';
      out.push({ file, line, cwd });
    }
  }
  return out;
}

describe('the commands this repository documents', () => {
  const lines = documentedLines();

  it('finds the fenced blocks rather than passing on nothing', () => {
    expect(lines.length).toBeGreaterThan(40);
    expect(lines.some((l) => l.line.includes('npm run'))).toBe(true);
  });

  it('names a script that exists, wherever it says npm run', () => {
    const missing: string[] = [];
    for (const { file, line, cwd } of lines) {
      // `npm run <script>` and optionally `--workspace <name>`. Anything else on the line
      // — a comment, a chained command — is not this check's business.
      const m = /\bnpm run ([\w:-]+)(?:\s+--workspace[= ]([\w-]+))?/.exec(line);
      if (!m) continue;
      const [, script, workspace] = m;
      // `npm run` reads the package.json of the directory it is standing in, and only
      // that one. A block that has walked into a workspace therefore means that
      // workspace — not "somewhere in the repository", which is how `npm run typecheck`
      // came to be documented in two READMEs above a `cd` that was not there.
      const candidates = workspace ? [workspace] : [cwd];
      if (!candidates.some((w) => script in scriptsOf(w))) {
        missing.push(`${file}: npm run ${script}${workspace ? ` --workspace ${workspace}` : ''}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('names a file that exists, wherever it says node', () => {
    const missing: string[] = [];
    for (const { file, line, cwd } of lines) {
      // `node path/to/thing.mjs`, but not `node -e '…'` or a bare `node`.
      const m = /\bnode\s+([\w./-]+\.(?:mjs|js|ts))\b/.exec(line);
      if (!m) continue;
      const spec = m[1];
      if (!existsSync(resolve(ROOT, cwd, spec))) missing.push(`${file} (in ${cwd}): node ${spec}`);
    }
    expect(missing).toEqual([]);
  });

  it('names a file that exists, wherever a package script does', () => {
    const missing: string[] = [];
    for (const workspace of WORKSPACES) {
      for (const [name, body] of Object.entries(scriptsOf(workspace))) {
        for (const [, spec] of body.matchAll(/(?:^|\s)((?:\.\/)?[\w./-]+\.(?:mjs|js|ts))\b/g)) {
          if (!existsSync(join(ROOT, workspace, spec))) {
            missing.push(`${workspace}/package.json ${name}: ${spec}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('names a workspace that exists, wherever it says --workspace', () => {
    const missing: string[] = [];
    for (const { file, line } of lines) {
      for (const [, name] of line.matchAll(/--workspace[= ]([\w-]+)/g)) {
        if (!WORKSPACES.includes(name)) missing.push(`${file}: --workspace ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('is looking at real files', () => {
    // Non-vacuity for the two file checks: they must be resolving something.
    expect(existsSync(join(ROOT, 'scripts/whats-live.mjs'))).toBe(true);
    expect(relative(ROOT, join(ROOT, 'scripts'))).toBe('scripts');
  });
});
