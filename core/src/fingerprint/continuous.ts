/**
 * Continuous listening: correcting drift for as long as an episode runs.
 *
 * The one-shot capture the web shipped answers "where am I?" once and then trusts a
 * wall clock for the next forty minutes. That is fine until someone pauses, skips the
 * recap, or the stream stalls to rebuffer — after which every reaction lands in the
 * wrong place and the feature quietly becomes noise. The fix is not a better clock, it
 * is to keep listening.
 *
 * What makes that affordable is that the expensive part has already happened. Frames
 * arrive from `SpectrogramStream` whether or not anyone matches them, so a match is
 * just a fingerprint and a vote over a few hundred frames already in memory. Nothing
 * is recorded, nothing is stored, and nothing leaves the device — the window is
 * overwritten in place as it slides.
 */

import {
  CAPTURE_MS,
  HOP_SIZE,
  SAMPLE_RATE,
  fingerprint,
  framesToMs,
  matchSample,
  type Reference,
} from './fingerprint';

/** Frames needed to cover a given duration at the analysis rate. */
export function framesForMs(ms: number, hopSize = HOP_SIZE, sampleRate = SAMPLE_RATE): number {
  return Math.max(1, Math.round((ms / 1000) * (sampleRate / hopSize)));
}

export interface ContinuousMatch {
  /**
   * Where playback had reached at the end of the analysed window.
   *
   * The end, not the start: a match locates the window's beginning in the reference,
   * and by the time it is reported the window's whole length has already played. The
   * one-shot path makes the same correction by adding the sample length.
   */
  positionMs: number;
  confidence: number;
  score: number;
  /** Frame index of the last frame in the window, so callers can age a result. */
  atFrame: number;
}

/**
 * Bring a match forward to now.
 *
 * A match describes where playback was when the window closed, and matching a window
 * takes real time — up to a whole interval passes before the next attempt. Applying a
 * result as though it were current would set the clock a second or two slow every time
 * it fired, which is a drift correction that adds drift.
 *
 * Frames are the unit rather than wall-clock milliseconds on purpose: audio frames only
 * exist because the hardware delivered the audio, so counting them measures playback
 * even when the app was backgrounded and its timers were throttled.
 */
export function positionNow(
  match: ContinuousMatch,
  currentFrame: number,
  hopSize = HOP_SIZE,
  sampleRate = SAMPLE_RATE,
): number {
  return match.positionMs + framesToMs(Math.max(0, currentFrame - match.atFrame), hopSize, sampleRate);
}

export interface ContinuousMatcherOptions {
  reference: Reference;
  /** How much audio each attempt looks at. Defaults to the one-shot capture length. */
  windowFrames?: number;
  /** How often to attempt, in frames. Defaults to half a window, so windows overlap. */
  intervalFrames?: number;
  hopSize?: number;
  sampleRate?: number;
  /** Refuse anything less certain than this. Above the matcher's own floor. */
  minConfidence?: number;
  onMatch?: (match: ContinuousMatch) => void;
  /** Called when a window produced nothing — usually silence, or the wrong episode. */
  onMiss?: (atFrame: number) => void;
}

/**
 * A sliding window over spectrogram frames that reports its position periodically.
 *
 * Deliberately not a hook and not tied to a clock: it counts frames, and frames come
 * from the audio hardware. Wall-clock timers and audio buffers disagree by design —
 * the hardware runs at its own rate and a phone throttles timers in the background —
 * and counting the thing that actually arrived is what keeps the two from drifting
 * apart over an episode's length.
 */
export class ContinuousMatcher {
  private readonly window: Float32Array[] = [];
  private readonly windowFrames: number;
  private readonly intervalFrames: number;
  private readonly hopSize: number;
  private readonly sampleRate: number;
  private readonly minConfidence: number;
  private seen = 0;
  private lastAttempt = 0;

  private readonly reference: Reference;
  private readonly onMatch?: (match: ContinuousMatch) => void;
  private readonly onMiss?: (atFrame: number) => void;

  constructor(options: ContinuousMatcherOptions) {
    this.reference = options.reference;
    this.onMatch = options.onMatch;
    this.onMiss = options.onMiss;
    this.hopSize = options.hopSize ?? HOP_SIZE;
    this.sampleRate = options.sampleRate ?? SAMPLE_RATE;
    this.windowFrames = options.windowFrames ?? framesForMs(CAPTURE_MS, this.hopSize, this.sampleRate);
    this.intervalFrames = options.intervalFrames ?? Math.max(1, Math.floor(this.windowFrames / 2));
    this.minConfidence = options.minConfidence ?? 0.2;
  }

  /** Frames accepted so far. */
  get frameCount(): number {
    return this.seen;
  }

  /** True once enough audio has arrived for the first attempt. */
  get ready(): boolean {
    return this.window.length >= this.windowFrames;
  }

  push(frames: Float32Array[]): ContinuousMatch | undefined {
    let result: ContinuousMatch | undefined;
    for (const frame of frames) {
      const match = this.pushFrame(frame);
      // Later matches supersede earlier ones — the newest position is the useful one.
      if (match) result = match;
    }
    return result;
  }

  pushFrame(frame: Float32Array): ContinuousMatch | undefined {
    this.window.push(frame);
    this.seen++;
    while (this.window.length > this.windowFrames) this.window.shift();

    if (!this.ready) return undefined;
    if (this.seen - this.lastAttempt < this.intervalFrames) return undefined;
    this.lastAttempt = this.seen;

    return this.attempt();
  }

  /**
   * Match the current window immediately, ignoring the interval.
   *
   * For the moment a user asks to sync now rather than waiting for the next scheduled
   * attempt.
   */
  attempt(): ContinuousMatch | undefined {
    if (!this.ready) return undefined;

    const atFrame = this.seen - 1;
    const hashes = fingerprint(this.window);
    const match = matchSample(hashes, this.reference);

    if (!match || match.confidence < this.minConfidence) {
      this.onMiss?.(atFrame);
      return undefined;
    }

    const result: ContinuousMatch = {
      positionMs:
        framesToMs(match.offsetFrames + this.window.length, this.hopSize, this.sampleRate),
      confidence: match.confidence,
      score: match.score,
      atFrame,
    };
    this.onMatch?.(result);
    return result;
  }

  reset(): void {
    this.window.length = 0;
    this.seen = 0;
    this.lastAttempt = 0;
  }
}

/**
 * Decide whether a reported position is worth acting on.
 *
 * Two separate reasons to ignore a match, and conflating them would be a bug:
 *
 *  - it agrees with the clock already, so correcting would only jitter the timecode;
 *  - it disagrees so wildly that it is more likely a bad match than a real skip.
 *
 * The upper bound is deliberately generous rather than tight. Skipping a recap or
 * scrubbing back to rewatch a scene is a real, large, legitimate jump, and refusing to
 * follow one would make the feature useless exactly when it is most wanted.
 */
export function shouldCorrect(
  clockMs: number,
  matchMs: number,
  opts: { minDriftMs?: number; maxJumpMs?: number } = {},
): boolean {
  const drift = Math.abs(matchMs - clockMs);
  if (drift < (opts.minDriftMs ?? 1500)) return false;
  return drift <= (opts.maxJumpMs ?? 15 * 60_000);
}
