/**
 * Generate the searchable emoji index from emojibase.
 *
 * The brief asked that "any emojis can be used by simply searching in the search bar".
 * What shipped searched thirty-two, with a comment admitting a real index was "a later
 * refinement" — so typing "taco" found nothing, in the feature the whole product is
 * built around.
 *
 * Generated and committed rather than resolved at runtime, so neither app carries a
 * dependency on the dataset and neither has to parse 1,949 objects at startup. The
 * format is one line per emoji, `emoji|label|tag tag tag`, which is roughly a third the
 * size of the equivalent JSON and compresses better still. It is parsed once, lazily, on
 * the first search — nobody who never opens the search bar pays for it.
 *
 *   node scripts/build-emoji-index.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(
  readFileSync(join(root, 'node_modules/emojibase-data/en/compact.json'), 'utf8'),
);
const shortcodes = JSON.parse(
  readFileSync(join(root, 'node_modules/emojibase-data/en/shortcodes/emojibase.json'), 'utf8'),
);

const lines = [];
for (const entry of data) {
  // Skip the ones nobody searches for and everybody scrolls past: component pieces
  // (skin tones, hair) are not reactions, they are modifiers.
  if (entry.group === 2) continue;

  const codes = shortcodes[entry.hexcode];
  const words = new Set([
    ...(entry.tags ?? []),
    ...(Array.isArray(codes) ? codes : codes ? [codes] : []).map((c) => c.replace(/_/g, ' ')),
  ]);
  words.delete(entry.label);

  lines.push(`${entry.unicode}|${entry.label}|${[...words].join(' ')}`);
}

const out = `/**
 * Every emoji, with its name and search words. **Generated — do not edit.**
 *
 * Rebuild with \`node scripts/build-emoji-index.mjs\`.
 *
 * One line per emoji: \`emoji|label|words\`. A string rather than a structure because it
 * is about a third the size of the equivalent JSON, and because it is parsed lazily on
 * the first search — nobody who never opens the search bar pays for it.
 */
export const EMOJI_INDEX_RAW = ${JSON.stringify(lines.join('\n'))};
`;

const target = join(root, 'core/src/watching/emojiIndex.ts');
writeFileSync(target, out);
console.log(`${lines.length} emoji → ${target} (${(out.length / 1024).toFixed(0)} KB source)`);
