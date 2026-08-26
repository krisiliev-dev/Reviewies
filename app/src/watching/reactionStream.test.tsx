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

/**
 * An episode's length, rather than five seconds of one.
 *
 * Every check above renders two frames. Watching Mode is a screen somebody leaves open
 * for forty-five minutes with a timer firing four times a second, and nothing here had
 * ever run it for longer than a couple of ticks. §6.69.
 *
 * The clock is simulated — `positionMs` advances a second at a time and vitest's fake
 * timers carry the retirement sweep with it — so what these measure is the component's
 * own arithmetic, not forty-five minutes of a real browser's garbage collector. The
 * browser half is one bounded check in `app/smoke.mjs`.
 */
describe('over the length of an episode', () => {
  const view = { current: undefined as ReturnType<typeof render> | undefined };

  /** Distinct elements, not a count per frame: the same emoji sampled twice is one. */
  function playAndCount(reactions: Reaction[], seconds: number, density = 24) {
    const rendered = render(
      <ReactionStream reactions={reactions} positionMs={0} density={density} />,
    );
    view.current = rendered;
    const everMounted = new Set<Element>();
    let peakMounted = 0;

    for (let s = 1; s <= seconds; s++) {
      act(() => {
        rendered.rerender(
          <ReactionStream reactions={reactions} positionMs={s * 1000} density={density} />,
        );
      });
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      const spans = document.querySelectorAll('span[aria-hidden="true"]');
      peakMounted = Math.max(peakMounted, spans.length);
      for (const el of spans) everMounted.add(el);
    }
    return { shown: everMounted.size, peakMounted };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('shows every reaction on an ordinary episode, rather than two fifths of them', () => {
    /**
     * The measurement that started this. Retirement used to drop one element every
     * `TRAVEL_MS / 2` whatever had finished, so a slot stayed taken for up to fifty
     * seconds after its emoji had left the screen — and `room = density - flyingCount`
     * refused every arrival meanwhile. Five minutes of one reaction a second showed
     * **116 of 300**, twenty a minute, and the ones shown were an arbitrary prefix.
     *
     * "You still see everything everyone else left at that moment" is what this screen
     * is for.
     */
    const reactions = Array.from({ length: 300 }, (_, i) => at((i + 1) * 1000, `r${i}`));
    const { shown } = playAndCount(reactions, 300);
    expect(shown).toBe(300);
    vi.useRealTimers();
  });

  it('still caps how many are on screen when the episode is genuinely busy', () => {
    // Ten a second, which no real audience produces. The cap is about readability
    // (§6.13, Bilibili's lesson) and has to bind — the fix above must not have turned a
    // ceiling into an open door.
    const reactions = Array.from({ length: 3000 }, (_, i) => at(1000 + i * 100, `r${i}`));
    const { peakMounted } = playAndCount(reactions, 300);
    expect(peakMounted).toBeLessThanOrEqual(24);
    vi.useRealTimers();
  });

  it('mounts nothing that has finished crossing', () => {
    // A reaction is visible for four seconds. At one a second, about five are in flight
    // at any moment; anything much above that is an invisible node holding a compositor
    // layer, and on a phone that is real memory for the length of an episode.
    const reactions = Array.from({ length: 300 }, (_, i) => at((i + 1) * 1000, `r${i}`));
    const { peakMounted } = playAndCount(reactions, 300);
    expect(peakMounted).toBeLessThan(12);
    vi.useRealTimers();
  });

  it('does not grow over an episode', () => {
    // The same rate, four times as long: whatever is mounted at five minutes should be
    // what is mounted at twenty. A slope here is the leak this sprint went looking for.
    const reactions = Array.from({ length: 1200 }, (_, i) => at((i + 1) * 1000, `r${i}`));
    const long = playAndCount(reactions, 1200);
    expect(long.peakMounted).toBeLessThan(12);
    expect(long.shown).toBe(1200);
    vi.useRealTimers();
  });

  it('keeps what is on screen while it is held, rather than sweeping it away', () => {
    // WCAG 2.2.2's pause stops the animation where it stands. Retiring on schedule
    // underneath it would clear a screen somebody asked to hold still.
    const reactions = Array.from({ length: 20 }, (_, i) => at((i + 1) * 1000, `r${i}`));
    const rendered = render(<ReactionStream reactions={reactions} positionMs={0} />);
    for (let s = 1; s <= 3; s++) {
      act(() => {
        rendered.rerender(<ReactionStream reactions={reactions} positionMs={s * 1000} />);
      });
      act(() => vi.advanceTimersByTime(1000));
    }
    const held = document.querySelectorAll('span[aria-hidden="true"]').length;
    expect(held).toBeGreaterThan(0);

    act(() => {
      rendered.rerender(<ReactionStream reactions={reactions} positionMs={3000} paused />);
    });
    // Twice as long as a reaction lives, held throughout.
    act(() => vi.advanceTimersByTime(10_000));
    expect(document.querySelectorAll('span[aria-hidden="true"]').length).toBe(held);
    vi.useRealTimers();
  });

  it('clears them once it is let go again', () => {
    // And the held time is added back rather than forgiven, so releasing does not empty
    // the band instantly either.
    const reactions = Array.from({ length: 20 }, (_, i) => at((i + 1) * 1000, `r${i}`));
    const rendered = render(<ReactionStream reactions={reactions} positionMs={0} />);
    act(() => rendered.rerender(<ReactionStream reactions={reactions} positionMs={1000} />));
    act(() => vi.advanceTimersByTime(500));

    act(() => {
      rendered.rerender(<ReactionStream reactions={reactions} positionMs={1000} paused />);
    });
    act(() => vi.advanceTimersByTime(30_000));
    act(() => rendered.rerender(<ReactionStream reactions={reactions} positionMs={1000} />));
    // Still there the instant it is released...
    expect(document.querySelectorAll('span[aria-hidden="true"]').length).toBeGreaterThan(0);
    // ...and gone once the rest of its crossing has actually elapsed.
    act(() => vi.advanceTimersByTime(6000));
    expect(document.querySelectorAll('span[aria-hidden="true"]').length).toBe(0);
    vi.useRealTimers();
  });
});
