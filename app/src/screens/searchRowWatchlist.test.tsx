import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { COPY } from '@reviewies/core/copy';
import { resetProvider, setProvider } from '@reviewies/core/metadata/index';
import type { MetadataProvider, SearchResult } from '@reviewies/core/metadata/provider';
import { db } from '../data/db';
import { Discover } from './Discover';

/**
 * The press, and what is in the database afterwards.
 *
 * `wiring/watchlistPromise.test.ts` reads the six places the watchlist name is drawn and
 * asks whether each one's `onPress` reaches `addToWatchlist`. That is a claim about the
 * *shape* of the wiring, and the shape can be right while the act is not — the plant that
 * proved it is in this file's sister comment: a handler whose write sits behind
 * `if (String(result.id).length > 9999)` satisfies every clause over there and adds
 * nothing. It is `wrongWay`'s defect in a different costume (`docs/design/agents.md` §9):
 * a check that reads the same source the component renders from can only ever agree with
 * it.
 *
 * So this one does not read source at all. It renders the real screen with a real
 * provider stub, presses the control by the name a screen reader would use, and asks
 * `db.watchlist` — a different source of truth from the file under test — what happened.
 *
 * Its limit is the mirror of the other file's: it can only reach the web. The phone's
 * `ResultRow` is the same row and this cannot press it, which is why both files exist.
 */

const SALT: SearchResult = {
  id: 'tmdb:tv:9001',
  kind: 'show',
  name: 'Salt Flats',
  year: 2024,
  overview: 'A short one.',
  genres: ['Drama'],
};

/**
 * A provider that answers the search and nothing else.
 *
 * `getTrending` returns nothing on purpose: the shelf is not the subject, and a stub that
 * fed it would put boxes on the screen carrying a *second* control with the same announced
 * name — after which `getByRole` would be ambiguous and the test would be pressing
 * whichever one it happened to find. §6.191's shelf is the other half of this screen and
 * has its own guards.
 */
const provider: MetadataProvider = {
  name: 'test',
  search: async (query) => (query.toLowerCase().includes('salt') ? [SALT] : []),
  getTitle: async () => undefined,
  getEpisodes: async () => [],
  getWatchProviders: async () => undefined,
  getRecommendations: async () => [],
  getTrending: async () => [],
};

beforeEach(async () => {
  setProvider(provider);
  await Promise.all([db.watchlist.clear(), db.library.clear(), db.titles.clear()]);
});

afterEach(() => {
  resetProvider();
});

describe('the Watchlist control on a search result', () => {
  it('puts the title on the watchlist when it is pressed, and says so', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/discover?q=Salt']}>
        <Discover />
      </MemoryRouter>,
    );

    // The debounce is 300ms and the row arrives after it.
    const control = await screen.findByRole(
      'button',
      { name: COPY.controls.addToWatchlist(SALT.name) },
      { timeout: 5000 },
    );

    await user.click(control);

    // The database, not the screen: this is the claim the control's name makes, and the
    // whole finding was that a screen can look busy while nothing is written.
    await waitFor(async () => {
      expect(await db.watchlist.count(), 'the press wrote no watchlist row').toBe(1);
    });
    expect((await db.watchlist.toArray())[0]?.titleId).toBe(SALT.id);

    // And the row says it, rather than leaving the person to press again to find out.
    await waitFor(() => expect(screen.getByText(COPY.watchlist.alreadyOn)).toBeTruthy());
  });

  it('leaves the rest of the row where it was, rather than replacing it', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/discover?q=Salt']}>
        <Discover />
      </MemoryRouter>,
    );

    const control = await screen.findByRole(
      'button',
      { name: COPY.controls.addToWatchlist(SALT.name) },
      { timeout: 5000 },
    );
    await user.click(control);
    await waitFor(async () => expect(await db.watchlist.count()).toBe(1));

    /*
     * The trap this sprint removed, stated as the property that replaced it.
     *
     * Pressing this used to swap the row's three controls for a note field and a Save with
     * no Cancel — `design/screens/04-search-noting.png`. Track was gone, so the one thing a
     * person who had mis-pressed could do was commit a watchlist entry or leave the screen.
     * Track surviving the press is what "no dead end" means on this row, and it is checked
     * by its announced name because that is the name the trap took away.
     */
    expect(
      screen.getByRole('button', { name: COPY.controls.trackTitle(SALT.name) }),
      'pressing Watchlist took Track off the row',
    ).toBeTruthy();
  });
});
