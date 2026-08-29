import { describe, expect, it, vi } from 'vitest';
import { describeMix, fetchListItems, type ListItem } from './lists.ts';

/**
 * One row of PostgREST, standing in for the server. §6.158.
 *
 * `getClient` builds from config and there is no setter, so the module is mocked rather
 * than injected — which is the same reason `refresh.ts` takes a `RefreshLookup`: a test
 * that reaches a real backend passes or fails on what somebody else's server did.
 */
let rows: unknown[] = [];
vi.mock('../sync/auth.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../sync/auth.ts')>();
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.order = () => chain;
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
  return { ...real, getClient: () => ({ from: () => chain }) };
});

const item = (kind: 'show' | 'film', titleId = Math.random().toString()): ListItem => ({
  titleId,
  kind,
  rank: 0,
});

describe('list mix description', () => {
  it('describes an empty list', () => {
    expect(describeMix([])).toBe('Empty');
  });

  it('describes a series-only list', () => {
    expect(describeMix([item('show'), item('show')])).toBe('2 series');
  });

  it('describes a film-only list', () => {
    expect(describeMix([item('film')])).toBe('1 film');
  });

  it('spells out a mixed list, since mixing is the point', () => {
    // A half-film list should say so rather than looking like a broken TV list.
    expect(describeMix([item('show'), item('film'), item('film')])).toBe('1 series · 2 films');
  });
});


describe('a list row whose title id is missing', () => {
  it('is dropped, not rendered as the word "undefined"', async () => {
    /*
     * §6.158, found by the first photograph ever taken of an opened list: two rows reading
     * **undefined**, in the title's own weight.
     *
     * `String(row.title_id)` on a missing column produces the *string* `'undefined'`, which
     * is truthy — so it survived `item.name ?? item.titleId` on both platforms. The fallback
     * was there, was correct, and could never fire. §6.104's rule is that a screen tells
     * "nothing" apart from "I could not look", and a coercion is how that gets broken
     * without anybody writing a wrong sentence.
     *
     * The row is dropped rather than shown with a placeholder: an item with no title is not
     * an item, and offering *Remove* against a row nothing can identify is worse than the
     * count being one short.
     */
    rows = [
      { title_id: 'tmdb:tv:1', kind: 'show', note: null, rank: 0 },
      { title_id: null, kind: 'show', note: null, rank: 1 },
      // The shape the signed-in harness actually served: the column the query asks for is
      // simply not there, which is what `target_id` instead of `title_id` looks like.
      { kind: 'film', note: null, rank: 2 },
    ];

    const { items } = await fetchListItems('list-1');
    expect(items.map((i) => i.titleId)).toEqual(['tmdb:tv:1']);
    expect(items.some((i) => i.titleId === 'undefined'), 'a coerced id reached a row').toBe(false);
  });
});
