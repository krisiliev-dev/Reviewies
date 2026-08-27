import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UpNext } from '../screens/UpNext';
import { db } from '../data/db';
import { resetImports, whileImporting } from '@reviewies/core/data/importing';
import { COPY } from '@reviewies/core/copy';

/**
 * The third state, on the screen that got it wrong.
 *
 * §6.80 watched the phone spend five and a half seconds of a 266-row import saying
 * "Nothing here yet. 7 shows came from an import…" over a **Match imported shows**
 * button. Every part of that was a claim about a settled library: the count was still
 * growing, and the repair would have matched seven shows and left the rest behind.
 *
 * Rendered rather than driven through a browser on purpose. The web finishes the same
 * import in under 424ms, so a smoke check racing to catch the middle of it would be
 * flaky in exactly the direction that makes a suite worth ignoring. Here the import is
 * held open for as long as the assertions need.
 */
beforeEach(async () => {
  resetImports();
  await db.library.clear();
  await db.watches.clear();
  await db.titles.clear();
  await db.episodes.clear();
});

afterEach(() => resetImports());

/** An unmatched import that has landed: a local row Up Next can count. */
async function landOneImportedShow() {
  await db.titles.put({ id: 'local:tv:tvtime-1', kind: 'show', name: 'Dark', fetchedAt: 0 });
  await db.library.put({
    titleId: 'local:tv:tvtime-1',
    kind: 'show',
    status: 'watching',
    addedAt: Date.now(),
  });
}

const upNext = () =>
  render(
    <MemoryRouter>
      <UpNext />
    </MemoryRouter>,
  );

describe('Up Next while an import is running', () => {
  it('says it is still reading, and names what', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const running = whileImporting('your TV Time export', () => held);

    await landOneImportedShow();
    upNext();

    await waitFor(() =>
      expect(
        screen.getByText(COPY.upNext.stillImporting('your TV Time export')),
      ).toBeTruthy(),
    );

    release();
    await running;
  });

  /**
   * The part that cost something. Matching what has landed so far leaves the rest of
   * the import unmatched behind it, and the offer is gone by then because matching has
   * already run once this session.
   */
  it('does not offer to match a library still being written', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const running = whileImporting('your TV Time export', () => held);

    await landOneImportedShow();
    upNext();

    await waitFor(() =>
      expect(screen.getByText(COPY.upNext.stillImporting('your TV Time export'))).toBeTruthy(),
    );
    expect(screen.queryByRole('button', { name: /Match imported shows/i })).toBeNull();

    release();
    await running;
  });

  /** And never the count, which is the number that was growing while it was read. */
  it('does not put a count on screen mid-import', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const running = whileImporting('your TV Time export', () => held);

    await landOneImportedShow();
    upNext();

    await waitFor(() =>
      expect(screen.getByText(COPY.upNext.stillImporting('your TV Time export'))).toBeTruthy(),
    );
    expect(screen.queryByText(COPY.upNext.matchingImport(1))).toBeNull();

    release();
    await running;
  });

  /**
   * Once it settles, the screen goes back to describing what is really there. Without
   * this the fix could be "never say anything", which passes the three above.
   */
  it('describes the landed import once the run is over', async () => {
    await landOneImportedShow();
    await whileImporting('your TV Time export', async () => {});
    upNext();

    await waitFor(() => expect(screen.getByText(COPY.upNext.matchingImport(1))).toBeTruthy());
    expect(screen.queryByText(/Still reading/)).toBeNull();
  });

  /** An import that failed is over, and the screen must stop waiting for it. */
  it('stops saying it is reading when the import throws', async () => {
    await landOneImportedShow();
    await whileImporting('your TV Time export', async () => {
      throw new Error('unreadable');
    }).catch(() => {});
    upNext();

    await waitFor(() => expect(screen.getByText(COPY.upNext.matchingImport(1))).toBeTruthy());
  });
});
