import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * The packages a plain Node process has to be able to load.
 *
 * Node's ESM resolver does not guess extensions. `import { x } from './types'` is an
 * error, not a hint — and every bundler in this repository resolves it happily, so the
 * error only appears at the one moment nothing was doing: starting the process.
 *
 * That is why the bridge had never run. `bridge/src/index.ts` imported `./mpris`, and
 * `core/src/devices/roku.ts` imported `./types`, and `node src/index.ts` — the command in
 * the bridge's own README — died on the first import. Its 24 unit tests pass because
 * Vitest resolves what Node will not. §6.44.
 *
 * So both packages now spell their relative imports out, and this keeps them that way.
 * Package specifiers are exempt because the exports map resolves those: `@reviewies/core/
 * devices/roku` is mapped to a file and needs no extension — adding one produces
 * `roku.ts.ts`, which is its own kind of afternoon.
 */
const ROOT = resolve(import.meta.dirname, '../../..');

/** Everything a plain `node` invocation might have to walk. */
const MUST_RESOLVE = ['core/src', 'bridge/src', 'relay/src'];

/**
 * Source with its comments removed.
 *
 * A doc comment may quote an import — §6.47's explanation of the bug it fixes shows the
 * three lines of `main.tsx` that caused it — and a scanner that cannot tell code from
 * prose reports the quotation. Crude on purpose: block and line comments, nothing
 * cleverer, because the alternative is a parser for a check this small.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

describe('what a plain Node process can load', () => {
  const files = MUST_RESOLVE.flatMap((dir) => sources(resolve(ROOT, dir)));

  it('finds the files rather than passing on an empty list', () => {
    expect(files.length).toBeGreaterThan(80);
  });

  it('spells out every relative import', () => {
    const bare: string[] = [];
    for (const file of files) {
      const source = code(readFileSync(file, 'utf8'));
      for (const [, spec] of source.matchAll(/(?:from\s+|import\s*\(\s*)'(\.\.?\/[^']*)'/g)) {
        if (!/\.(ts|tsx|js|mjs|json|css)$/.test(spec)) bare.push(`${relative(ROOT, file)} → ${spec}`);
      }
    }
    expect(bare).toEqual([]);
  });

  it('reads specifiers rather than reporting nothing', () => {
    // Non-vacuity: the pattern above must actually be matching imports, or the assertion
    // is a list of nothing compared with an empty list.
    const found = files.flatMap((file) => [
      ...code(readFileSync(file, 'utf8')).matchAll(/(?:from\s+|import\s*\(\s*)'(\.\.?\/[^']*)'/g),
    ]);
    expect(found.length).toBeGreaterThan(200);
  });
});
