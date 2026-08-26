import { describe, expect, it } from 'vitest';
import { ContinuousMatcher, framesForMs, positionNow, shouldCorrect } from './continuous.ts';
import { SpectrogramStream } from './stream.ts';
import { spectrogramFromPcm } from './spectrogram.ts';
import {
  CAPTURE_MS,
  HOP_SIZE,
  SAMPLE_RATE,
  buildReference,
  fingerprint,
  framesToMs,
} from './fingerprint.ts';

/**
 * A stand-in for an episode's soundtrack.
 *
 * Real audio is what this ultimately has to work on and none of it is in the repo, so
 * the next best thing is a signal with the property that matters: a spectrum that keeps
 * changing, so that any six seconds of it are distinguishable from any other six. A
 * steady tone would match everywhere and prove nothing.
 *
 * Deterministic by construction — a seeded generator rather than `Math.random`, so a
 * failure is a failure every time rather than once a fortnight.
 */
function syntheticEpisode(seconds: number, rate: number): Float32Array {
  const samples = new Float32Array(Math.round(seconds * rate));
  let seed = 12345;
  const next = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const segment = Math.round(rate * 0.2);
  for (let start = 0; start < samples.length; start += segment) {
    // Three tones per segment, redrawn each time, all well below Nyquist at 22.05kHz.
    const tones = [300 + next() * 2500, 300 + next() * 2500, 300 + next() * 2500];
    const end = Math.min(start + segment, samples.length);
    for (let i = start; i < end; i++) {
      // Absolute time, not time-within-segment: phase must run continuously or every
      // segment boundary becomes a click, which is a landmark of its own.
      const t = i / rate;
      let value = 0;
      for (const hz of tones) value += Math.sin(2 * Math.PI * hz * t);
      samples[i] = value / tones.length;
    }
  }
  return samples;
}

const EPISODE_SECONDS = 40;

/** The reference the crowd contributed, built at the analysis rate. */
const reference = buildReference(
  fingerprint(spectrogramFromPcm(syntheticEpisode(EPISODE_SECONDS, SAMPLE_RATE))),
);

/** The same audio as a phone microphone would deliver it: 48kHz, in small buffers. */
function microphoneChunks(fromMs: number, toMs: number, rate = 48_000): Float32Array[] {
  const whole = syntheticEpisode(EPISODE_SECONDS, rate);
  const slice = whole.slice(Math.round((fromMs / 1000) * rate), Math.round((toMs / 1000) * rate));

  const out: Float32Array[] = [];
  for (let offset = 0; offset < slice.length; offset += 2048) {
    out.push(slice.slice(offset, offset + 2048));
  }
  return out;
}

function feed(matcher: ContinuousMatcher, fromMs: number, toMs: number, rate = 48_000) {
  const stream = new SpectrogramStream({ sourceRate: rate });
  const matches = [];
  for (const chunk of microphoneChunks(fromMs, toMs, rate)) {
    const match = matcher.push(stream.push(chunk));
    if (match) matches.push(match);
  }
  return matches;
}

describe('framesForMs', () => {
  it('converts using the analysis rate', () => {
    // Six seconds at 22050/512 frames per second.
    expect(framesForMs(CAPTURE_MS)).toBe(Math.round((CAPTURE_MS / 1000) * (SAMPLE_RATE / HOP_SIZE)));
  });

  it('never returns zero, however short the window', () => {
    expect(framesForMs(1)).toBe(1);
  });
});

describe('ContinuousMatcher', () => {
  it('recovers the position from audio captured at a different sample rate', () => {
    const matcher = new ContinuousMatcher({ reference });
    const matches = feed(matcher, 12_000, 20_000);

    expect(matches.length).toBeGreaterThan(0);
    const last = matches[matches.length - 1];

    // A match reports where playback was when its window closed, which is not the same
    // as where the feed ended — the last attempt happens at the last interval boundary,
    // up to an interval earlier. So check the position against the frame it was taken
    // at, which is the claim the type actually makes.
    const expected = 12_000 + framesToMs(last.atFrame + 1, HOP_SIZE, SAMPLE_RATE);
    expect(Math.abs(last.positionMs - expected)).toBeLessThan(60); // under three frames

    expect(last.confidence).toBeGreaterThan(0.5);
  });

  it('ages a match forward to the current frame', () => {
    const matcher = new ContinuousMatcher({ reference });
    const matches = feed(matcher, 12_000, 20_000);
    const last = matches[matches.length - 1];

    // Aged to the frame the feed actually ended on, the answer is the feed's end.
    const aged = positionNow(last, matcher.frameCount - 1);
    expect(Math.abs(aged - 20_000)).toBeLessThan(120);

    // And ageing to its own frame changes nothing.
    expect(positionNow(last, last.atFrame)).toBe(last.positionMs);
  });

  it('keeps reporting as the episode runs on, rather than answering once', () => {
    // The whole reason this exists: a paused or skipped stream is corrected minutes
    // later, not left to a wall clock that has been wrong since the first ad break.
    const matcher = new ContinuousMatcher({ reference });
    const matches = feed(matcher, 5_000, 25_000);

    expect(matches.length).toBeGreaterThan(3);
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i].positionMs).toBeGreaterThan(matches[i - 1].positionMs);
    }
  });

  it('follows a skip instead of averaging across it', () => {
    const matcher = new ContinuousMatcher({ reference });
    feed(matcher, 3_000, 11_000);
    matcher.reset(); // what a real skip looks like once the stale window is dropped
    const after = feed(matcher, 30_000, 38_000);

    expect(after.length).toBeGreaterThan(0);
    // The reported position must land in the second stretch, not somewhere averaged
    // between the two — which is what a matcher that kept the stale window would do.
    const last = after[after.length - 1];
    expect(positionNow(last, matcher.frameCount - 1)).toBeGreaterThan(37_000);
  });

  it('says nothing until it has heard a full window', () => {
    const matcher = new ContinuousMatcher({ reference });
    expect(matcher.ready).toBe(false);
    expect(matcher.attempt()).toBeUndefined();

    const short = feed(matcher, 10_000, 12_000);
    expect(short).toEqual([]);
    expect(matcher.ready).toBe(false);
  });

  it('reports a miss rather than a wrong answer when the audio is silence', () => {
    const misses: number[] = [];
    const matcher = new ContinuousMatcher({ reference, onMiss: (frame) => misses.push(frame) });

    const stream = new SpectrogramStream({ sourceRate: SAMPLE_RATE });
    const silence = new Float32Array(SAMPLE_RATE * 8);
    const matches = matcher.push(stream.push(silence));

    expect(matches).toBeUndefined();
    expect(misses.length).toBeGreaterThan(0);
  });

  it('reports a miss for audio from somewhere else entirely', () => {
    const matcher = new ContinuousMatcher({ reference });
    const stream = new SpectrogramStream({ sourceRate: SAMPLE_RATE });

    // A different seed's worth of noise: structured audio, wrong episode.
    const other = new Float32Array(SAMPLE_RATE * 8);
    let seed = 99;
    for (let i = 0; i < other.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      other[i] = seed / 0x7fffffff - 0.5;
    }

    expect(matcher.push(stream.push(other))).toBeUndefined();
  });

  it('honours the interval rather than matching on every single frame', () => {
    let attempts = 0;
    const matcher = new ContinuousMatcher({
      reference,
      intervalFrames: 40,
      onMatch: () => attempts++,
      onMiss: () => attempts++,
    });
    feed(matcher, 10_000, 20_000);

    // Ten seconds is roughly 430 frames; at one attempt per 40 there should be about
    // ten, and certainly not hundreds.
    expect(attempts).toBeGreaterThan(3);
    expect(attempts).toBeLessThan(20);
  });
});

describe('shouldCorrect', () => {
  it('ignores a match that agrees with the clock', () => {
    expect(shouldCorrect(60_000, 60_400)).toBe(false);
  });

  it('acts on a real drift', () => {
    expect(shouldCorrect(60_000, 64_000)).toBe(true);
  });

  it('follows a skipped recap, which is large and legitimate', () => {
    expect(shouldCorrect(30_000, 120_000)).toBe(true);
  });

  it('refuses a jump too large to be anything but a bad match', () => {
    expect(shouldCorrect(60_000, 60 * 60_000)).toBe(false);
  });

  it('works backwards as well, for scrubbing back to rewatch a scene', () => {
    expect(shouldCorrect(600_000, 540_000)).toBe(true);
  });

  /**
   * Both bounds, to the millisecond.
   *
   * Every case above sits well inside or well outside — 400ms against a 1.5s floor, an
   * hour against a fifteen-minute ceiling — so §6.77 could move either bound and nothing
   * failed. They are the two decisions this function exists to make: below the floor a
   * correction is jitter on somebody's timecode while they are watching, and above the
   * ceiling it is a bad match dragging them somewhere they never were.
   */
  it('acts from exactly the floor upwards, and not just below it', () => {
    expect(shouldCorrect(60_000, 61_500)).toBe(true);
    expect(shouldCorrect(60_000, 61_499)).toBe(false);
  });

  it('follows a jump of exactly the ceiling, and nothing past it', () => {
    expect(shouldCorrect(60_000, 60_000 + 15 * 60_000)).toBe(true);
    expect(shouldCorrect(60_000, 60_001 + 15 * 60_000)).toBe(false);
  });
});
