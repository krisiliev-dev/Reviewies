import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
