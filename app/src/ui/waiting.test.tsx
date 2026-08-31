import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { COPY } from '@reviewies/core/copy';
import { SAY_WE_ARE_LOOKING } from '@reviewies/core/ui/waiting';
import { db } from '../data/db';
import { Watchlist } from '../screens/Watchlist';
import { Stats } from '../screens/Stats';
import { TitleDetail } from '../screens/TitleDetail';
import { useWaitedLongEnough } from './waiting';

/**
 * The first frame, which nothing had ever asserted.
 *
 * `design/between.mjs` measures the interval between a press and a settled screen. Two of
 * its findings are what this file guards, and both are about the *first* thing painted
 * rather than about the last:
 *
 *  1. **Nine of 24 web interactions painted a word nobody could read.** `COPY.waiting.loading`
 *     for 13, 17, 17, 19, 20, 20, 25, 32, 33 and 44ms — under one frame at the short end,
 *     under three at the long. `core/src/ui/waiting.ts` has the repair and the threshold.
 *  2. **The title page painted its tail before its head**, and then inserted the head above
 *     it: 109px on the web, five times the 20.02px that instrument derives from this
 *     product's own body line as the unit of losing your place. `/stats` did the same thing
 *     at 283px, which is the largest genuine shift the run found.
 *
 * ## What is asserted, and why it is the shape it is
 *
 * The ordering clause is written as an **implication and not as an absence**: *if the tail
 * is on the screen, the head is too*. The obvious version — "the rating is not painted on
 * the first frame" — would go red the day somebody makes the title resolve synchronously,
 * which is a strictly better screen than either of these. A guard that fails on a correct
 * change is worse than no guard (§6.190), and the rule genuinely is about order rather
 * than about lateness: painting both at once has always been allowed and is the case these
 * screens now hit for anything already in the library.
 *
 * Non-vacuity is the other half and is asserted beside each one: the head and the tail both
 * have to arrive in the end, or a screen that renders nothing for ever satisfies every
 * implication in this file.
 */

beforeEach(async () => {
  await db.watchlist.clear();
  await db.titles.clear();
  await db.library.clear();
  await db.watches.clear();
  await db.episodes.clear();
  await db.ratings.clear();
});

/** The frame the screen paints before any query has answered. RTL flushes effects, and a
 *  `setTimeout` cannot have fired inside a synchronous render, so this is that frame. */
const firstFrame = (ui: React.ReactElement) => render(ui).container.textContent ?? '';

const settle = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
};

describe('the threshold itself', () => {
  /*
   * Checked against something other than itself, which is the whole lesson of §6.190's
   * `wrongWay`: that guard compared a measured press colour against the very token the
   * press renders from, so the app and the check moved together and agreed however wrong
   * they both were. The clause below has the same exposure — `SAY_WE_ARE_LOOKING - 1` is
   * read from the constant under test, so a threshold of 1ms passes it and every screen in
   * the app flickers exactly as before. These two bounds are the fix, and neither is read
   * from the thing it bounds.
   *
   * **The floor is a fixation.** A word on the screen for less than one fixation cannot
   * have been fixated, and ordinary reading fixations run 200–250ms (Rayner 1998). It is
   * also, independently, comfortably past the longest flash `design/between.mjs` actually
   * measured — 44ms — so a threshold under it would leave a measured defect in place.
   *
   * **The ceiling is §6.104.** The loading state exists so that *"I could not look"* is
   * distinguishable from *"there is nothing"*, and a threshold long enough that no real
   * wait ever reaches it would delete that state by arithmetic while leaving the branch in
   * the source, which is a worse outcome than the flicker: the defect would be invisible to
   * every reader of the file. Half a second is the far side of Nielsen's 0.1s bound and the
   * near side of his 1.0s one; a wait that long is one somebody has noticed.
   */
  it('is long enough to be read and short enough to be reached', () => {
    expect(SAY_WE_ARE_LOOKING, 'shorter than one fixation, so the word cannot be read').toBeGreaterThanOrEqual(200);
    expect(SAY_WE_ARE_LOOKING, 'so long the waiting state is unreachable — §6.104').toBeLessThanOrEqual(500);
  });
});

describe('a wait that has not lasted long enough to be worth a word', () => {
  it('is silent at first and says so afterwards, and comes back for the next wait', () => {
    vi.useFakeTimers();
    try {
      const { result, rerender } = renderHook(({ waiting }) => useWaitedLongEnough(waiting), {
        initialProps: { waiting: true },
      });

      expect(result.current, 'the first frame of a wait').toBe(false);
      act(() => void vi.advanceTimersByTime(SAY_WE_ARE_LOOKING - 1));
      expect(result.current, 'one millisecond short of the threshold').toBe(false);
      act(() => void vi.advanceTimersByTime(1));
      expect(result.current, 'a wait long enough to be worth saying').toBe(true);

      /*
       * The answer arrives, and then a second wait begins on the same mounted screen —
       * `Stats.tsx` every time somebody changes the period. A latch that only ran at mount
       * would report `true` on the first frame of that second wait, which is the flicker
       * this exists to remove surviving in the one place a mount-time timer cannot see.
       */
      rerender({ waiting: false });
      expect(result.current).toBe(false);
      rerender({ waiting: true });
      expect(result.current, 'the first frame of the second wait').toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the first frame of a screen whose query has not answered', () => {
  it('does not say Loading on the watchlist', async () => {
    await db.titles.put({ id: 'tmdb:tv:1', kind: 'show', name: 'Dark', fetchedAt: 0 });
    await db.watchlist.put({ titleId: 'tmdb:tv:1', kind: 'show', addedAt: 1 });

    expect(firstFrame(<MemoryRouter><Watchlist /></MemoryRouter>)).not.toContain(
      COPY.waiting.loading,
    );
    await settle();
  });

  it('does not say Loading on stats', async () => {
    expect(firstFrame(<MemoryRouter><Stats /></MemoryRouter>)).not.toContain(
      COPY.waiting.loading,
    );
    await settle();
  });
});

describe('a screen that paints its tail before its head', () => {
  it('is not the title page', async () => {
    await db.titles.put({
      id: 'tmdb:tv:1',
      kind: 'show',
      name: 'Dark',
      year: 2017,
      fetchedAt: Date.now(),
    });

    const view = render(
      <MemoryRouter initialEntries={['/title/tmdb%3Atv%3A1']}>
        <Routes>
          <Route path="/title/:id" element={<TitleDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    const head = () => (view.container.textContent ?? '').includes('Dark');
    const tail = () => (view.container.textContent ?? '').includes(COPY.title.yourRating);

    expect(tail() && !head(), 'the rating painted before the name').toBe(false);

    await settle();
    // Non-vacuity: both halves do arrive, so the implication above is not satisfied by a
    // screen that simply never draws anything.
    expect(head(), 'the name never arrived').toBe(true);
    expect(tail(), 'the rating never arrived').toBe(true);
  });

  it('is not stats, whose spine sits above its period control', async () => {
    await db.titles.put({ id: 'tmdb:tv:1', kind: 'show', name: 'Dark', fetchedAt: 0 });
    await db.library.put({ titleId: 'tmdb:tv:1', kind: 'show', status: 'watching', addedAt: 1 });

    const view = render(<MemoryRouter><Stats /></MemoryRouter>);
    const head = () => (view.container.textContent ?? '').includes(COPY.stats.yourYears);
    const tail = () => (view.container.textContent ?? '').includes(COPY.stats.allTime);

    expect(tail() && !head(), 'the period control painted before the spine').toBe(false);

    await settle();
    expect(head(), 'the spine never arrived').toBe(true);
    expect(tail(), 'the period control never arrived').toBe(true);
  });
});
