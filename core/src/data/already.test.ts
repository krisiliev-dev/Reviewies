import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { db } from './db.ts';
import { alreadyHave, shelfFor } from './already.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

beforeEach(async () => {
  await Promise.all([db.library.clear(), db.watchlist.clear(), db.titles.clear()]);
});

const title = (id: string, name: string) => db.titles.add({ id, kind: 'show', name, fetchedAt: 1 });

describe('what you already have', () => {
  it('says nothing about a search result you have never touched', async () => {
    await title('tmdb:tv:1', 'The Long Dark');
    await db.library.add({ titleId: 'tmdb:tv:1', kind: 'show', status: 'watching', addedAt: 1 });
    expect(shelfFor({ id: 'tmdb:tv:9', name: 'Something Else' }, await alreadyHave())).toBe(
      undefined,
    );
  });

  it('knows a show you already track', async () => {
    await title('tmdb:tv:1', 'The Long Dark');
    await db.library.add({ titleId: 'tmdb:tv:1', kind: 'show', status: 'watching', addedAt: 1 });
    expect(shelfFor({ id: 'tmdb:tv:1', name: 'The Long Dark' }, await alreadyHave())).toBe(
      'library',
    );
  });

  it('knows a show already on the watchlist', async () => {
    await title('tmdb:tv:2', 'Kitchen Nightshift');
    await db.watchlist.add({ titleId: 'tmdb:tv:2', kind: 'show', addedAt: 1 });
    expect(shelfFor({ id: 'tmdb:tv:2', name: 'Kitchen Nightshift' }, await alreadyHave())).toBe(
      'watchlist',
    );
  });

  /*
   * The case an ID cannot answer, and the reason this exists at all.
   *
   * A TV Time export carries names and no provider IDs, so an import lands as
   * `local:tv:tvtime-100`. Matching rewrites that — unless the match was ambiguous, in
   * which case it becomes an ask, and an unanswered ask keeps its local ID indefinitely.
   * Search would then offer to **Track** a show already in the library, and *that* press
   * writes a second row under the provider's ID for a show already held under a local one.
   */
  it('knows an imported show that has not been matched yet, by its name', async () => {
    await title('local:tv:tvtime-100', 'Hollow Crown Saga');
    await db.library.add({
      titleId: 'local:tv:tvtime-100',
      kind: 'show',
      status: 'watching',
      addedAt: 1,
    });
    const have = await alreadyHave();
    // The ID half genuinely cannot help: the provider's copy has a different one.
    expect(have.ids.library.has('tmdb:tv:3')).toBe(false);
    expect(shelfFor({ id: 'tmdb:tv:3', name: 'Hollow Crown Saga' }, have)).toBe('library');
  });

  it('matches that name whatever its case and spacing', async () => {
    await title('local:tv:tvtime-101', '  The Long Dark ');
    await db.watchlist.add({ titleId: 'local:tv:tvtime-101', kind: 'show', addedAt: 1 });
    expect(shelfFor({ id: 'tmdb:tv:1', name: 'THE LONG DARK' }, await alreadyHave())).toBe(
      'watchlist',
    );
  });

  it('does not consult the name once a row has a real ID', async () => {
    /*
     * The narrowness, and what stops this becoming a name-matcher. Two things share a name
     * often enough — a remake, a translation, a film and the series of it — and deciding
     * they are the same is what the ask-flow exists to refuse to do to somebody's history.
     * A matched row has an ID that answers properly, so its name is never consulted.
     */
    await title('tmdb:tv:5', 'Shared Name');
    await db.library.add({ titleId: 'tmdb:tv:5', kind: 'show', status: 'watching', addedAt: 1 });
    const have = await alreadyHave();
    expect(have.names.library.size).toBe(0);
    expect(shelfFor({ id: 'tmdb:movie:6', name: 'Shared Name' }, have)).toBe(undefined);
  });

  it('calls the library the answer when a thing is on both shelves', async () => {
    // "Tracking" is the stronger statement; a watchlist row for something you are already
    // watching is the leftover rather than the fact.
    await title('tmdb:tv:1', 'The Long Dark');
    await db.library.add({ titleId: 'tmdb:tv:1', kind: 'show', status: 'watching', addedAt: 1 });
    await db.watchlist.add({ titleId: 'tmdb:tv:1', kind: 'show', addedAt: 1 });
    expect(shelfFor({ id: 'tmdb:tv:1', name: 'The Long Dark' }, await alreadyHave())).toBe(
      'library',
    );
  });

  it('is what both search screens actually read', () => {
    /*
     * A source clause, because the defect was never in this module — it is that the
     * screens did not ask. Each `ResultRow` had a bare `useState` and nothing else, so the
     * label said **Track** for everything, for ever. Checking the module in isolation
     * would prove the part and miss the product, which is the plant §6.101 learned from.
     */
    for (const path of ['app/src/screens/Search.tsx', 'mobile/app/(tabs)/search.tsx']) {
      const source = read(path);
      expect(source, `${path} never asks what you already have`).toContain('alreadyHave()');
      expect(source, `${path} never resolves a result against it`).toContain('shelfFor(result');
      // And the label is driven by that rather than by this session's button presses.
      expect(source, `${path} still labels from local state alone`).toContain(
        "shelf === 'library' ? 'Tracking' : 'Track'",
      );
      expect(source, `${path} still labels the watchlist from local state alone`).toContain(
        "shelf === 'watchlist' ? 'On watchlist' : 'Watchlist'",
      );

      /*
       * And once for the screen, not once per row — which is not a tidiness rule.
       *
       * The first version of this put the hook inside `ResultRow`: a full scan of the
       * titles table per result, repeated on every render. Dexie absorbed it. The phone's
       * SQLite adapter is one worker and did not — tracking a show wrote its library row
       * and never got the thread back to cache the episodes, so Up Next said "all caught
       * up" about a show with eighteen unwatched ones, and the phone smoke stopped at
       * check 31 of 186. §6.80 recorded that this store is far slower under load; this is
       * what that costs when a query is put where it repeats.
       */
      const row = source.indexOf('function ResultRow');
      expect(row, `${path}: no ResultRow to measure against`).toBeGreaterThan(0);
      expect(
        source.slice(0, row).includes('alreadyHave()'),
        `${path}: the screen never asks, so the row must be asking`,
      ).toBe(true);
      expect(
        source.slice(row).includes('alreadyHave()'),
        `${path}: asked once per row, which is a full table scan per result`,
      ).toBe(false);
    }
  });
});
