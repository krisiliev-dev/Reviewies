import { describe, expect, it } from 'vitest';
import { HOP_SIZE, SAMPLE_RATE } from './fingerprint.ts';
import { CONTRIBUTION_MS, MIN_REFERENCE_MS, tooShortToContribute } from './references.ts';

const framesFor = (ms: number) => Math.round((ms * SAMPLE_RATE) / 1000 / HOP_SIZE);

/**
 * The floor on a contributed reference.
 *
 * It was the phone's own rule and the web had none — the web recorded a fixed thirty
 * seconds and uploaded whatever came back, so a recording cut short by a lost microphone
 * became a reference everybody else was matched against. §6.52.
 */
describe('too short to contribute', () => {
  it('refuses a recording under the floor', () => {
    expect(tooShortToContribute(framesFor(MIN_REFERENCE_MS - 1000), HOP_SIZE, SAMPLE_RATE)).toBe(true);
    expect(tooShortToContribute(framesFor(3000), HOP_SIZE, SAMPLE_RATE)).toBe(true);
  });

  it('accepts one at or over it', () => {
    expect(tooShortToContribute(framesFor(MIN_REFERENCE_MS + 1000), HOP_SIZE, SAMPLE_RATE)).toBe(false);
    expect(tooShortToContribute(framesFor(CONTRIBUTION_MS), HOP_SIZE, SAMPLE_RATE)).toBe(false);
  });

  it('refuses nothing at all', () => {
    // The case that was already checked, kept: zero frames is a microphone that never
    // started, and it reads as a bug rather than as a short recording.
    expect(tooShortToContribute(0, HOP_SIZE, SAMPLE_RATE)).toBe(true);
  });

  it('records for longer than it demands', () => {
    // A recording length equal to the floor would fail on any dropped frame at all.
    expect(CONTRIBUTION_MS).toBeGreaterThan(MIN_REFERENCE_MS);
  });
});
