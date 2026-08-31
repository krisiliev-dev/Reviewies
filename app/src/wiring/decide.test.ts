import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { stripComments } from '@reviewies/core/test/source';
import { PAIRS, ROOT } from './pairs';

/**
 * Where the decision is offered, and where it can be informed.
 *
 * ## What no guard here could see
 *
 * `offers.test.ts` asks whether the two platforms offer the same places and the same
 * writes, and it is the closest thing this repository had to a check on either of the two
 * holes below. It could not see either of them, and the reason is structural rather than an
 * oversight: **it is a parity guard, and both platforms were missing the same thing.** A
 * comparison between two sides says nothing when the sides agree, and this product's two
 * sides are built to agree. So the rules here are *absolute* — each is a claim about the
 * product rather than about the difference between its renderers.
 *
 * ## The two holes
 *
 * 1. **The title page could not track the show it was describing.** `Track`, `addToLibrary`
 *    and `watchlist` appeared in neither `app/src/screens/TitleDetail.tsx` nor
 *    `mobile/app/title/[id].tsx`. You could read the synopsis, the seasons, where to watch
 *    it and what it warns you about, and then had to go *back* to the list you came from to
 *    act on any of it. `design/cost.mjs` priced the detour — the whole of it is in the
 *    `findAndTrackViaTitle` task — at **+2 presses and +3.16s on the phone** and **+3
 *    presses, +4 retyped characters and +8.53s on the web**, against tracking from the
 *    search row, with one further web press (the browser's own Back) counted and left
 *    unpriced because it is not on the page. Re-walked with the control in place: **4
 *    presses and 7.40s** on the phone and **4 presses and 12.48s** on the web, so what is
 *    left of the detour is the press that opens the page and the deliberation the page is
 *    for.
 *
 * 2. **The shelf was a dead end.** Before `docs/design/architecture.md`'s rework a Discover
 *    row carried `open={{ name: 'Open …', to: '/title/…' }}` — see
 *    `e09ac85^:app/src/screens/Discover.tsx:143`. The box that replaced it has one press,
 *    which turns it over, and a back offering Track, Watchlist and Done. `core/src/ui/box.ts`
 *    argues that case and the argument is about **twenty boxes each carrying two verbs**; it
 *    is not an argument that the page should become unreachable, and none of that document's
 *    eight refusals is. The search half of the same screen kept its route the whole time.
 *
 * ## The rules, and why they are these rules
 *
 * A tracking decision has a place where it is *offered* and a place where it is *informed*,
 * and the product had let those two drift apart in both directions at once. So:
 *
 * - every control that offers to track a title is wired to something that tracks — the
 *   chain from the drawn control to the writer, read rather than assumed;
 * - the page that tells you what a title is offers the decision it is there to inform;
 * - and every surface that offers the decision offers that page, or is it.
 *
 * They are stated over *every* `.tsx` in both apps rather than over a list of the four
 * surfaces that have the control today, so a fifth is held to them the day it is written.
 */
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

/**
 * The announced name of a Track control, which is the one spelling it has.
 *
 * `COPY.controls.trackTitle` is what every Track button in the product passes as its
 * `name` — Discover's search row, the shelf's box, the watchlist row — because §6.98 gave
 * the words one owner and `copy.test.ts` keeps them there. That makes it a reliable handle
 * on "a control that offers to track this title", which a search for `addToLibrary` is not:
 * a writer can be imported and called from somewhere nothing presses.
 */
const TRACK_NAME = 'COPY.controls.trackTitle';

/** The writers that put a title in your library. `startWatching` is `addToLibrary` plus a removal. */
const TRACKS = /\b(?:addToLibrary|startWatching)\s*\(/;

/** A destination whose first segment is the title page, in every spelling either platform uses. */
const OPENS_TITLE = /\b(?:to|href)\s*[=:]\s*\{?\s*[`'"]\/title\//;

/** The two files that *are* the title page, from the one list that says which they are. */
const TITLE_PAGE = [
  `app/src/screens/${PAIRS['/title'].web}`,
  ...PAIRS['/title'].phone.map((f) => `mobile/app/${f}`),
];

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist', '.expo'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, out);
    else if (entry.name.endsWith('.tsx') && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

/** Both apps, every screen and every component. Sorted, so a failure list is stable. */
const FILES = ['app/src', 'mobile/app', 'mobile/src'].flatMap((d) => sources(d)).sort();

/** The line a character offset falls on, 1-based — `stripComments` keeps the line structure. */
const lineAt = (source: string, index: number) => source.slice(0, index).split('\n').length;

interface Offer {
  file: string;
  /** Where the control's name is written, so a failure points at the control. */
  at: string;
  source: string;
  index: number;
}

/** Every file drawing a control that offers to track a title, with the line it is on. */
function trackOffers(): Offer[] {
  const found: Offer[] = [];
  for (const file of FILES) {
    const source = stripComments(read(file));
    const index = source.indexOf(TRACK_NAME);
    if (index === -1) continue;
    found.push({ file, at: `${file}:${lineAt(source, index)}`, source, index });
  }
  return found;
}

/**
 * The JSX element a character offset sits inside, from its `<` to the `>` that closes it.
 *
 * Not a parser, for `injection.test.ts`'s reason: the shape being read is
 * `<Button … name={COPY.controls.trackTitle(x)} onPress={…} />`, all of it between one `<`
 * and the matching `>`, and brace-counting is enough to tell where that ends. Braces inside
 * strings would break it and there are none in a `Button`'s props.
 */
function elementAround(source: string, index: number): string {
  const open = source.lastIndexOf('<', index);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
    else if (source[i] === '>' && depth === 0) return source.slice(open, i + 1);
  }
  return source.slice(open);
}

/** The expression a prop is given, with its braces balanced. */
function propValue(element: string, prop: string): string | undefined {
  const start = element.indexOf(`${prop}={`);
  if (start === -1) return undefined;
  let depth = 0;
  for (let i = element.indexOf('{', start); i < element.length; i++) {
    if (element[i] === '{') depth++;
    else if (element[i] === '}' && --depth === 0) return element.slice(start + prop.length + 1, i);
  }
  return undefined;
}

/**
 * Whether a Track control's press reaches a writer that tracks.
 *
 * Two shapes, because the product writes both: the handler inline
 * (`onPress={() => startWatching(id, kind)}`, which the watchlist row uses) and a named
 * function above (`onPress={track}`, which the shelf and the search row use). For the
 * second the function's own body is read — its declaration through the first line that
 * closes a block at column 0, which is where every function in these files ends.
 */
function pressReachesAWriter(offer: Offer): boolean {
  const handler = propValue(elementAround(offer.source, offer.index), 'onPress');
  if (handler === undefined) return false;
  if (TRACKS.test(handler)) return true;
  for (const name of handler.matchAll(/\b([a-z]\w*)\b/g)) {
    const declared = new RegExp(`\\b(?:function|const)\\s+${name[1]}\\b`).exec(offer.source);
    if (!declared) continue;
    const ends = offer.source.indexOf('\n  }', declared.index);
    const body = offer.source.slice(declared.index, ends === -1 ? undefined : ends);
    if (TRACKS.test(body)) return true;
  }
  return false;
}

describe('the tracking decision, and the page that informs it', () => {
  it('reads both apps rather than an empty list', () => {
    // §6.121: every clause below passes against a scan that found no files at all.
    expect(FILES.length, 'nothing was scanned').toBeGreaterThan(40);
    for (const file of TITLE_PAGE) expect(read(file).length, file).toBeGreaterThan(1000);
  });

  it('wires every Track control to something that tracks', () => {
    /*
     * The chain, read: the control announced as `Track {name}`, the `onPress` on it, and a
     * call to `addToLibrary` or `startWatching` at the end of it.
     *
     * This clause exists because of what the clause below it cannot see on its own. A file
     * that imports `addToLibrary` and calls it from a function nothing presses satisfies
     * "the title page tracks" while the page still cannot track — which was the first plant
     * against this guard and it passed. Reading the press is what closes that.
     */
    const unwired = trackOffers()
      .filter((offer) => !pressReachesAWriter(offer))
      .map((offer) => `${offer.at} — its Track control presses nothing that tracks`);
    expect(unwired, 'a Track control that does not track').toEqual([]);
  });

  it('offers the decision on the page a person opens to make it', () => {
    /*
     * The page carrying the synopsis, the seasons, where to watch it and what it warns you
     * about is the page somebody is on when they decide. `design/cost.mjs` measured what
     * its not carrying the control cost: on the web, going back also loses the query, so
     * the route through the page is six presses and eight typed characters against three
     * and four.
     */
    const offering = new Set(trackOffers().map((offer) => offer.file));
    const silent = TITLE_PAGE.filter((file) => !offering.has(file)).map(
      (file) => `${file} — describes a title and offers no way to track it`,
    );
    expect(silent, 'the title page cannot track the title it is about').toEqual([]);
  });

  it('offers the page from every surface that offers the decision', () => {
    /*
     * A shelf you can act on and cannot read from is the §6.169 defect inverted: the box's
     * back carries the synopsis and the two verbs, and everything else the product knows
     * about that title — where to watch it, its warnings, its seasons, its cast — is behind
     * a route the rework dropped without saying so.
     *
     * "…or is it" rather than an exemption keyed by filename: the title page is the
     * destination, and a page linking to itself is not the thing being asked for. `PAIRS`
     * says which files those are, so this cannot drift away from the pair everything else
     * in `wiring/` compares.
     */
    const deadEnds = trackOffers()
      .filter((offer) => !TITLE_PAGE.includes(offer.file) && !OPENS_TITLE.test(offer.source))
      .map((offer) => `${offer.at} — offers Track and no route to /title`);
    expect(deadEnds, 'a surface that can act on a title but cannot open it').toEqual([]);
  });

  it('holds the rules over more than one surface each', () => {
    /*
     * The floor, at the exact count, so that a clause passing because the set it reads has
     * quietly emptied is a failure rather than a green tick. Four pairs offer the decision
     * today — the search row, the shelf's box, the watchlist row and the title page — and
     * both platforms carry all four.
     */
    const offers = trackOffers().map((offer) => offer.file);
    expect(offers.length, offers.join('\n')).toBe(8);
    expect(offers.filter((f) => f.startsWith('app/')).length).toBe(4);
    expect(offers.filter((f) => f.startsWith('mobile/')).length).toBe(4);
  });
});
