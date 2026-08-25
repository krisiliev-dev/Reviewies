/**
 * Audio fingerprinting for automatic Watching Mode sync.
 *
 * The landmark-pair approach: find spectral peaks, pair nearby ones, and hash each
 * pair into a compact integer. Two recordings of the same audio produce overlapping
 * hash sets even through room noise, because peaks survive what fine detail does not.
 *
 * The problem here is materially easier than Shazam's. We already know *which*
 * episode is playing — the user told us — so this only has to locate a position
 * within one known timeline. No global index over millions of tracks is needed, which
 * is the genuinely expensive part of such a system. That is what makes a per-episode
 * reference file of roughly a megabyte, matched entirely in the browser, viable.
 *
 * Reference timelines are contributed by users who sync manually and opt in. Only
 * hashes are ever uploaded, never audio: a hash is a one-way digest, not a
 * reproduction of the work.
 */

/**
 * Analysis parameters, shared by every capture implementation.
 *
 * They live with the algorithm rather than with the microphone because a reference
 * built at one FFT size cannot be matched against a sample taken at another — so a
 * web recorder and a phone recorder disagreeing here would produce silent, total
 * match failure. Sized in doc 6.
 */
export const FFT_SIZE = 2048;
export const HOP_SIZE = 512;
/**
 * Every capture is resampled to this before analysis.
 *
 * The rate is part of the fingerprint just as much as the FFT size is: it decides
 * which frequency each bin stands for, so a reference built at 44.1kHz and a sample
 * taken at 48kHz share no landmarks at all. Microphones deliver whatever the hardware
 * feels like — 48000 on most phones, 44100 on most laptops — so every path resamples
 * to this one number rather than trusting what it was handed.
 */
export const SAMPLE_RATE = 22_050;
/** Enough audio to be distinctive; short enough not to feel like surveillance. */
export const CAPTURE_MS = 6000;

export interface Peak {
  /** Frame index — time, in units of the hop size. */
  frame: number;
  /** Frequency bin. */
  bin: number;
}

export interface Hash {
  /** Packed landmark hash. */
  hash: number;
  /** Frame of the anchor peak. */
  frame: number;
}

export interface FingerprintOptions {
  /** Peaks kept per frame. Higher is more robust and larger. */
  peaksPerFrame?: number;
  /** How far ahead an anchor looks for partners, in frames. */
  fanoutFrames?: number;
  /** Partners paired with each anchor. */
  fanout?: number;
}

const DEFAULTS = {
  peaksPerFrame: 3,
  fanoutFrames: 24,
  fanout: 3,
} as const;

/**
 * Pick the strongest spectral peaks in each frame.
 *
 * Peaks rather than raw magnitudes because they survive volume changes, compression
 * and room acoustics — matching raw spectra would fail the moment a phone microphone
 * is involved.
 */
export function findPeaks(
  spectrogram: Float32Array[],
  // Typed as number, not inferred from the `as const` default, which would narrow
  // it to the literal 3 and reject any other value.
  peaksPerFrame: number = DEFAULTS.peaksPerFrame,
): Peak[] {
  const peaks: Peak[] = [];

  spectrogram.forEach((frame, frameIndex) => {
    // Local maxima only: a broad loud region should contribute one peak, not fifty.
    const candidates: Array<{ bin: number; magnitude: number }> = [];
    for (let bin = 1; bin < frame.length - 1; bin++) {
      const magnitude = frame[bin];
      if (magnitude > frame[bin - 1] && magnitude >= frame[bin + 1] && magnitude > 0) {
        candidates.push({ bin, magnitude });
      }
    }

    candidates
      .sort((a, b) => b.magnitude - a.magnitude)
      .slice(0, peaksPerFrame)
      .forEach((c) => peaks.push({ frame: frameIndex, bin: c.bin }));
  });

  return peaks;
}

/**
 * Pack a landmark pair into a single integer.
 *
 * Both frequencies plus the time delta between them. Absolute time is deliberately
 * excluded — that is what lets the same audio match regardless of where it starts,
 * and the offset is recovered later by voting.
 */
export function packHash(binA: number, binB: number, deltaFrames: number): number {
  // 10 bits per frequency, 12 for the delta: comfortably within a 32-bit integer.
  return ((binA & 0x3ff) << 22) | ((binB & 0x3ff) << 12) | (deltaFrames & 0xfff);
}

/** Build landmark hashes from peaks. */
export function hashPeaks(peaks: Peak[], options: FingerprintOptions = {}): Hash[] {
  const fanoutFrames = options.fanoutFrames ?? DEFAULTS.fanoutFrames;
  const fanout = options.fanout ?? DEFAULTS.fanout;

  const sorted = [...peaks].sort((a, b) => a.frame - b.frame || a.bin - b.bin);
  const hashes: Hash[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const anchor = sorted[i];
    let paired = 0;

    for (let j = i + 1; j < sorted.length && paired < fanout; j++) {
      const partner = sorted[j];
      const delta = partner.frame - anchor.frame;
      if (delta <= 0) continue;
      if (delta > fanoutFrames) break; // sorted by frame, so nothing later is closer

      hashes.push({ hash: packHash(anchor.bin, partner.bin, delta), frame: anchor.frame });
      paired++;
    }
  }

  return hashes;
}

export function fingerprint(
  spectrogram: Float32Array[],
  options: FingerprintOptions = {},
): Hash[] {
  return hashPeaks(findPeaks(spectrogram, options.peaksPerFrame), options);
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** A reference timeline for one episode: hash -> frames where it occurs. */
export type Reference = Map<number, number[]>;

export function buildReference(hashes: Hash[]): Reference {
  const reference: Reference = new Map();
  for (const { hash, frame } of hashes) {
    const frames = reference.get(hash);
    if (frames) frames.push(frame);
    else reference.set(hash, [frame]);
  }
  return reference;
}

/** Serialise a reference compactly. Hashes only — never audio. */
export function serialiseReference(reference: Reference): Uint32Array {
  const flat: number[] = [];
  for (const [hash, frames] of reference) {
    for (const frame of frames) {
      flat.push(hash, frame);
    }
  }
  return Uint32Array.from(flat);
}

export function deserialiseReference(packed: Uint32Array): Reference {
  const reference: Reference = new Map();
  for (let i = 0; i + 1 < packed.length; i += 2) {
    const hash = packed[i];
    const frame = packed[i + 1];
    const frames = reference.get(hash);
    if (frames) frames.push(frame);
    else reference.set(hash, [frame]);
  }
  return reference;
}

export interface MatchResult {
  /** Frame offset of the sample within the reference. */
  offsetFrames: number;
  /** Votes for the winning offset. */
  score: number;
  /**
   * The share of matched landmarks that agreed on the winning offset.
   *
   * Deliberately measured against the landmarks that matched *something*, not against
   * every vote cast. A hash that recurs through an episode votes once per place it
   * occurs, so counting all votes makes confidence fall as the reference gets longer:
   * the same six seconds of audio would read as confident against a five-minute
   * reference and as noise against a forty-minute one, purely because of length. That
   * is length-sensitivity dressed up as uncertainty. Measured this way, a match where
   * every recognised landmark points at one offset is 1.0 however long the episode is,
   * and scattered agreement is low however short it is.
   */
  confidence: number;
}

/**
 * Locate a sample within a reference by offset voting.
 *
 * Every shared hash proposes an offset. The true offset accumulates votes from many
 * independent landmarks while spurious matches scatter, so the winner stands out
 * sharply — which is also what makes a wrong episode fail to match rather than
 * returning a plausible-looking answer.
 */
export function matchSample(
  sample: Hash[],
  reference: Reference,
  opts: { minScore?: number; minConfidence?: number } = {},
): MatchResult | undefined {
  const minScore = opts.minScore ?? 5;
  const minConfidence = opts.minConfidence ?? 0.15;

  const votes = new Map<number, number>();
  // Landmarks that matched anything at all. One sample hash can only ever vote once
  // for a given offset, so the winning score can never exceed this — which is what
  // keeps confidence a genuine fraction.
  let matched = 0;

  for (const { hash, frame } of sample) {
    const frames = reference.get(hash);
    if (!frames) continue;
    matched++;
    for (const referenceFrame of frames) {
      const offset = referenceFrame - frame;
      votes.set(offset, (votes.get(offset) ?? 0) + 1);
    }
  }

  if (matched === 0) return undefined;

  let bestOffset = 0;
  let bestScore = 0;
  for (const [offset, score] of votes) {
    if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }

  const confidence = bestScore / matched;
  // Both bars matter: a handful of votes is noise however dominant, and a large but
  // evenly-spread vote is a coincidence rather than a match.
  if (bestScore < minScore || confidence < minConfidence) return undefined;

  return { offsetFrames: bestOffset, score: bestScore, confidence };
}

/** Convert a frame offset to milliseconds. */
export function framesToMs(frames: number, hopSize: number, sampleRate: number): number {
  return (frames * hopSize * 1000) / sampleRate;
}

/**
 * Estimate a reference's size on the wire.
 *
 * Used to sanity-check the per-episode budget: research doc 6 sized this at roughly
 * a megabyte per hour, which is what makes downloading one episode's timeline to the
 * client reasonable.
 */
export function estimateBytes(reference: Reference): number {
  let entries = 0;
  for (const frames of reference.values()) entries += frames.length;
  return entries * 8; // two uint32s per entry
}
