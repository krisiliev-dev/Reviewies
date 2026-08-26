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

  /**
   * The floor itself, and an empty recording.
   *
   * A second either side of the bar left it free to move: §6.77 shifted it and nothing
   * failed. Zero frames is the other edge — a microphone that never delivered anything —
   * and the guard for it was written but never driven.
   */
  it('draws the line at the floor rather than near it', () => {
    // Ceiling rather than `framesFor`, which rounds: the boundary is the first frame
    // count whose duration actually reaches the floor, and rounding to the nearest frame
    // can land a millisecond short of it.
    const atTheFloor = Math.ceil((MIN_REFERENCE_MS * SAMPLE_RATE) / 1000 / HOP_SIZE);
    expect(tooShortToContribute(atTheFloor, HOP_SIZE, SAMPLE_RATE)).toBe(false);
    expect(tooShortToContribute(atTheFloor - 1, HOP_SIZE, SAMPLE_RATE)).toBe(true);
  });

  /**
   * Three mutants here are unkillable, and the arithmetic says why.
   *
   * A recording's length is always a whole number of hops: 512 samples at 22,050Hz, so
   * 23.22ms each. Twenty seconds is 861.3 of them, which no recording can be — so
   * `duration < MIN_REFERENCE_MS` and `<=` cannot disagree, ever. The same goes for the
   * two mutations of the zero-frame guard: a recording of zero or one frames is far
   * under the floor and the line below returns true regardless.
   *
   * Recorded rather than worked around. §6.77.
   */
  it('refuses a recording of nothing at all', () => {
    expect(tooShortToContribute(0, HOP_SIZE, SAMPLE_RATE)).toBe(true);
    // A negative count should not read as "long enough" through the arithmetic below.
    expect(tooShortToContribute(-5, HOP_SIZE, SAMPLE_RATE)).toBe(true);
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
