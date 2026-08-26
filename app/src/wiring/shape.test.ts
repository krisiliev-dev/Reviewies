import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PAIRS, ROOT } from './pairs';

const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

/**
 * The shape of a screen: what it renders, in the order it renders it.
 *
 * The fifth axis, and the one a person notices first. §6.50 compared where a screen lets
 * you go, §6.51 its words, §6.52 the numbers it passes into the core, §6.55 the state it
 * opens in — and none of them could see that the phone's rating row had no caption a
 * sprint after the web's got one, or that the two platforms put the same three blocks in
 * a different order. A section heading is not a route, a word, a number or a default.
 *
 * What is compared is the sequence of *named things*: components the screen renders and
 * sentences it takes from `COPY`. That is a deliberately coarse reading of a screen —
 * coarse enough to survive two platforms written in different frameworks, and specific
 * enough that a missing block or a swapped pair shows up.
 *
 * What it cannot see, stated rather than discovered later:
 *
 *  - **Source order is not visual order.** Flex ordering, absolute positioning and a
 *    portal all move things without moving their JSX. This reads the file, so a screen
 *    could reorder itself visually and pass.
 *  - **A heading inside a shared component is invisible here.** It belongs to that
 *    component's file, not to the screen's.
 *  - **Names are the comparison.** Two platforms rendering the same thing under different
 *    local names read as a difference; the normalisation below handles the one case that
 *    happens in practice — a list's row component — and the rest is exemptions.
 */

/** Differences that belong, one line each. */
const EXEMPT: Record<string, string> = {
  '/': 'the phone renders MatchImports in two states (first run and the caught-up screen) and the web in one; both offer it, and the phone’s second copy is the one §6.49 added where the gap was felt',
  '/watching':
    'the web splits its clock into StartPanel, DriftHint and SyncBar; the phone renders the same controls inline through one Control component, and adds RemoteDrawer because on a phone the remote is a screen rather than an overlay',
  '/settings':
    'the phone splits Settings across two pushed screens held together by a Section wrapper, which the web has no equivalent of — the pairing already compares them as a unit (see pairs.ts)',
  '/people':
    'the web has a ProfileEditor component; the phone renders the same editor inline. Same fields, same order, no wrapper worth extracting for one caller',
  '/stats':
    'the phone wraps its four figures in Chip and Figure and the web in Tile and Summary — presentational wrappers around identical content, and §6.62 checked the content itself against the screenshots',
  '/calendar':
    'the web extracts a Row component for an upcoming episode and the phone writes the same row inline; both now carry the poster, the name, the episode and the kind — §6.63 is the sprint that gave the phone the poster',
  '/lists':
    'the phone extracts a ListItem component where the web writes the row inline, and orders its two failure lines the other way round; both render both',
};

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * Layout primitives, which are the grammar rather than the content. A screen made of
 * Views and Texts is every screen.
 */
const LAYOUT = new Set([
  'View', 'Text', 'ScrollView', 'SafeAreaView', 'Pressable', 'TextInput', 'ActivityIndicator',
  'Image', 'Animated', 'Fragment', 'Stack', 'Link', 'React', 'Suspense', 'Switch', 'FlatList',
  'KeyboardAvoidingView', 'Modal', 'TouchableOpacity', 'StyleSheet',
]);

/**
 * The named things a screen renders, in order.
 *
 * A JSX element is `<Tag` where what precedes it is punctuation or a line start; a
 * generic is `<Tag` after an identifier, as in `useState<Window>`. Telling them apart
 * this way is what keeps type parameters out of a list of what the screen shows — the
 * first draft of this had `NotifyPreference` and `StatsSummary` in it, which are types.
 */
export function shapeOf(source: string): string[] {
  const src = strip(source);
  const found: string[] = [];
  const pattern = /<([A-Z][A-Za-z0-9]*)[\s/>]|\bCOPY\.([A-Za-z]+)\.([A-Za-z]+)/g;

  for (const match of src.matchAll(pattern)) {
    if (match[2]) {
      found.push(`COPY.${match[2]}.${match[3]}`);
      continue;
    }
    const before = src.slice(0, match.index).trimEnd().at(-1) ?? '\n';
    if (/[A-Za-z0-9_$]/.test(before)) continue; // a generic, not an element
    const tag = match[1];
    if (LAYOUT.has(tag)) continue;
    // A list's row, whatever this screen calls it.
    found.push(/Row$/.test(tag) ? 'Row' : tag);
  }

  // A list renders its row many times over; the shape is that it has rows.
  return found.filter((name, i) => name !== found[i - 1]);
}

describe('the shape of each screen', () => {
  const differing = () =>
    Object.entries(PAIRS).filter(([, { web, phone }]) => {
      const left = shapeOf(read(`app/src/screens/${web}`));
      const right = phone.flatMap((file) => shapeOf(read(`mobile/app/${file}`)));
      return JSON.stringify(left) !== JSON.stringify(right);
    });

  it('renders the same things in the same order on both platforms', () => {
    const unexplained = differing()
      .map(([route]) => route)
      .filter((route) => !EXEMPT[route]);
    // Read the failure as: these two screens are not the same screen. Either one is
    // missing a block the other has, or they put the same blocks in a different order —
    // and one of those two orders is better. If the difference belongs, say why above.
    expect(unexplained).toEqual([]);
  });

  it('keeps no exemption for a pair that now agrees', () => {
    const live = new Set(differing().map(([route]) => route));
    expect(Object.keys(EXEMPT).filter((route) => !live.has(route))).toEqual([]);
  });

  it('says why, for each', () => {
    for (const [route, why] of Object.entries(EXEMPT)) {
      expect(why.length, route).toBeGreaterThan(40);
    }
  });

  it('reads a shape rather than an empty list', () => {
    // Non-vacuity, and a check on the discriminator: `Window` and `StatsSummary` are type
    // parameters on these screens, not things they render.
    const title = shapeOf(read('app/src/screens/TitleDetail.tsx'));
    expect(title).toContain('StarRating');
    expect(title).toContain('COPY.title.yourRating');
    expect(title.indexOf('COPY.title.yourRating')).toBeLessThan(title.indexOf('StarRating'));

    const stats = shapeOf(read('mobile/app/stats.tsx'));
    expect(stats).not.toContain('Window');
    expect(stats).not.toContain('StatsSummary');

    const total = Object.values(PAIRS).reduce(
      (sum, pair) => sum + shapeOf(read(`app/src/screens/${pair.web}`)).length,
      0,
    );
    expect(total).toBeGreaterThan(30);
  });
});
