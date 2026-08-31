import { describe, expect, it } from 'vitest';
import {
  QUERY_PARAM,
  UP_NEXT_VIEWS,
  VIEW_PARAM,
  queryFrom,
  viewFrom,
  type UpNextView,
} from './segments.ts';

/**
 * The two readers in `segments.ts`, which had none.
 *
 * `segments.ts` is the file both platforms import so that neither writes its own version of
 * a screen's own state, and until this landed nothing anywhere asserted what either reader
 * *does*. Its contract is not obvious and it is load-bearing in both directions: a stale or
 * mistyped link has to arrive somewhere sensible, and the two platforms have to agree about
 * which addresses mean the same screen. Both of those are one-line functions and neither had
 * a case.
 */
describe('the view an address asks for', () => {
  it('reads the two views, and reads anything else as the front page', () => {
    expect(viewFrom('coming')).toBe('coming');
    expect(viewFrom('now')).toBe('now');
    /*
     * The file's own rule, quoted: "a bad value is not an error state — `?on=banana` is a
     * mistyped or stale link, and the honest answer to one is the screen's front page rather
     * than a message about a parameter". `NotFound` is for an address that is not a screen;
     * this is a screen.
     */
    for (const nonsense of ['banana', 'Coming', '', null, undefined]) {
      expect(viewFrom(nonsense), JSON.stringify(nonsense)).toBe('now');
    }
  });

  it('defaults to the half the app is required to open on', () => {
    // `TAB_BAR`'s reason, restated here because it is the default rather than a preference:
    // the loudest finding in the research is that the app opens on the episodes you can
    // mark, and a screen that opens on next month's schedule is not that.
    expect(viewFrom(undefined)).toBe(UP_NEXT_VIEWS[0].key satisfies UpNextView);
    expect(UP_NEXT_VIEWS[0].key).toBe('now');
  });
});

describe('the search an address asks for', () => {
  it('reads a query, and reads a missing one as the same screen as an empty one', () => {
    expect(queryFrom('long')).toBe('long');
    /*
     * The property the two platforms have to agree on. The web drops `q` when the field is
     * cleared and the phone writes it empty, so `/discover` and `/discover?q=` are two
     * spellings that exist in the wild — and both have to mean *the shelf*. If these two
     * lines ever disagreed, a link written on one platform would open a different screen on
     * the other, which is the drift this whole file exists to prevent.
     */
    expect(queryFrom(null)).toBe('');
    expect(queryFrom(undefined)).toBe('');
    expect(queryFrom('')).toBe('');
  });

  it('takes the first of a repeated key, the way expo-router hands it over', () => {
    // `?q=long&q=dark` is a hand-written or double-appended address rather than a state the
    // app can produce. expo-router gives an array for it and react-router gives the first;
    // one answer for both, and it is the first, for `viewFrom`'s reason about stale links.
    expect(queryFrom(['long', 'dark'])).toBe('long');
    expect(queryFrom([])).toBe('');
  });

  it('leaves the text exactly as it was typed', () => {
    /*
     * Trimming belongs to the screen deciding whether to search — `Discover` asks
     * `query.trim().length > 0` — and not to the reader. A query is somebody's text: a
     * trailing space is what they typed and the next keystroke may make it a word.
     */
    expect(queryFrom('  the long ')).toBe('  the long ');
    expect(queryFrom(' ')).toBe(' ');
  });

  it('names the two parameters once, so no screen spells its own', () => {
    // Both are conventions rather than choices, and both are here so that a screen cannot
    // hold a private copy of the string. `q` is what an address has called a search since
    // search engines had one.
    expect(QUERY_PARAM).toBe('q');
    expect(VIEW_PARAM).toBe('on');
  });
});
