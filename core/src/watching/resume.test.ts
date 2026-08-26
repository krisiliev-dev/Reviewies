import { beforeEach, describe, expect, it } from 'vitest';
import { forget, remember, resumeFor, STALE_AFTER_MS } from './resume.ts';

/**
 * The rule: coming back should look like nobody left. A clock that was running kept
 * running; a paused one did not.
 */
const NOW = 1_700_000_000_000;

beforeEach(() => forget());

describe('resuming an episode', () => {
  it('has nothing to say before anything is watched', () => {
    expect(resumeFor('tmdb:ep:1', NOW)).toBeUndefined();
  });

  it('brings a paused clock back where it was', () => {
    remember({ targetId: 'tmdb:ep:1', positionMs: 754_000, running: false, at: NOW });
    expect(resumeFor('tmdb:ep:1', NOW + 90_000)?.positionMs).toBe(754_000);
  });

  it('advances a running clock by the time that passed', () => {
    // The episode did not stop because you left the screen.
    remember({ targetId: 'tmdb:ep:1', positionMs: 754_000, running: true, at: NOW });
    expect(resumeFor('tmdb:ep:1', NOW + 90_000)?.positionMs).toBe(844_000);
  });

  it('keeps whether it was running, so it comes back moving', () => {
    remember({ targetId: 'tmdb:ep:1', positionMs: 1000, running: true, at: NOW });
    expect(resumeFor('tmdb:ep:1', NOW + 1000)?.running).toBe(true);
  });

  it('says nothing about a different episode', () => {
    remember({ targetId: 'tmdb:ep:1', positionMs: 754_000, running: false, at: NOW });
    expect(resumeFor('tmdb:ep:2', NOW)).toBeUndefined();
  });

  it('forgets last night', () => {
    // Resuming an episode from four hours ago is a surprise, not a convenience.
    remember({ targetId: 'tmdb:ep:1', positionMs: 754_000, running: false, at: NOW });
    expect(resumeFor('tmdb:ep:1', NOW + STALE_AFTER_MS + 1)).toBeUndefined();
    expect(resumeFor('tmdb:ep:1', NOW + STALE_AFTER_MS - 1)).toBeDefined();
  });

  it('distrusts a record from the future', () => {
    // A device whose clock moved would otherwise resume at a negative elapsed time.
    remember({ targetId: 'tmdb:ep:1', positionMs: 1000, running: true, at: NOW + 600_000 });
    expect(resumeFor('tmdb:ep:1', NOW)).toBeUndefined();
  });

  it('survives a stored value that is not what it expects', () => {
    remember({ targetId: 'tmdb:ep:1', positionMs: Number.NaN, running: false, at: NOW });
    expect(resumeFor('tmdb:ep:1', NOW)).toBeUndefined();
  });

  it('is forgotten on request', () => {
    remember({ targetId: 'tmdb:ep:1', positionMs: 1000, running: false, at: NOW });
    forget();
    expect(resumeFor('tmdb:ep:1', NOW)).toBeUndefined();
  });
});
