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
  // 10 bits per frequency, 12 for the delta: exactly 32 bits.
  //
  // `>>> 0` is load-bearing, not decoration. JavaScript's bitwise operators produce
  // *signed* 32-bit results, so any pair with `binA >= 512` — which at a 2048-point FFT
  // is everything above about 5.5kHz, meaning most of the harmonic content of speech
  // and music — comes back negative. References travel over the wire as a Uint32Array,
  // which stores the same bits unsigned, so a reference read back would key on
  // 3284828161 while a live sample looked up -1010139135. Half of every landmark set
  // would simply never be found, with no error anywhere: the feature would just work
  // half as well as it should and nothing would say why.
  return (((binA & 0x3ff) << 22) | ((binB & 0x3ff) << 12) | (deltaFrames & 0xfff)) >>> 0;
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

/**
 * Read packed (hash, frame) pairs back as a sample rather than as a reference.
 *
 * The same bytes serve both roles: a stored contribution is a reference when something
 * is being located *in* it, and a sample when it is being located *in something else*.
 * Cross-validating two contributions needs both directions.
 */
export function unpackHashes(packed: Uint32Array): Hash[] {
  const hashes: Hash[] = [];
  for (let i = 0; i + 1 < packed.length; i += 2) {
    hashes.push({ hash: packed[i], frame: packed[i + 1] });
  }
  return hashes;
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
   *
   * **It does not say how likely the position is to be right, and must not be read that
   * way.** `docs/research/12-what-a-match-knows.md` measured the two against each other
   * over 300 probes: noise drives this number from 0.90 to 0.24 without moving the
   * position at all, and self-similar audio destroys the position without moving this
   * number. Pearson r = 0.030. The signal that does say something about the position is
   * `ambiguous`, below.
   */
  confidence: number;
  /**
   * The best-supported offset that is somewhere *else* in the episode.
   *
   * The vote is over every candidate offset and only the winner was ever reported. The
   * runner-up is the discarded half of the answer, and it is the half that knows the
   * difference between *this audio occurs here* and *this audio occurs here and also
   * over there* — which is precisely what confidence cannot tell you.
   *
   * Absent when nothing outside the winner's own neighbourhood got a vote.
   */
  alternative?: { offsetFrames: number; score: number };
  /**
   * True when the runner-up's vote is close enough to the winner's that the evidence
   * does not choose between them.
   *
   * This is the second signal `docs/research/12-what-a-match-knows.md` asked for. Of the
   * 33 probes in that run that landed inside a verbatim-repeated stretch, 33 were placed
   * wrong — always 725,995ms out, at up to 93% sure — because both copies are
   * hash-identical and therefore both collect very nearly the whole vote. Which one wins
   * is decided by a rounding difference, not by the audio.
   *
   * A flag rather than a refusal, deliberately. Repeated audio is title sequences,
   * recaps and reprises, which is exactly where somebody is likely to be watching, and a
   * matcher that goes silent there is useless when it is most wanted. So the match is
   * still returned, still with its position, and the callers that can lose something by
   * acting on it — `shouldCorrect`, and the sentence a screen shows — are the ones that
   * treat it differently.
   *
   * `agreement.ts` reads neither field, which is a decision rather than an oversight. It
   * places two whole *contributions* against each other, not a six-second window, so a
   * repeated stretch is a small fraction of what is voting and the true offset keeps a
   * commanding lead — and its own `minOverlapMs` of 15,000 already refuses to compare two
   * contributions on less than fifteen seconds of shared audio. A six-second probe inside
   * a title sequence is the opposite case, and is the one this exists for. Worth
   * revisiting if that floor is ever lowered.
   */
  ambiguous: boolean;
}

/**
 * How far apart two offsets have to be before they are two *places* rather than one
 * answer with jitter.
 *
 * 1.5 seconds, which is not a new number: it is `shouldCorrect`'s own floor, the
 * distance below which this product has already decided a difference in position is not
 * worth acting on. Offsets closer together than that cannot disagree about anything
 * anybody would do, so counting a neighbour 200ms away as a rival would flag every
 * ordinary match as ambiguous and the flag would mean nothing.
 *
 * **The calibration does not support this number, and cannot, which is worth saying
 * plainly rather than implying otherwise.** Swept from 1 frame to 258 across the 300
 * probes, the worst runner-up among probes in unique audio was 0.0149 at *every*
 * separation — the constant changes nothing there. That is a property of the fixture:
 * its frames are independently drawn, so a landmark at frame f has no reason to also
 * match at f±1 and the vote has no shoulders. Real audio is continuous, adjacent frames
 * share content, and a true peak arrives with shoulders a few frames wide — which is
 * what this exists to keep out of the runner-up. So it is justified by the mechanism and
 * by the product's own definition of the same place, and the measurement is silent on
 * it. A fixture that could speak to it would need temporally correlated frames, which is
 * a change to `design/calibrate.mjs` and not to this.
 */
const SAME_PLACE_FRAMES = Math.round((1.5 * SAMPLE_RATE) / HOP_SIZE);

/**
 * How close a runner-up's vote has to come before the winner is not decided by evidence.
 *
 * **Half: the winner is decided when it has more than twice the support of anything
 * else.** The two populations the calibration produces do not overlap, they do not come
 * close, and the number is not interpolated between them — over the 300 probes of
 * `docs/research/12-what-a-match-knows.md`, re-read for the runner-up rather than the
 * winner and classified by whether the probe's own six seconds were duplicated audio:
 *
 * | window | n | placed wrong | worst runner-up / winner |
 * | --- | --- | --- | --- |
 * | in unique audio | 228 | 0 | **0.0149** |
 * | wholly inside a copied stretch | 65 | 33 | **1.0000** — every one |
 * | straddling the edge of one | 7 | 0 | 0.8864 |
 *
 * A real offset is carried by scores of independent landmarks and nothing else in the
 * episode gets near it; two verbatim copies draw the same landmarks and split the vote
 * dead even. Sixty-seven times apart, with nothing in between. Any threshold from 0.02 to
 * 1.0 catches all 33 wrong placements and flags none of the 228 unique ones, so the
 * measurement does not pick the number — it only says the number is not delicate. What
 * picks it is what each edge of that band costs:
 *
 *  - **Low, near 0.02.** A shade over the worst clean margin sounds ample and is not,
 *    because that margin is not a floor — it is a rising function of how bad the input
 *    is, and the calibration only sweeps as far as its own noise model goes. Across the
 *    228 unique-audio probes, by noise level:
 *
 *    | noise | 0.5 | 1.0 | 1.5 | 2.0 | 2.5 | 3.0 |
 *    | --- | --- | --- | --- | --- | --- | --- |
 *    | median rival | 0.0012 | 0.0014 | 0.0024 | 0.0045 | 0.0063 | 0.0093 |
 *    | worst rival | 0.0018 | 0.0022 | 0.0047 | 0.0088 | 0.0102 | **0.0149** |
 *
 *    Eightfold, monotonic, and still climbing where the sweep stops. Noise scatters
 *    spurious landmarks and some of them land together on some other offset, so the
 *    clean runner-up is the first quantity a real room inflates — and a real room is
 *    also a microphone and a codec, none of which this fixture has. 0.0149 is what the
 *    worst *modelled* input gives; nothing here bounds the worst real one. A threshold
 *    set just above it would start calling good matches ambiguous as soon as conditions
 *    left the model, and an ambiguous flag refuses legitimate large jumps — the recap
 *    skip the feature exists for.
 *  - **High, near 0.95.** It catches everything in the table, because the fixture copies
 *    the audio *verbatim* and the doc says so in as many words. Real repetition mostly is
 *    not: a reprise is re-recorded, a theme is at a different mix, a sting sits over
 *    different dialogue. Those split the vote unevenly, which is what the straddling row
 *    above shows by accident — genuinely two-place windows landing at 0.51, 0.74, 0.89. A
 *    threshold up there would be fitted to the fixture and would miss the phenomenon.
 *
 * Half is 33× above the worst measured clean margin, and it puts the whole 0.5–1.0 band —
 * where uneven, non-verbatim, real repetition lives — on the ambiguous side. It is also
 * the only value in the band that means something without the table: below it the winner
 * has more than twice the evidence of any rival, which is a decision; at or above it,
 * which one won turns on less than a factor of two.
 */
const AMBIGUOUS_VOTE_RATIO = 0.5;

/**
 * Locate a sample within a reference by offset voting.
 *
 * Every shared hash proposes an offset. The true offset accumulates votes from many
 * independent landmarks while spurious matches scatter, so the winner stands out
 * sharply — which is also what makes a wrong episode fail to match rather than
 * returning a plausible-looking answer.
 *
 * Except when the episode contains the same audio twice, which television does
 * constantly. Then there are two winners, they are the same size, and this reports the
 * one it happened to reach first while sounding as certain as ever. So the runner-up is
 * reported alongside, and `ambiguous` says whether the gap between them decided anything.
 */
export function matchSample(
  sample: Hash[],
  reference: Reference,
  opts: {
    minScore?: number;
    minConfidence?: number;
    /** Offsets nearer the winner than this are the same place, not a rival. */
    separationFrames?: number;
    /** Runner-up vote share, relative to the winner's, at or above which the answer is not decided. */
    ambiguousRatio?: number;
  } = {},
): MatchResult | undefined {
  const minScore = opts.minScore ?? 5;
  const minConfidence = opts.minConfidence ?? 0.15;
  const separationFrames = opts.separationFrames ?? SAME_PLACE_FRAMES;
  const ambiguousRatio = opts.ambiguousRatio ?? AMBIGUOUS_VOTE_RATIO;

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

  // Ties broken by the earlier offset, which is arbitrary but *fixed*. The comparison
  // used to be `score > bestScore` alone, so two offsets with equal votes — exactly what
  // duplicated audio produces — were separated by whichever the Map happened to yield
  // first. That is insertion order, which is the order landmarks were hashed in, which
  // depends on the noise: the same episode and the same sample could be placed twelve
  // minutes apart on two runs with nothing to say why. Deciding it here does not make
  // the answer right, it makes it reproducible, which is what lets the ambiguity below
  // be tested at all.
  let bestOffset = 0;
  let bestScore = 0;
  let found = false;
  for (const [offset, score] of votes) {
    if (!found || score > bestScore || (score === bestScore && offset < bestOffset)) {
      bestScore = score;
      bestOffset = offset;
      found = true;
    }
  }

  const confidence = bestScore / matched;
  // Both bars matter: a handful of votes is noise however dominant, and a large but
  // evenly-spread vote is a coincidence rather than a match.
  if (bestScore < minScore || confidence < minConfidence) return undefined;

  // The second pass, over the same votes: the strongest offset that is somewhere else.
  // Neighbours of the winner are skipped rather than counted — a landmark one frame out
  // is the same placement, and letting it stand as the runner-up would make every match
  // look contested.
  let altOffset = 0;
  let altScore = 0;
  let altFound = false;
  for (const [offset, score] of votes) {
    if (Math.abs(offset - bestOffset) < separationFrames) continue;
    if (!altFound || score > altScore || (score === altScore && offset < altOffset)) {
      altScore = score;
      altOffset = offset;
      altFound = true;
    }
  }

  return {
    offsetFrames: bestOffset,
    score: bestScore,
    confidence,
    ...(altFound ? { alternative: { offsetFrames: altOffset, score: altScore } } : {}),
    ambiguous: altFound && altScore >= bestScore * ambiguousRatio,
  };
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
