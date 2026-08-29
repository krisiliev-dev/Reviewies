import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { db } from '../data/db';
import { CatchUp } from './CatchUp';

/**
 * "Nothing here shows episode names, so you cannot be spoiled by catching up."
 *
 * The control says that to the person using it, and the sentence is the feature: the
 * research complaint it answers is that adding a show means walking past the names and
 * synopses of every episode ahead of you. A well-meaning change that put an episode
 * title next to its number would look like an improvement and would break the only
 * promise this control makes.
 *
 * So the names go into the database and the assertion is that none of them reaches the
 * screen — rather than checking the component happens to render numbers today.
 */
const SPOILER = 'Ned Stark Dies';

beforeEach(async () => {
  await Promise.all([db.titles.clear(), db.episodes.clear(), db.watches.clear()]);
  await db.titles.put({ id: 'tmdb:tv:1', kind: 'show', name: 'A Show', fetchedAt: Date.now() });
  await db.episodes.bulkPut([
    {
      id: 'tmdb:ep:1',
      seriesId: 'tmdb:tv:1',
      season: 1,
      number: 1,
      name: SPOILER,
      overview: 'It happens by surprise, at the end.',
      airDate: '2020-01-01',
      fetchedAt: Date.now(),
    },
    {
      id: 'tmdb:ep:2',
      seriesId: 'tmdb:tv:1',
      season: 1,
      number: 2,
      name: 'And Then Everyone Reacts',
      airDate: '2020-01-08',
      fetchedAt: Date.now(),
    },
  ]);
});

describe('catching up without being spoiled', () => {
  it('offers the episodes it knows about', async () => {
    // Without this the assertion below could pass on an empty sheet.
    render(<CatchUp seriesId="tmdb:tv:1" seriesName="A Show" onDone={() => {}} />);

    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByLabelText(/Last episode you watched in season 1: 2/)).toBeTruthy(),
    );
  });

  it('offers a season step only when more than one season has aired', async () => {
    /*
     * `airedSeasonSizes`, not `seasons`. A show whose next season has been announced but
     * not broadcast has one season to catch up on, and a step asking which of two is a
     * step with one answer.
     *
     * Nothing asserted this until the fixture changed. `app/smoke.mjs` drove the season
     * step and it worked because every fixture show was fully aired — so the suite was
     * covering "this show happens to have two aired seasons", not the rule. §6.146.
     */
    await db.episodes.bulkPut([
      {
        id: 'tmdb:ep:3',
        seriesId: 'tmdb:tv:1',
        season: 2,
        number: 1,
        name: 'Next Year',
        airDate: '2999-01-01',
        fetchedAt: Date.now(),
      },
    ]);
    render(<CatchUp seriesId="tmdb:tv:1" seriesName="A Show" onDone={() => {}} />);

    await waitFor(() =>
      expect(screen.getByLabelText(/Last episode you watched in season 1: 2/)).toBeTruthy(),
    );
    expect(screen.queryByLabelText(/Season: 2/)).toBeNull();
  });

  it('shows no episode name, synopsis or air date anywhere on it', async () => {
    const { container } = render(
      <CatchUp seriesId="tmdb:tv:1" seriesName="A Show" onDone={() => {}} />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/Last episode you watched in season 1: 2/)).toBeTruthy(),
    );

    // The whole subtree, including anything a screen reader would announce.
    const rendered = container.innerHTML;
    expect(rendered).not.toContain(SPOILER);
    expect(rendered).not.toContain('And Then Everyone Reacts');
    expect(rendered).not.toContain('It happens by surprise');
    expect(rendered).not.toContain('2020-01-01');
  });
});
