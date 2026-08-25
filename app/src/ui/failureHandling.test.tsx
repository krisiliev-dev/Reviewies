import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { onFailure, reportFailure, resetFailures } from '@reviewies/core/data/failure';
import { ErrorBoundary } from './ErrorBoundary';
import { FailureBanner } from './FailureBanner';

/**
 * What happens to a failure nobody caught.
 *
 * There was no answer before this. No boundary anywhere on either platform, so a thrown
 * error in any component unmounted the whole tree to a blank page; no rejection handler,
 * so a promise that failed left a spinner running or a button that appeared to do
 * nothing.
 */
afterEach(() => {
  resetFailures();
  vi.restoreAllMocks();
});

function Explodes(): never {
  throw new Error('the screen broke');
}

describe('a screen that throws', () => {
  it('does not take the app with it', () => {
    // React logs the caught error; the noise is not the point of the test.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Explodes />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/This screen stopped/)).toBeTruthy();
    // The reassurance is the load-bearing half: the data was never in danger, and an
    // app whose whole premise is that your history is safe here should say so.
    expect(screen.getByText(/nothing was lost/)).toBeTruthy();
  });

  it('does not also raise the banner, which would say the same thing twice', () => {
    // It used to, and sweeping every route is what showed the result: a full-screen
    // explanation with a banner on top of it repeating the sentence. The bus is a way
    // of telling somebody rather than a log, and this component has already told them.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const heard: string[] = [];
    const stop = onFailure((f) => heard.push(f.message));

    render(
      <ErrorBoundary>
        <Explodes />
      </ErrorBoundary>,
    );
    stop();

    expect(heard).toEqual([]);
  });
});

describe('a failure nothing was expecting', () => {
  it('is said out loud rather than swallowed', async () => {
    render(<FailureBanner />);

    reportFailure(new Error('the database is full'));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toMatch(/the database is full/);
  });

  it('shows nothing at all when nothing has failed', () => {
    // A banner that is always there is a banner nobody reads.
    render(<FailureBanner />);

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('hears an unhandled rejection, which is how most of them arrive', async () => {
    render(<FailureBanner />);

    // The event a browser fires when a promise rejects with nothing to catch it. Both
    // smoke suites see these through Playwright's pageerror — verified by firing one at
    // a running build — but seeing them is not the same as telling the person.
    const event = new Event('unhandledrejection') as Event & { reason?: unknown };
    event.reason = new Error('nobody caught this');
    window.dispatchEvent(event);

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toMatch(/nobody caught this/);
  });
});
