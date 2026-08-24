import { describe, expect, it, vi } from 'vitest';
import {
  emitPlayback,
  isPlaybackUpdate,
  isStale,
  matchesEpisode,
  STALE_AFTER_MS,
  subscribeToPlayback,
  type PlaybackUpdate,
} from './extensionBridge';

const update = (over: Partial<PlaybackUpdate> = {}): PlaybackUpdate => ({
  show: 'The Long Dark',
  season: 1,
  episode: 4,
  positionMs: 120_000,
  durationMs: 3_000_000,
  paused: false,
  at: Date.now(),
  ...over,
});

describe('validation', () => {
  it('accepts a well-formed update', () => {
    expect(isPlaybackUpdate(update())).toBe(true);
  });

  it.each([
    ['null', null],
    ['a string', 'nope'],
    ['a missing position', { at: Date.now() }],
    ['a non-numeric position', { positionMs: 'x', at: Date.now() }],
    ['a negative position', { positionMs: -1, at: Date.now() }],
    ['NaN', { positionMs: NaN, at: Date.now() }],
    ['a missing timestamp', { positionMs: 1000 }],
  ])('rejects %s', (_label, value) => {
    expect(isPlaybackUpdate(value)).toBe(false);
  });
});

describe('staleness', () => {
  it('accepts a fresh reading', () => {
    expect(isStale(update({ at: Date.now() }))).toBe(false);
  });

  it('rejects a reading past the threshold', () => {
    // A dead extension must not freeze the clock at its last known position.
    expect(isStale(update({ at: Date.now() - STALE_AFTER_MS - 1000 }))).toBe(true);
  });
});

describe('episode matching', () => {
  it('matches the same episode', () => {
    expect(matchesEpisode(update({ season: 1, episode: 4 }), { season: 1, episode: 4 })).toBe(true);
  });

  it('rejects a different episode', () => {
    // Otherwise a show left playing in another tab would drive this timeline.
    expect(matchesEpisode(update({ season: 2, episode: 1 }), { season: 1, episode: 4 })).toBe(false);
  });

  it('rejects a different season with the same episode number', () => {
    expect(matchesEpisode(update({ season: 2, episode: 4 }), { season: 1, episode: 4 })).toBe(false);
  });

  it('accepts when the extension could not identify the episode', () => {
    // Position is still better than nothing, and the user opened this screen.
    expect(matchesEpisode(update({ season: undefined, episode: undefined }), { season: 1, episode: 4 })).toBe(true);
  });

  it('accepts when we do not know which episode is expected', () => {
    expect(matchesEpisode(update(), {})).toBe(true);
  });
});

describe('subscription', () => {
  it('delivers a valid update', async () => {
    const onUpdate = vi.fn();
    const unsubscribe = subscribeToPlayback(onUpdate);

    emitPlayback(update({ positionMs: 42_000 }));
    await new Promise((r) => setTimeout(r, 10));

    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onUpdate.mock.calls[0][0].positionMs).toBe(42_000);
    unsubscribe();
  });

  it('ignores malformed payloads rather than throwing', async () => {
    const onUpdate = vi.fn();
    const unsubscribe = subscribeToPlayback(onUpdate);

    window.postMessage({ type: 'reviewies:playback', payload: { nonsense: true } }, '*');
    await new Promise((r) => setTimeout(r, 10));

    expect(onUpdate).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('ignores messages of other types', async () => {
    const onUpdate = vi.fn();
    const unsubscribe = subscribeToPlayback(onUpdate);

    window.postMessage({ type: 'something-else', payload: update() }, '*');
    await new Promise((r) => setTimeout(r, 10));

    expect(onUpdate).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('stops delivering after unsubscribe', async () => {
    const onUpdate = vi.fn();
    subscribeToPlayback(onUpdate)();

    emitPlayback(update());
    await new Promise((r) => setTimeout(r, 10));

    expect(onUpdate).not.toHaveBeenCalled();
  });
});
