/**
 * Does the confidence a match reports predict how far off its position is?
 *
 * ## Why this exists
 *
 * Watching Mode says *"Following along, 73% sure"* and *"Synced, 73% sure"*.
 * `docs/design/seams.md` §7 argues that is the wrong shape: Chalmers & Galani's
 * prescription for a sensed position is an **extent rather than a point**, and an extent
 * would pass the agency test where a percentage does not — nobody behaves differently at
 * 73% than at 62%, but *"within about two seconds"* tells you whether to nudge.
 *
 * The document filed the repair rather than making it, because turning a share into a
 * tolerance needs a number nobody had measured. This is that measurement, and the
 * question is prior to the design one: **does vote-share predict positional error at
 * all?** There is direct evidence in the repository that it might not —
 * `agreement.ts` records the same audio measuring 0.46 one way and 0.17 the other,
 * "for no reason except which microphone was worse". A number that halves because of the
 * microphone while the position is identical is not describing the position.
 *
 * Three outcomes, all of them worth having:
 *
 * - it predicts well → the sentence becomes an extent, with a bound this file states;
 * - it predicts weakly → the honest revelation is a coarse band, not a number;
 * - it does not predict → the percentage stays, and the refusal in `seams.md` has a
 *   measurement behind it instead of an argument.
 *
 * ## What this is not
 *
 * Synthetic spectrograms through the real matcher. No microphone, no room, no codec —
 * the degradation model is the test suite's (`fingerprint.test.ts`), which scales the
 * spectrum and adds a noise floor. So this measures **the matcher's behaviour under a
 * stated noise model**, which is the thing a tolerance would have to be derived from,
 * and not the field. Every conclusion below inherits that caveat and the file says so
 * again at the end rather than only here.
 *
 * Run: `node design/calibrate.mjs [--trials N] [--json]`
 */

import {
  FFT_SIZE,
  HOP_SIZE,
  SAMPLE_RATE,
  buildReference,
  framesToMs,
  hashPeaks,
  findPeaks,
  matchSample,
} from '../core/src/fingerprint/fingerprint.ts';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const trials = Number(args[args.indexOf('--trials') + 1]) || 400;

/**
 * Deterministic LCG. No `Math.random` anywhere here — a calibration that cannot be
 * reproduced is an anecdote.
 *
 * **Warmed up, and the warm-up is a finding rather than a formality.** The first draw
 * from an LCG seeded with sequential integers is not random: it is very nearly a linear
 * function of the seed. This instrument's first version drew the probe's position in the
 * episode from `lcg(seed * 7 + 3)()`, and across trials 0, 1 and 2 that returned 0.9501,
 * 0.9528 and 0.9555 — every probe landing at about 95% through the episode, drifting by a
 * quarter of a percent per trial.
 *
 * Two of this file's own claims were false because of it. The probe position was
 * advertised as swept and was nearly constant. And the repeated-audio fixture, added
 * specifically to produce a confident *wrong* answer, sits at 60–85% of the episode:
 * **zero of sixty probes ever landed in it.** The instrument reported "0 wrong at 25%
 * repeat" while never once testing the case, which is the fifth time in this record an
 * instrument has omitted its own subject — and the first in one written the same hour as
 * the entry about that failure.
 *
 * Sixteen discarded draws, which is past the point where sequential seeds have decorrelated.
 */
function lcg(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  for (let i = 0; i < 16; i++) next();
  return next;
}

/**
 * An episode's spectrogram.
 *
 * Same shape as `fingerprint.test.ts`'s fixture and for the same stated reason: the real
 * bin count, because a 128-bin fixture cannot reach the value where `packHash` goes
 * negative and hid a bug for months.
 */
function episode(frameCount, seed) {
  const bins = FFT_SIZE / 2;
  const rand = lcg(seed);
  return Array.from({ length: frameCount }, () => {
    const frame = new Float32Array(bins);
    for (let t = 0; t < 4; t++) {
      frame[5 + Math.floor(rand() * (bins - 10))] = 1 + rand();
    }
    return frame;
  });
}

/**
 * A microphone in a room, at a stated severity.
 *
 * `noise` is the noise floor as a fraction of a peak's height. The suite's own `degrade`
 * uses 0.05 against a 0.6 gain; this sweeps it, because the whole question is whether
 * confidence tracks *conditions* or tracks *position*.
 */
function heard(frames, noise, seed) {
  const rand = lcg(seed);
  return frames.map((frame) => {
    const out = new Float32Array(frame.length);
    for (let i = 0; i < frame.length; i++) out[i] = frame[i] * 0.6 + rand() * noise;
    return out;
  });
}

const PEAKS_PER_FRAME = 3;
const CAPTURE_FRAMES = Math.round((6000 * SAMPLE_RATE) / (HOP_SIZE * 1000)); // the real 6s capture
const EPISODE_FRAMES = Math.round((22 * 60 * 1000 * SAMPLE_RATE) / (HOP_SIZE * 1000)); // 22 minutes

const NOISE_LEVELS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0];

/**
 * How much of the episode is a repeat of some earlier stretch.
 *
 * **This is the case that can produce a confident wrong answer, and the first fixture
 * could not produce it at all.** A random episode has no self-similarity, so the true
 * offset never has a competitor and the matcher is choosing between one real peak and
 * scattered noise. Real television is not like that: a theme, a recurring sting, a
 * silence, a reused cue. Two stretches of identical audio give the vote a genuine second
 * home, and *that* is how a match lands somewhere plausible and wrong rather than simply
 * refusing.
 *
 * §6.43's rule — a fixture smaller than reality is a test that cannot fail — one subject
 * over. Sweeping it, because how repetitive an episode is is exactly the condition a
 * tolerance would have to hold across.
 */
const REPEAT_FRACTIONS = [0, 0.1, 0.25];

const rows = [];
for (let trial = 0; trial < trials; trial++) {
  const seed = 1000 + trial;
  const noise = NOISE_LEVELS[trial % NOISE_LEVELS.length];
  const repeat = REPEAT_FRACTIONS[Math.floor(trial / NOISE_LEVELS.length) % REPEAT_FRACTIONS.length];
  const full = episode(EPISODE_FRAMES, seed);

  /*
   * Copy an early stretch over a later one, so the episode contains itself twice. The
   * source is near the front and the destination in the back half, which is where a
   * reprise actually goes and also puts the two copies far enough apart that a wrong
   * placement is a large error rather than a rounding one.
   */
  if (repeat > 0) {
    const span = Math.floor(EPISODE_FRAMES * repeat);
    const from = Math.floor(EPISODE_FRAMES * 0.05);
    const to = Math.floor(EPISODE_FRAMES * 0.6);
    for (let i = 0; i < span && to + i < EPISODE_FRAMES; i++) full[to + i] = full[from + i];
  }

  const reference = buildReference(hashPeaks(findPeaks(full, PEAKS_PER_FRAME)));

  // Where in the episode the probe is taken from — swept, because a match near an edge
  // has less reference either side of it and that is a real condition, not a nuisance.
  const rand = lcg(seed * 7 + 3);
  const truth = Math.floor(rand() * (EPISODE_FRAMES - CAPTURE_FRAMES));

  /*
   * Did this probe actually land in the copied stretch? Recorded per trial rather than
   * assumed, because the whole point of the repeat fixture is a case that only exists when
   * the probe is inside it, and the first version of this file reported on that case
   * sixty times without producing it once.
   */
  const copiedFrom = Math.floor(EPISODE_FRAMES * 0.05);
  const copiedTo = Math.floor(EPISODE_FRAMES * 0.6);
  const copiedSpan = Math.floor(EPISODE_FRAMES * repeat);
  const inRepeat =
    repeat > 0 && truth >= copiedTo && truth + CAPTURE_FRAMES <= copiedTo + copiedSpan;

  const probe = heard(full.slice(truth, truth + CAPTURE_FRAMES), noise, seed * 13 + 5);
  const match = matchSample(hashPeaks(findPeaks(probe, PEAKS_PER_FRAME)), reference);

  if (!match) {
    rows.push({ trial, noise, repeat, inRepeat, truth, refused: true });
    continue;
  }
  const errFrames = Math.abs(match.offsetFrames - truth);
  rows.push({
    trial,
    noise,
    repeat,
    inRepeat,
    truth,
    refused: false,
    confidence: match.confidence,
    score: match.score,
    errFrames,
    errMs: framesToMs(errFrames, HOP_SIZE, SAMPLE_RATE),
  });
}

const placed = rows.filter((r) => !r.refused);
const refused = rows.length - placed.length;

/** Pearson r, and the reason it is reported with n and a spread rather than alone. */
function correlation(xs, ys) {
  const n = xs.length;
  if (n < 2) return NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

function quantile(sorted, q) {
  if (sorted.length === 0) return NaN;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

const BANDS = [[0, 0.3], [0.3, 0.5], [0.5, 0.7], [0.7, 0.85], [0.85, 1.01]];
const byBand = BANDS.map(([lo, hi]) => {
  const inBand = placed.filter((r) => r.confidence >= lo && r.confidence < hi);
  const errs = inBand.map((r) => r.errMs).sort((a, b) => a - b);
  return {
    band: `${lo.toFixed(2)}–${hi >= 1 ? '1.00' : hi.toFixed(2)}`,
    n: inBand.length,
    exact: inBand.filter((r) => r.errFrames === 0).length,
    median: quantile(errs, 0.5),
    p95: quantile(errs, 0.95),
    worst: errs[errs.length - 1],
  };
});

const byNoise = NOISE_LEVELS.map((noise) => {
  const at = rows.filter((r) => r.noise === noise);
  const ok = at.filter((r) => !r.refused);
  const confs = ok.map((r) => r.confidence).sort((a, b) => a - b);
  const errs = ok.map((r) => r.errMs).sort((a, b) => a - b);
  return {
    noise,
    n: at.length,
    refused: at.length - ok.length,
    medianConfidence: quantile(confs, 0.5),
    medianErrMs: quantile(errs, 0.5),
    exact: ok.filter((r) => r.errFrames === 0).length,
  };
});

const byRepeat = REPEAT_FRACTIONS.map((repeat) => {
  const at = rows.filter((r) => r.repeat === repeat);
  const ok = at.filter((r) => !r.refused);
  const errs = ok.map((r) => r.errMs).sort((a, b) => a - b);
  const wrong = ok.filter((r) => r.errFrames !== 0);
  return {
    repeat,
    n: at.length,
    refused: at.length - ok.length,
    exact: ok.length - wrong.length,
    wrong: wrong.length,
    worstMs: errs.length ? errs[errs.length - 1] : 0,
    /* The one number that matters if any placement is wrong: how sure it was while being wrong. */
    confidentWrong: wrong.length ? Math.max(...wrong.map((w) => w.confidence)) : 0,
  };
});

/**
 * The instrument's check on itself.
 *
 * A run that never places a probe inside the copied stretch has not tested the
 * self-similar case, and must not print a row implying it did. §6.190.
 */
const inRepeat = rows.filter((r) => r.inRepeat);
const repeatUntested = REPEAT_FRACTIONS.some((f) => f > 0) && inRepeat.length === 0;

const r = correlation(placed.map((p) => p.confidence), placed.map((p) => p.errMs));

if (asJson) {
  console.log(JSON.stringify({ trials, refused, repeatUntested, inRepeat: inRepeat.length, byBand, byNoise, byRepeat, r }, null, 2));
} else {
  const frameMs = framesToMs(1, HOP_SIZE, SAMPLE_RATE);
  console.log(`\n${trials} probes, 6.0s each, against a 22-minute reference. One frame = ${frameMs.toFixed(2)}ms.`);
  console.log(`Synthetic spectrograms through the real matcher. No microphone, no room, no codec.\n`);
  console.log(`Refused outright (below the matcher's own bars): ${refused} of ${trials}\n`);

  console.log('Positional error, by the confidence the match reported:');
  console.log('  band        n   exact   median      p95     worst');
  for (const b of byBand) {
    if (b.n === 0) { console.log(`  ${b.band}   0       —        —        —         —`); continue; }
    console.log(
      `  ${b.band}  ${String(b.n).padStart(3)}  ${String(b.exact).padStart(5)}  ` +
      `${b.median.toFixed(1).padStart(7)}ms ${b.p95.toFixed(1).padStart(7)}ms ${b.worst.toFixed(1).padStart(8)}ms`,
    );
  }

  console.log('\nWhat the noise floor does, which is the control:');
  console.log('  noise    n  refused   median conf   median err   exact');
  for (const n of byNoise) {
    console.log(
      `  ${n.noise.toFixed(2)}  ${String(n.n).padStart(3)}  ${String(n.refused).padStart(7)}  ` +
      `${(Number.isNaN(n.medianConfidence) ? 0 : n.medianConfidence).toFixed(3).padStart(11)}   ` +
      `${(Number.isNaN(n.medianErrMs) ? 0 : n.medianErrMs).toFixed(1).padStart(9)}ms  ${String(n.exact).padStart(5)}`,
    );
  }

  console.log('\nWhat self-similar audio does, which is the case that can be confidently wrong:');
  if (repeatUntested) {
    console.log('  NOT TESTED — no probe landed inside a copied stretch in this run.');
    console.log('  Rows below would be a statement about a case that did not occur. Raise --trials.');
  } else {
    console.log(`  ${inRepeat.length} of ${rows.length} probes landed inside a copied stretch.`);
  }
  console.log('  repeat    n  refused   exact   wrong    worst   sure-while-wrong');
  for (const b of byRepeat) {
    console.log(
      `  ${(b.repeat * 100).toFixed(0).padStart(4)}%  ${String(b.n).padStart(3)}  ${String(b.refused).padStart(7)}  ` +
      `${String(b.exact).padStart(6)}  ${String(b.wrong).padStart(6)}  ${b.worstMs.toFixed(0).padStart(7)}ms  ` +
      `${b.confidentWrong ? (b.confidentWrong * 100).toFixed(0) + '%' : '—'}`,
    );
  }

  console.log(`\nPearson r between confidence and error: ${r.toFixed(3)}  (n = ${placed.length})`);
  console.log(
    '\nRead r beside the bands, not instead of them: a coefficient near zero over a set\n' +
    'where almost every error is zero says the errors do not vary, not that confidence is\n' +
    'uninformative. The bands are the answer; r is a summary of them.\n',
  );
}
