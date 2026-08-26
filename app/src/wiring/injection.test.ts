import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Nothing in the core may read injected configuration while its module is being
 * evaluated.
 *
 * The core is told about its platform through `set*()` calls — config, database,
 * storage, file saver — and every one of them happens after the importing module's
 * imports have been evaluated, because that is what ES modules do. A module that reads
 * `getConfig()` at its top level therefore reads an empty object, whatever the app does
 * afterwards.
 *
 * `metadata/index.ts` did exactly that for the life of the product: `export const
 * provider = createProvider()` chose the fixture catalogue every time, so the web app
 * searched four shows no matter what `VITE_TMDB_TOKEN` held, and the import matcher
 * could not find a single real title. Nothing caught it, because every test that
 * searches searches for a fixture. §6.47.
 *
 * The rule is therefore mechanical rather than remembered: read config inside a
 * function, never in module scope. What that costs is a lazy getter; what it buys is
 * that the ordering of two imports stops being load-bearing.
 */
const ROOT = resolve(import.meta.dirname, '../../..');

/**
 * The injection points. Reading any of these at module scope is the bug.
 *
 * Two of the three names here — `getDatabase` and `getStorage` — never existed. The
 * database is reached through the `db` proxy and storage through `readPreference`, so
 * for its whole life this guard was watching one real accessor and two ghosts, while
 * reading as though it covered three. §6.59 found it by grepping the names, and the
 * check below now insists every one of them is a real core export.
 */
const INJECTED = ['getConfig', 'readPreference', 'writePreference'];

/** Every `export function name` / `export const name` in the core. */
function coreExports(): Set<string> {
  const found = new Set<string>();
  for (const file of sources(resolve(ROOT, 'core/src'))) {
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) found.add(m[1]);
    for (const m of source.matchAll(/export\s+const\s+(\w+)/g)) found.add(m[1]);
  }
  return found;
}

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'test') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, out);
    else if (/\.ts$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

/**
 * Lines that are not inside a function, a class or an arrow body.
 *
 * Depth by brace counting rather than a parser: this only has to tell "top level" from
 * "somewhere inside something", and a file that defeats brace counting has bigger
 * problems. Comments and strings are stripped first so a brace in prose does not shift
 * the count.
 */
function moduleScopeLines(source: string): string[] {
  const clean = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/`[^`]*`/g, '``')
    .replace(/'[^'\n]*'/g, "''")
    .replace(/"[^"\n]*"/g, '""');

  const top: string[] = [];
  let depth = 0;
  for (const line of clean.split('\n')) {
    if (depth === 0) top.push(line);
    for (const ch of line) {
      if (ch === '{' || ch === '(' || ch === '[') depth += 1;
      else if (ch === '}' || ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    }
  }
  return top;
}

describe('reading injected configuration', () => {
  const files = sources(resolve(ROOT, 'core/src'));

  it('finds the core rather than passing on an empty list', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('never happens while a core module is being evaluated', () => {
    const early: string[] = [];
    for (const file of files) {
      for (const line of moduleScopeLines(readFileSync(file, 'utf8'))) {
        // Declaring one is not calling one: `config.ts` defines `getConfig`, and a
        // function belongs at module scope. A `const` initialiser is not exempt —
        // that is the shape the bug had.
        if (/^\s*(export\s+)?(async\s+)?(function|class)\b/.test(line)) continue;
        for (const call of INJECTED) {
          if (line.includes(`${call}(`)) early.push(`${relative(ROOT, file)}: ${line.trim()}`);
        }
      }
    }
    expect(early).toEqual([]);
  });

  it('never happens one call away either', () => {
    // The shape the bug actually had. `export const provider = createProvider()` names
    // no injected getter itself; `createProvider` reads one, and running it at module
    // scope is what made the choice against an empty config.
    //
    // One hop, deliberately. A call graph would be a compiler, and one hop is what the
    // hazard looks like in practice: a factory beside the constant it initialises.
    const early: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const bodies = new Map<string, string>();
      for (const m of source.matchAll(
        /(?:export\s+)?(?:async\s+)?function\s+(\w+)[\s\S]*?\n\}/g,
      )) {
        bodies.set(m[1], m[0]);
      }
      for (const line of moduleScopeLines(source)) {
        if (/^\s*(export\s+)?(async\s+)?(function|class)\b/.test(line)) continue;
        for (const [name, body] of bodies) {
          if (!new RegExp(`[=,(\\s]${name}\\(`).test(line)) continue;
          if (INJECTED.some((call) => body.includes(`${call}(`))) {
            early.push(`${relative(ROOT, file)}: ${line.trim()} → ${name}() reads config`);
          }
        }
      }
    }
    expect(early).toEqual([]);
  });

  it('watches accessors that exist', () => {
    // A guard naming a symbol nothing exports is a guard that covers less than it reads
    // — which is what this one did for its whole life, with two of its three names
    // pointing at nothing. §6.59.
    const exported = coreExports();
    expect(INJECTED.filter((name) => !exported.has(name))).toEqual([]);
    expect(exported.size).toBeGreaterThan(50);
  });

  it('can tell module scope from a function body', () => {
    // Non-vacuity, and a check on the brace counting itself: the first must be reported
    // and the second must not.
    expect(moduleScopeLines('const a = getConfig();').join('')).toContain('getConfig()');
    expect(moduleScopeLines('function f() {\n  const a = getConfig();\n}').join('')).not.toContain(
      'getConfig()',
    );
  });
});
