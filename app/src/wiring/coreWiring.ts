import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { blankLiterals } from '@reviewies/core/test/source';

/**
 * What the core offers, and who actually calls it.
 *
 * The core is a library with two consumers, and a library cannot tell you that one of
 * them forgot to use it. Sync is the case that proved the point: `syncOnce` had been in
 * `core/sync/engine` since the beginning, the phone's account screen advertised "an
 * account adds sync across devices", and nothing in `mobile/` had ever imported it. The
 * feature was not broken — it was never connected, which no test of either side can see
 * because each side is individually correct.
 *
 * Module-level comparison would not have caught it either: the phone imported
 * `sync/auth` quite happily, so the sync *area* looked covered. The gap was one symbol
 * deep. So this works at the symbol level, and reports two things:
 *
 *  - exports nothing reaches at all, which are either dead or a promise never wired up
 *  - exports one app calls and the other does not, which is where parity actually drifts
 *
 * Neither is a defect on its own — plenty of asymmetry is deliberate, and the phone has
 * no business importing the Dexie adapter. That is what the expectation lists in
 * `coreWiring.test.ts` are for: an unexplained entry fails, and explaining one costs a
 * sentence saying why it is right.
 */

export interface Tree {
  list(): string[];
  read(path: string): string;
}

/** The working tree, as it is on disk right now. */
export function fromDisk(root: string): Tree {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git' || entry === '.expo') {
        continue;
      }
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path, out);
      else out.push(relative(root, path));
    }
    return out;
  };
  return { list: () => walk(root), read: (path) => readFileSync(resolve(root, path), 'utf8') };
}

/**
 * A past commit, read straight out of git.
 *
 * This exists so the check can be pointed at the commit before sync was wired up and
 * asked to find the gap. A guard for a class of bug that has never been shown to catch
 * one of them is a guess; this one is run against the real thing on every test run.
 */
export function fromGitRef(root: string, ref: string): Tree {
  const git = (args: string[], input?: string) =>
    execFileSync('git', args, { cwd: root, input, maxBuffer: 256 * 1024 * 1024 });

  const paths = git(['ls-tree', '-r', '--name-only', ref])
    .toString('utf8')
    .split('\n')
    .filter(Boolean);

  /**
   * The whole tree in one subprocess, read on first use.
   *
   * This was a `git show` per file, and the cost stopped being only this check's own
   * problem. Two guards now scan history — this one and `paletteMembers` — so a tree of
   * 274 source files was 548 process spawns, and on a loaded machine the *other* suites
   * started failing: `reactionStream` and `assertions.test.ts` timed out at Vitest's
   * five seconds while these two held the CPU. A guard that makes an unrelated guard fail
   * is worse than a slow one, and the comment in `coreWiring.test.ts` about an explicit
   * budget was already the sound of this being paid for rather than fixed.
   *
   * `cat-file --batch` answers every path down one pipe: a `<oid> <type> <size>` line, the
   * bytes, a newline. Read as a Buffer and sliced by the declared size rather than split on
   * newlines, because a source file contains newlines and a size does not lie.
   */
  let contents: Map<string, string> | undefined;
  const load = () => {
    if (contents) return contents;
    contents = new Map();
    const out = git(['cat-file', '--batch'], paths.map((path) => `${ref}:${path}`).join('\n') + '\n');
    let at = 0;
    for (const path of paths) {
      const newline = out.indexOf(0x0a, at);
      if (newline === -1) break;
      const [, type, size] = out.subarray(at, newline).toString('utf8').split(' ');
      at = newline + 1;
      // `missing` and `ambiguous` come back without a body; a submodule is a commit, not a blob.
      if (type !== 'blob') continue;
      contents.set(path, out.subarray(at, at + Number(size)).toString('utf8'));
      at += Number(size) + 1;
    }
    return contents;
  };

  return {
    list: () => paths,
    read: (path) => {
      const found = load().get(path);
      if (found === undefined) throw new Error(`${ref}:${path} is not a blob in that tree`);
      return found;
    },
  };
}

export type Consumer =
  | 'app'
  | 'mobile'
  | 'bridge'
  | 'relay'
  | 'extension'
  | 'scripts'
  | 'supabase'
  | 'core';

/**
 * Everything that can call the core, not just the workspaces.
 *
 * The edge functions under `supabase/` are a consumer too — they reach into
 * `core/src/calendar/expoPush.ts` by relative path, because Deno does not read the npm
 * workspace. Leaving them out made the whole push-notification sender look like dead
 * code, which is the opposite of what this check is for.
 */
const CONSUMERS: Consumer[] = [
  'app',
  'mobile',
  'bridge',
  'relay',
  'extension',
  'scripts',
  'supabase',
  'core',
];

const isSource = (path: string) => /\.(ts|tsx|mjs|js)$/.test(path);
const isTest = (path: string) => /\.test\.tsx?$/.test(path) || path.includes('/src/test/');

/** `core/src/sync/engine.ts` -> `sync/engine` */
const moduleOf = (path: string) => path.replace(/^core\/src\//, '').replace(/\.ts$/, '');

function exportedNames(source: string): Set<string> {
  const names = new Set<string>();
  const declared = /^export\s+(?:async\s+)?(?:function|const|let|class|interface|type|enum)\s+([A-Za-z0-9_]+)/gm;
  for (const match of source.matchAll(declared)) names.add(match[1]);
  // `export { a, b as c }` — the exported name is what follows `as`, when there is one.
  for (const match of source.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of match[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  return names;
}

function importedNames(clause: string): string[] {
  return clause
    .split(',')
    .map((part) => part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim())
    .filter(Boolean);
}

export interface Reach {
  module: string;
  name: string;
  /** Which packages import it. `core` includes use inside its own module. */
  by: Consumer[];
}

export function scan(tree: Tree): Reach[] {
  const files = tree.list().filter(isSource);

  const exports = new Map<string, Set<string>>();
  const reExports: Array<[string, string]> = [];
  for (const path of files) {
    if (!path.startsWith('core/src/') || isTest(path) || !path.endsWith('.ts')) continue;
    const source = tree.read(path);
    const module = moduleOf(path);
    const names = exportedNames(source);
    if (names.size) exports.set(module, names);
    // `export * from './provider'` — importing the barrel is importing the module
    // behind it, and treating them as separate is how a check like this starts
    // reporting attribution strings the web displays perfectly well.
    const dir = path.replace(/\/[^/]+$/, '');
    for (const match of source.matchAll(/^export\s+\*\s+from\s+['"](\.[A-Za-z0-9/_.-]*)['"]/gm)) {
      reExports.push([module, moduleOf(join(dir, match[1]))]);
    }
  }

  const reached = new Map<string, Set<Consumer>>();
  const record = (module: string, name: string, by: Consumer) => {
    // Credit the module that declares the symbol, not the barrel it was read through.
    const source = reExports.find(([barrel, behind]) => barrel === module && exports.get(behind)?.has(name));
    const key = `${source ? source[1] : module}#${name}`;
    if (!reached.has(key)) reached.set(key, new Set());
    reached.get(key)!.add(by);
  };

  for (const path of files) {
    if (isTest(path)) continue;
    const owner = CONSUMERS.find((c) => path.startsWith(`${c}/`));
    if (!owner) continue;
    const source = tree.read(path);

    const bare = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]@reviewies\/core\/([A-Za-z0-9/_.-]+)['"]/g;
    for (const match of source.matchAll(bare)) {
      for (const name of importedNames(match[1])) record(match[2], name, owner);
    }

    // The same import written the long way round, which is how the Deno edge functions
    // have to write it.
    const byPath = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"][./]*core\/src\/([A-Za-z0-9/_.-]+?)(?:\.ts)?['"]/g;
    for (const match of source.matchAll(byPath)) {
      for (const name of importedNames(match[1])) record(match[2], name, owner);
    }

    if (owner !== 'core') continue;

    // The core's own relative imports, resolved against the importing file's directory,
    // so a symbol that exists only to be used one folder over is not reported as dead.
    const dir = path.replace(/\/[^/]+$/, '');
    const relativeImport = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"](\.[A-Za-z0-9/_.-]*)['"]/g;
    for (const match of source.matchAll(relativeImport)) {
      const target = moduleOf(join(dir, match[2]));
      for (const name of importedNames(match[1])) record(target, name, 'core');
    }
  }

  // A symbol used inside the module that declares it is not dead either; it is simply
  // not the entry point. Without this the report is mostly helper functions.
  //
  // Comments **and string literals** blanked first, which is the same lesson twice.
  // §6.75 wrote a sentence about `resetClock` into the file that declares it and the
  // export stopped being reported as unreached — the second "mention" was prose, and
  // `stripComments` was the answer. §6.167 hit the other half: `surface.ts` gained a
  // register whose *values* are sentences, one of them naming `SURFACE_OFF`, and a
  // string is not a comment — so a data table explaining a symbol marked it reached, and
  // a two-sprint-old LOPSIDED entry silently expired. A guard that counts the word rather
  // than the call cannot tell an explanation from a use, wherever the explanation is
  // written, and the failure is silent in the direction that matters: it marks dead code
  // alive. `blankLiterals` blanks both.
  for (const [module, names] of exports) {
    const source = blankLiterals(tree.read(`core/src/${module}.ts`));
    for (const name of names) {
      const mentions = source.match(new RegExp(`\\b${name}\\b`, 'g'))?.length ?? 0;
      if (mentions > 1) record(module, name, 'core');
    }
  }

  const rows: Reach[] = [];
  for (const [module, names] of [...exports].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const name of [...names].sort()) {
      rows.push({ module, name, by: [...(reached.get(`${module}#${name}`) ?? [])].sort() });
    }
  }
  return rows;
}

/** Exports nothing imports, anywhere — dead code, or a promise never connected. */
export function unreached(rows: Reach[]): string[] {
  return rows.filter((r) => r.by.length === 0).map((r) => `${r.module}#${r.name}`);
}

/**
 * Exports one app calls and the other does not.
 *
 * Anything the core calls itself is excluded, because then both apps get it whether
 * they name it or not. `ensureProfile` is the example: the phone calls it directly from
 * its account screen and the web does not, which looks like a gap and is not — the sync
 * driver calls it before every cycle, on both platforms. Reporting that would teach
 * whoever reads this list to skim it.
 */
export function lopsided(rows: Reach[]): string[] {
  return rows
    .filter((r) => !r.by.includes('core'))
    .filter((r) => r.by.includes('app') !== r.by.includes('mobile'))
    .map((r) => `${r.by.includes('app') ? 'app' : 'mobile'} only: ${r.module}#${r.name}`);
}
