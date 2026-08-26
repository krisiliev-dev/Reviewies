/**
 * Building a reference timeline while the episode plays.
 *
 * Listening is worthless without references, and references only exist because people
 * contribute them. The web contributes by recording thirty seconds, holding the whole
 * spectrogram in memory, and hashing it in one go. That does not scale to an episode:
 * a forty-minute spectrogram is roughly a hundred thousand frames of a thousand floats
 * each, which is hundreds of megabytes, and a phone will be killed for far less.
 *
 * So this hashes as it goes and keeps almost nothing. A landmark pairs an anchor peak
 * with peaks up to `fanoutFrames` ahead of it, so once a frame is that far in the past
 * its anchors can never gain another partner and can be hashed and dropped. What stays
 * in memory is about two dozen frames of peaks — a few hundred bytes — plus the hashes
 * themselves, which are the output and are small.
 *
 * The result is required to be **identical** to hashing the whole spectrogram at once,
 * and that is what the tests assert. Anything else would mean references contributed
 * from a phone and references contributed from a laptop describe the same audio
 * differently, which does not fail loudly — it just quietly never matches.
 *
 * ## Frames are episode time, not recording time
 *
 * `startFrame` is the piece that makes a partial contribution usable. A reference is
 * consulted by voting on `referenceFrame - sampleFrame`, so the frame numbers in it are
 * read as positions *in the episode*. A contribution recorded from twelve minutes in
 * and stamped from zero therefore does not describe a fragment — it claims the episode
 * begins there, and every later viewer who syncs against it is placed twelve minutes
 * early. Stamping absolute frames costs one addition and removes the whole class of
 * error, which is worth doing precisely because the wrong version looks like it works.
 */

import {
  findPeaks,
  hashPeaks,
  type FingerprintOptions,
  type Hash,
  type Peak,
} from './fingerprint.ts';

/** The default fanout window, which sets how far behind the flush point trails. */
const DEFAULT_FANOUT_FRAMES = 24;

export interface ContributionOptions extends FingerprintOptions {
  /**
   * Where in the episode the recording starts, in frames.
   *
   * Zero when mapping from the opening titles. Anything else when someone starts part
   * way through, which is the common case — see the note above about why this is not
   * optional in practice.
   */
  startFrame?: number;
}

export class ContributionRecorder {
  private readonly options: FingerprintOptions;
  private readonly fanoutFrames: number;
  private readonly startFrame: number;
  /** Peaks whose anchors might still gain a partner. Never more than a fanout's worth. */
  private pending: Peak[] = [];
  private hashes: Hash[] = [];
  private recorded = 0;

  constructor(options: ContributionOptions = {}) {
    this.options = options;
    this.fanoutFrames = options.fanoutFrames ?? DEFAULT_FANOUT_FRAMES;
    this.startFrame = Math.max(0, Math.round(options.startFrame ?? 0));
  }

  /** Frames recorded so far. With the hop size, this is the length of the recording. */
  get frameCount(): number {
    return this.recorded;
  }

  /** Where the recording has reached in the episode, in frames. */
  get episodeFrame(): number {
    return this.startFrame + this.recorded;
  }

  /** Landmarks committed so far. Grows steadily; useful for showing progress. */
  get hashCount(): number {
    return this.hashes.length;
  }

  push(frames: Float32Array[]): void {
    for (const frame of frames) this.pushFrame(frame);
  }

  pushFrame(frame: Float32Array): void {
    // findPeaks works over a spectrogram, so hand it one frame and restamp the result
    // with the absolute index. Frame numbers must be relative to the start of the
    // recording, since that is the timeline everyone else's positions are measured in.
    for (const peak of findPeaks([frame], this.options.peaksPerFrame)) {
      this.pending.push({ frame: this.startFrame + this.recorded, bin: peak.bin });
    }
    this.recorded++;
    this.flush(this.episodeFrame - 1 - this.fanoutFrames);
  }

  /**
   * Hash and discard every anchor at or before `uptoFrame`.
   *
   * Safe precisely because a partner is always *later* than its anchor and never more
   * than `fanoutFrames` later, so an anchor that far back has already seen every peak
   * it could ever pair with.
   */
  private flush(uptoFrame: number): void {
    if (uptoFrame < this.startFrame || this.pending.length === 0) return;

    for (const hash of hashPeaks(this.pending, this.options)) {
      if (hash.frame <= uptoFrame) this.hashes.push(hash);
    }
    this.pending = this.pending.filter((peak) => peak.frame > uptoFrame);
  }

  /**
   * Close the recording and return it in the shape the upload expects.
   *
   * Flushes the tail: the last fanout's worth of anchors have not been hashed yet
   * because, until the recording stopped, they could still have gained a partner.
   */
  finish(): { hashes: Uint32Array; frames: number } {
    this.flush(this.episodeFrame - 1);

    const flat = new Uint32Array(this.hashes.length * 2);
    this.hashes.forEach((hash, index) => {
      flat[index * 2] = hash.hash;
      flat[index * 2 + 1] = hash.frame;
    });

    // `frames` is where the reference *ends* in the episode, not how long the
    // recording was. That is what the stored `frame_count` has to mean once frames are
    // episode-absolute, and it is what two contributors are compared on when the
    // backend decides whether they agree.
    return { hashes: flat, frames: this.episodeFrame };
  }

  reset(): void {
    this.pending = [];
    this.hashes = [];
    this.recorded = 0;
  }
}
