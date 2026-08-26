import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MatchImports, resetAutoMatch } from './MatchImports';
import type { Proposal, RunProgress } from '@reviewies/core/data/reconcile';

/**
 * The question, which is the safety mechanism.
 *
 * The matcher's protection against rewriting somebody's history is that an ambiguous
 * show becomes a question instead of a guess. Everything about that decision was tested
 * — the thresholds against live TMDB, the run loop, the migration — except the screen a
 * person actually touches. If choosing the second candidate accepted the first, or
 * "None of these" quietly took the top one, the whole design would be theatre and
 * nothing in the suite would have said so.
 */
const ask = (over: Partial<Proposal> = {}): Proposal => ({
  localId: 'local:tv:tvtime-900',
  name: 'The Office',
  kind: 'show',
  candidates: [
    { id: 'tmdb:tv:2316', kind: 'show', name: 'The Office', year: 2005, score: 1 },
    { id: 'tmdb:tv:2996', kind: 'show', name: 'The Office', year: 2001, score: 1 },
  ],
  ...over,
});

// Each case is a fresh launch. Auto-matching runs once per session by design, so
// without this the second test in the file would silently never start one.
beforeEach(() => resetAutoMatch());

const progress = (over: Partial<RunProgress> = {}): RunProgress => ({
  done: 3,
  left: 0,
  matched: 2,
  asks: [],
  ...over,
});

describe('matching imported shows', () => {
  it('reports what it did and what it could not decide', async () => {
    const user = userEvent.setup();
    render(
      <MatchImports
        autoStart={false}
        run={async () => progress({ asks: [ask()] })}
        accept={async () => ({ watches: 0, ratings: 0, episodesMapped: 0, orphanedWatches: 0 })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Match imported shows' }));

    await screen.findByText(/Matched 2 of 3/);
    expect(screen.getByText(/1 need a decision/)).toBeInTheDocument();
    // Both real answers offered, with the years that tell them apart — the choice is
    // not answerable without them.
    expect(screen.getByRole('button', { name: 'The Office is The Office, 2005' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'The Office is The Office, 2001' })).toBeInTheDocument();
  });

  it('accepts the one that was chosen, not the one at the top', async () => {
    const user = userEvent.setup();
    const accept = vi.fn(async () => ({
      watches: 0,
      ratings: 0,
      episodesMapped: 0,
      orphanedWatches: 0,
    }));

    render(<MatchImports autoStart={false} run={async () => progress({ asks: [ask()] })} accept={accept} />);
    await user.click(screen.getByRole('button', { name: 'Match imported shows' }));

    // The second one. Picking the first would pass this test if the component ignored
    // the choice entirely, which is exactly the bug worth catching.
    await user.click(await screen.findByRole('button', { name: 'The Office is The Office, 2001' }));

    await waitFor(() => expect(accept).toHaveBeenCalledWith('local:tv:tvtime-900', 'tmdb:tv:2996'));
    expect(screen.queryByText('More than one show could be this.', { exact: false })).toBeNull();
  });

  it('leaves a row alone when the answer is none of these', async () => {
    const user = userEvent.setup();
    const accept = vi.fn(async () => ({
      watches: 0,
      ratings: 0,
      episodesMapped: 0,
      orphanedWatches: 0,
    }));

    render(<MatchImports autoStart={false} run={async () => progress({ asks: [ask()] })} accept={accept} />);
    await user.click(screen.getByRole('button', { name: 'Match imported shows' }));
    await user.click(await screen.findByRole('button', { name: 'Leave The Office unmatched' }));

    // Nothing written. The row stays unmatched and comes back on the next run, which is
    // the entire point of offering a way out rather than forcing a choice.
    expect(accept).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /The Office is/ })).toBeNull();
  });

  it('says what it is doing while it runs, out loud', async () => {
    const user = userEvent.setup();
    let report: ((p: RunProgress) => void) | undefined;

    render(
      <MatchImports
        autoStart={false}
        run={async (options) => {
          report = options?.onProgress;
          // Held open so the running state can be looked at.
          await new Promise((resolve) => setTimeout(resolve, 50));
          return progress();
        }}
        accept={async () => ({ watches: 0, ratings: 0, episodesMapped: 0, orphanedWatches: 0 })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Match imported shows' }));
    report?.(progress({ done: 1, left: 29, matched: 1 }));

    // A screen reader has no other way to follow a run over two hundred shows.
    const status = await screen.findByText(/Matching…/);
    expect(status).toHaveAttribute('aria-live', 'polite');
    await waitFor(() => expect(screen.getByText(/1 of 30/)).toBeInTheDocument());
  });

  it('does not wedge when the run fails', async () => {
    const user = userEvent.setup();
    render(
      <MatchImports
        autoStart={false}
        run={async () => {
          throw new Error('provider said no');
        }}
        accept={async () => ({ watches: 0, ratings: 0, episodesMapped: 0, orphanedWatches: 0 })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Match imported shows' })).catch(() => {});

    // Back to an offer rather than stuck on "Matching…" forever.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Match imported shows' })).toBeInTheDocument(),
    );
  });

  it('starts itself, so an import is not followed by a chore', async () => {
    // Doc 10 §4: the first thing somebody saw after importing years of history was an
    // empty screen and a button. Importing is already a deliberate act.
    const run = vi.fn(async () => progress({ asks: [] }));
    render(<MatchImports run={run} />);

    // Nothing was clicked. That is the whole assertion: the run happened because an
    // import happened, not because somebody was handed a task.
    await waitFor(() => expect(run).toHaveBeenCalled());
  });

  it('only starts once, however many times it is mounted', async () => {
    // Up Next mounts this on every visit while anything is unmatched, and matching is a
    // request per show.
    const run = vi.fn(async () => progress({ asks: [] }));
    const first = render(<MatchImports run={run} />);
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    first.unmount();

    render(<MatchImports run={run} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does not claim there is a choice when there is nothing to choose', async () => {
    // Doc 10 §5. "More than one show could be this" above an empty list, whose only
    // control is "None of these", is the opposite of the truth and an offer to give up.
    render(
      <MatchImports
        autoStart={false}
        run={async () => progress({ asks: [ask({ candidates: [] })] })}
      />,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Match imported shows' }));

    expect(await screen.findByText(/Nothing came back under that name/)).toBeTruthy();
    expect(screen.queryByText('More than one show could be this.', { exact: false })).toBeNull();
    // And something to do about it.
    expect(
      screen.getByRole('textbox', { name: /Search for the show The Office really is/ }),
    ).toBeTruthy();
  });
});
