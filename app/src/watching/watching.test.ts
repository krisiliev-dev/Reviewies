import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatTimecode, usePlaybackClock } from './usePlaybackClock';
import { searchEmoji, EMOJI_PAD } from './emoji';

describe('formatTimecode', () => {
  it('formats under an hour as m:ss', () => {
    expect(formatTimecode(0)).toBe('0:00');
    expect(formatTimecode(65_000)).toBe('1:05');
    expect(formatTimecode(59_000)).toBe('0:59');
  });

  it('formats over an hour as h:mm:ss', () => {
    expect(formatTimecode(3_725_000)).toBe('1:02:05');
  });

  it('clamps negatives rather than rendering nonsense', () => {
    expect(formatTimecode(-5000)).toBe('0:00');
  });
});

describe('playback clock', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts stopped at zero', () => {
    const { result } = renderHook(() => usePlaybackClock());
    expect(result.current.positionMs).toBe(0);
    expect(result.current.running).toBe(false);
  });

  it('advances in real time once started', () => {
    const { result } = renderHook(() => usePlaybackClock());
    act(() => result.current.start(0));
    act(() => void vi.advanceTimersByTime(4000));

    expect(result.current.positionMs).toBeGreaterThanOrEqual(3900);
    expect(result.current.positionMs).toBeLessThanOrEqual(4100);
  });

  it('holds position while paused', () => {
    const { result } = renderHook(() => usePlaybackClock());
    act(() => result.current.start(0));
    act(() => void vi.advanceTimersByTime(2000));
    act(() => result.current.pause());

    const held = result.current.positionMs;
    act(() => void vi.advanceTimersByTime(10_000));
    expect(result.current.positionMs).toBe(held);
  });

  it('resumes from where it paused rather than restarting', () => {
    const { result } = renderHook(() => usePlaybackClock());
    act(() => result.current.start(0));
    act(() => void vi.advanceTimersByTime(3000));
    act(() => result.current.pause());
    act(() => result.current.toggle());
    act(() => void vi.advanceTimersByTime(1000));

    expect(result.current.positionMs).toBeGreaterThanOrEqual(3900);
  });

  it('nudges backwards and forwards for drift correction', () => {
    const { result } = renderHook(() => usePlaybackClock());
    act(() => result.current.start(60_000));
    act(() => result.current.nudge(-5000));
    expect(result.current.positionMs).toBeCloseTo(55_000, -2);

    act(() => result.current.nudge(5000));
    expect(result.current.positionMs).toBeCloseTo(60_000, -2);
  });

  it('never nudges below zero', () => {
    const { result } = renderHook(() => usePlaybackClock());
    act(() => result.current.start(1000));
    act(() => result.current.nudge(-30_000));
    expect(result.current.positionMs).toBe(0);
  });

  it('can start partway in, for joining an episode late', () => {
    const { result } = renderHook(() => usePlaybackClock());
    act(() => result.current.start(600_000));
    expect(result.current.positionMs).toBe(600_000);
  });

  it('derives position from wall clock, so throttled timers do not cause drift', () => {
    const { result } = renderHook(() => usePlaybackClock());
    act(() => result.current.start(0));

    // One long jump, as happens when a tab is backgrounded and timers coalesce.
    act(() => void vi.advanceTimersByTime(60_000));
    expect(result.current.positionMs).toBeGreaterThanOrEqual(59_000);
  });
});

describe('emoji search', () => {
  it('returns nothing for an empty query', () => {
    expect(searchEmoji('')).toEqual([]);
  });

  it('matches on label', () => {
    expect(searchEmoji('cliff')[0].emoji).toBe('🧗');
  });

  it('matches on keyword rather than only the visible label', () => {
    expect(searchEmoji('twist')[0].emoji).toBe('🤯');
  });

  it('ranks exact label matches above partial ones', () => {
    expect(searchEmoji('love')[0].label).toBe('Love');
  });

  it('is case insensitive', () => {
    expect(searchEmoji('FUNNY')[0].emoji).toBe('😂');
  });

  it('passes through a pasted emoji even if we do not know it', () => {
    const results = searchEmoji('🦩');
    expect(results[0].emoji).toBe('🦩');
  });

  it('includes thumbs up and down on the default pad as permanent fixtures', () => {
    const emojis = EMOJI_PAD.map((e) => e.emoji);
    expect(emojis).toContain('👍');
    expect(emojis).toContain('👎');
  });

  it('returns an empty list for nonsense rather than throwing', () => {
    expect(searchEmoji('zzzqqq')).toEqual([]);
  });
});
