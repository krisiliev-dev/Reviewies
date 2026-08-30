import { stripComments } from '@reviewies/core/test/source';
import type { Tree } from './coreWiring';

/**
 * Which colours in the token table anything actually paints with.
 *
 * `coreWiring` asks the same question one level up and cannot ask it here. It works at
 * **export** granularity, and `color` is exported and reached — so every member inside it is
 * reached as far as that scan is concerned, however long it has been dead. `dimInk`,
 * `dimInkSecondary` and `dimWorking` lived in that blind spot for six sprints with a name, a
 * meaning, a measured ratio in `contrast.test.ts` and no renderer anywhere; `linger.dimAfter`
 * was in it too and nobody ever said the word. `core/src/tokens.ts` has the reasoning for the
 * deletion; the record entry for it is not written yet, which is why nothing here cites a §.
 *
 * Colours rather than the whole table, and the line is argued rather than convenient. A
 * magnitude is allowed to arrive before its call sites: `docs/design/tokens.md` is explicit
 * that the space and radius guards land WITH their ~99 and ~84 site migrations or not at
 * all, so `space.s48` sitting unused is a migration that has not reached that sprint yet. A
 * colour is not a magnitude. It carries a **meaning** — "failure and destructive only",
 * "this is happening, or you did this" — and a meaning nothing reads is a claim about the
 * product that nothing keeps true. That is the whole failure mode of the five layers before
 * this one.
 *
 * ## Strings are kept, which is the opposite of what `coreWiring` does, on purpose
 *
 * That scan blanks string literals as well as comments, because §6.167 found a data table
 * whose *values* were sentences naming a symbol, and an explanation marked dead code alive.
 * The reverse is true of a colour. A colour is referred to by name-as-data on both
 * platforms and almost nowhere else: the web writes the kebab class `text-ink-secondary`
 * inside a `className` string because Tailwind's scanner reads source text, and the phone
 * writes `theme[SURFACE_OFF.colour]` where `SURFACE_OFF.colour` is the string
 * `'strokeSignal'`. Blank the strings and this scan goes blind to the majority of real
 * reads and starts reporting live colours as dead — a false negative in the direction that
 * matters, which is the one §6.167 was actually about.
 *
 * Comments are still stripped, for §6.75's reason: this file, `tokens.ts` and both toggle
 * renderers all discuss `dimInk` in prose, and a scan that counts the word rather than the
 * use cannot tell an explanation from a use.
 *
 * ## The other direction, and the one dependency
 *
 * `app/src/ui/colourNames.test.ts` is the converse of this and the two are worth reading
 * together: it asks whether every colour a *class* names is defined in the table, and this
 * asks whether every colour the *table* defines is named by anything. A name can be wrong in
 * both directions and until now only one of them failed the build.
 *
 * The names are read from the dark table alone, which is safe only because that file also
 * asserts `Object.keys(color.light)` equals `Object.keys(color.dark)`. Delete that clause and
 * a light-only colour becomes invisible here. Said out loud because it is the one plant this
 * scan does not survive on its own.
 */

/** Every role name in the dark table, read as text so a past commit can be scanned too. */
export function paletteNames(tokensSource: string): string[] {
  const table = tokensSource.match(/const dark = \{([\s\S]*?)\n\} as const;/);
  if (!table) throw new Error('Could not find the dark palette in core/src/tokens.ts');
  return [...stripComments(table[1]).matchAll(/^\s{2}([A-Za-z0-9]+):\s*'#[0-9A-Fa-f]{6}'/gm)].map(
    (m) => m[1],
  );
}

/** `groundRaised` -> `ground-raised`, the spelling the web writes in a class or a property. */
const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * Where a colour can be painted from.
 *
 * Deliberately a list of roots rather than "everything that is not `node_modules`". A build
 * output contains every custom property in the stylesheet by construction, so a scan that
 * wandered into `app/dist-real` or `mobile/dist-signedin` would report the whole palette as
 * live and never fail again — the silent kind of wrong.
 */
const ROOTS = [
  'app/src/',
  'mobile/app/',
  'mobile/src/',
  'core/src/',
  'extension/',
  'bridge/src/',
  'relay/src/',
  'design/',
  'scripts/',
];

const OWNER = 'core/src/tokens.ts';
/** Generated from the table, so they name every member whether or not anything paints it. */
const GENERATED = ['app/src/tokens.generated.css', 'scripts/tokens-to-css.mjs'];

const isSource = (path: string) => /\.(tsx?|mjs|js|css)$/.test(path);
const isTest = (path: string) => /\.test\.tsx?$/.test(path) || path.includes('/src/test/');

/**
 * Colours no product file paints with.
 *
 * A guard is not a call site, which is the distinction `coreWiring`'s UNREACHED table makes
 * at length about `elevation`: being read by exactly the test that holds it to its
 * specification "is not nothing, but it is not a call site". Every one of the three dim
 * roles was read by `contrast.test.ts` and by nothing else, and that is precisely how the
 * layer looked alive for six sprints.
 */
export function unpainted(tree: Tree): string[] {
  const names = paletteNames(tree.read(OWNER));

  const sources = tree
    .list()
    .filter(
      (path) =>
        isSource(path) &&
        !isTest(path) &&
        path !== OWNER &&
        !GENERATED.includes(path) &&
        !path.includes('/dist') &&
        ROOTS.some((root) => path.startsWith(root)),
    )
    .map((path) => stripComments(tree.read(path)));

  return names.filter((name) => {
    // The identifier, as `theme.inkSecondary` or the string `'inkSecondary'` in a table.
    const identifier = new RegExp(`\\b${name}\\b`);
    // The kebab spelling, as `text-ink-secondary` or `--color-ink-secondary`. The trailing
    // boundary excludes `-` so that `text-ink-secondary` is not counted as a read of `ink`.
    const written = new RegExp(`(^|[-\\s"'\`:(])${kebab(name)}($|[\\s"'\`\\])])`);
    return !sources.some((source) => identifier.test(source) || written.test(source));
  });
}
