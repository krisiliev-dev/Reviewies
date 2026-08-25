import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { Reaction } from '@reviewies/core/domain/types';
import { ReactionStream } from './ReactionStream';

/**
 * The stream, under the two things that ask it to stop moving.
 *
 * index.css flattens every animation under `prefers-reduced-motion`, which is the right
 * default and was the wrong answer here: the drift is a keyframe animation with
 * `forwards`, so a 0.01ms duration ran it straight to its end state — off the left-hand
 * edge — and someone with the setting on saw an empty strip where the whole feature was
 * meant to be. Reduced motion has to mean a different presentation, not a faster one.
 */
function matchMediaReturning(matches: boolean) {
  return (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

const at = (tMs: number, id: string): Reaction =>
  ({ id, targetId: 't', tMs, emoji: '😂', mine: false }) as Reaction;

beforeEach(() => {
  vi.stubGlobal('matchMedia', matchMediaReturning(false));
});

/** Advance the clock the way playback does: a step small enough not to read as a seek. */
function play(props: { reactions: Reaction[]; paused?: boolean }) {
  const view = render(<ReactionStream {...props} positionMs={0} />);
  view.rerender(<ReactionStream {...props} positionMs={2000} />);
  return view;
}

describe('what the stream says out loud', () => {
  const at = (tMs: number, id: string, emoji = '😂'): Reaction =>
    ({ id, targetId: 't', tMs, emoji, mine: false }) as Reaction;

  it('does not announce the emoji themselves', () => {
    play({ reactions: [at(1000, 'a')] });
    // Read one at a time they are noise — twenty-four a minute at the default density,
    // on a screen somebody is holding while watching television.
    expect(screen.getByText('😂')).toHaveAttribute('aria-hidden', 'true');
  });

  it('has somewhere to speak that is not the emoji', () => {
    const { container } = play({ reactions: [at(1000, 'a')] });
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    // The live region must not contain the drifting emoji, or hiding them achieved
    // nothing: a live region announces its whole subtree when it changes.
    expect(live?.textContent).not.toContain('😂');
  });

  it('summarises a burst rather than listing it', async () => {
    vi.useFakeTimers();
    try {
      const reactions = [at(1000, 'a'), at(1100, 'b'), at(1200, 'c', '😱')];
      const view = render(<ReactionStream reactions={reactions} positionMs={0} />);
      view.rerender(<ReactionStream reactions={reactions} positionMs={2000} />);

      await act(() => vi.advanceTimersByTimeAsync(1200));

      const live = view.container.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toBe('2 funny and 1 other');
    } finally {
      vi.useRealTimers();
    }
  });

  it('stays quiet while it is held, including about what already arrived', async () => {
    vi.useFakeTimers();
    try {
      const reactions = [at(1000, 'a')];
      // Collected while running, then held before the window comes round. Holding from
      // the start would prove nothing: nothing is collected either way, so the test
      // would pass with the check removed.
      const view = render(<ReactionStream reactions={reactions} positionMs={0} />);
      view.rerender(<ReactionStream reactions={reactions} positionMs={2000} />);
      view.rerender(<ReactionStream reactions={reactions} positionMs={2000} paused />);

      await act(() => vi.advanceTimersByTimeAsync(5000));

      // Somebody who asked the screen to hold still has asked for quiet.
      expect(view.container.querySelector('[aria-live="polite"]')?.textContent).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the reaction stream', () => {
  it('drifts by default', () => {
    play({ reactions: [at(1000, 'a')] });
    const style = screen.getByText('😂').getAttribute('style') ?? '';
    expect(style).toContain('reaction-drift');
  });

  it('places rather than drifts when less motion is asked for', () => {
    vi.stubGlobal('matchMedia', matchMediaReturning(true));
    play({ reactions: [at(1000, 'a')] });

    const style = screen.getByText('😂').getAttribute('style') ?? '';
    // The point of the test: still on screen, and not animated to get there.
    expect(style).not.toContain('reaction-drift');
    expect(style).toContain('right:');
  });

  it('lets nothing new arrive while it is held', () => {
    play({ reactions: [at(1000, 'a')], paused: true });
    expect(screen.queryByText('😂')).toBeNull();
  });

  it('holds still what is already on screen', () => {
    const reactions = [at(1000, 'a')];
    const view = render(<ReactionStream reactions={reactions} positionMs={0} />);
    view.rerender(<ReactionStream reactions={reactions} positionMs={2000} />);
    view.rerender(<ReactionStream reactions={reactions} positionMs={2000} paused />);

    const style = screen.getByText('😂').getAttribute('style') ?? '';
    expect(style).toContain('animation-play-state: paused');
  });
});
