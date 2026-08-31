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
import { shouldCorrect } from '../core/src/fingerprint/continuous.ts';

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
  const wholly = (start) => truth >= start && truth + CAPTURE_FRAMES <= start + copiedSpan;
  const inRepeat = repeat > 0 && wholly(copiedTo);
  /*
   * And the *other* copy, which this file counted for a whole sprint without ever saying so.
   *
   * `inRepeat` asks whether the probe landed in the later copy, because that is where a
   * wrong placement shows up as a large error. But the earlier copy is duplicated audio
   * too — a probe inside it is exactly as undecidable, and the matcher is exactly as much
   * guessing. Those probes simply happen to be *scored* correct, because the offset it
   * guessed was the one they were taken from.
   *
   * `copiedFrom` was computed here and never read, which is how the omission looked from
   * the outside: the instrument had the number it needed to notice half its own subject
   * and did not use it. Counting both is what shows that of the 65 probes in duplicated
   * audio, 33 were placed wrong and 32 were right by luck — and "right by luck" and
   * "right" are the two things a calibration exists to distinguish.
   */
  const inCopy = repeat > 0 && (inRepeat || wholly(copiedFrom));

  const probe = heard(full.slice(truth, truth + CAPTURE_FRAMES), noise, seed * 13 + 5);
  const match = matchSample(hashPeaks(findPeaks(probe, PEAKS_PER_FRAME)), reference);

  if (!match) {
    rows.push({ trial, noise, repeat, inRepeat, inCopy, truth, refused: true });
    continue;
  }
  const errFrames = Math.abs(match.offsetFrames - truth);

  /*
   * What Watching Mode would actually *do* with this match, which is the question the
   * first version of this file never asked.
   *
   * Measuring the placement alone understates the defect and overstates the repair. A
   * wrong placement only hurts if something acts on it, and a guard only costs something
   * if it refuses a placement that was right — so both have to be run through the real
   * `shouldCorrect` rather than reasoned about. Two clocks per probe, because the guard
   * behaves differently against each and they are the two situations that matter:
   *
   *  - **following**: the clock is where playback really is, which is the steady state.
   *    A correct match proposes no change; a wrong one proposes a twelve-minute jump, and
   *    whether that is taken is the defect.
   *  - **after a skip**: the clock is 90 seconds behind, because the viewer just skipped
   *    a recap and nothing has caught up yet. Every match now proposes a real jump, and
   *    whether it is taken is the *cost* — a guard that refuses here has broken the
   *    feature to fix the defect.
   *
   * `before` passes no ambiguity, which is precisely the old two-clause guard; `after`
   * passes what the matcher now reports. Same function, so the comparison cannot drift
   * away from the shipped one.
   */
  const positionOf = (frames) => framesToMs(frames + CAPTURE_FRAMES, HOP_SIZE, SAMPLE_RATE);
  const matchMs = positionOf(match.offsetFrames);
  const truthMs = positionOf(truth);
  const flags = {
    ambiguous: match.ambiguous,
    alternativeGapMs: match.alternative
      ? framesToMs(match.alternative.offsetFrames - match.offsetFrames, HOP_SIZE, SAMPLE_RATE)
      : undefined,
  };
  const skippedMs = truthMs - 90_000;

  rows.push({
    trial,
    noise,
    repeat,
    inRepeat,
    inCopy,
    truth,
    refused: false,
    confidence: match.confidence,
    score: match.score,
    errFrames,
    errMs: framesToMs(errFrames, HOP_SIZE, SAMPLE_RATE),
    ambiguous: match.ambiguous,
    /** Runner-up vote as a share of the winner's — 0 when nothing else got a vote. */
    rivalShare: match.alternative ? match.alternative.score / match.score : 0,
    followedBefore: shouldCorrect(truthMs, matchMs),
    followedAfter: shouldCorrect(truthMs, matchMs, flags),
    skipBefore: shouldCorrect(skippedMs, matchMs),
    skipAfter: shouldCorrect(skippedMs, matchMs, flags),
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

/**
 * The runner-up, and what acting on it costs — the second half of this instrument.
 *
 * The tables above establish that confidence cannot see the failure. This one asks
 * whether anything else can, and then whether using it breaks the good case.
 *
 * Split by whether the placement was *right*, rather than by whether the audio repeated,
 * because those are the two things a guard can get wrong and they need separate rows: a
 * guard is judged by how many wrong placements it stops and how many right ones it
 * refuses, and one number over the whole set would trade them against each other
 * invisibly. The flagged column against the correct row is the interesting one — those
 * are matches that were genuinely undecidable and happened to win at the right offset,
 * and the point of the last table is that flagging them costs them nothing.
 */
const wrongPlaced = placed.filter((p) => p.errFrames !== 0);
const rightPlaced = placed.filter((p) => p.errFrames === 0);
const share = (rows) => {
  const xs = rows.map((x) => x.rivalShare).sort((a, b) => a - b);
  return { n: rows.length, min: xs[0] ?? NaN, median: quantile(xs, 0.5), max: xs[xs.length - 1] ?? NaN };
};
const guard = [
  { label: 'placed correctly', rows: rightPlaced },
  { label: 'placed wrong', rows: wrongPlaced },
];

if (asJson) {
  console.log(JSON.stringify({
    trials, refused, repeatUntested, inRepeat: inRepeat.length,
    inCopy: rows.filter((x) => x.inCopy).length, byBand, byNoise, byRepeat, r,
    guard: guard.map((g) => ({
      label: g.label,
      ...share(g.rows),
      flagged: g.rows.filter((x) => x.ambiguous).length,
      followedBefore: g.rows.filter((x) => x.followedBefore).length,
      followedAfter: g.rows.filter((x) => x.followedAfter).length,
      skipBefore: g.rows.filter((x) => x.skipBefore).length,
      skipAfter: g.rows.filter((x) => x.skipAfter).length,
    })),
  }, null, 2));
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
    console.log(`  ${inRepeat.length} of ${rows.length} probes landed inside the later copy.`);
    console.log(
      `  ${rows.filter((r) => r.inCopy).length} landed inside one copy or the other, which is the` +
      ` number\n  of probes the matcher was actually guessing on — the rest of that group is` +
      ` scored\n  correct only because the copy it guessed is the one they came from.`,
    );
  }
  console.log('  repeat    n  refused   exact   wrong    worst   sure-while-wrong');
  for (const b of byRepeat) {
    console.log(
      `  ${(b.repeat * 100).toFixed(0).padStart(4)}%  ${String(b.n).padStart(3)}  ${String(b.refused).padStart(7)}  ` +
      `${String(b.exact).padStart(6)}  ${String(b.wrong).padStart(6)}  ${b.worstMs.toFixed(0).padStart(7)}ms  ` +
      `${b.confidentWrong ? (b.confidentWrong * 100).toFixed(0) + '%' : '—'}`,
    );
  }

  console.log('\nThe runner-up, which is the signal confidence is not:');
  console.log('  placement            n   flagged   rival vote / winner: min   median      max');
  for (const g of guard) {
    const s = share(g.rows);
    if (s.n === 0) { console.log(`  ${g.label.padEnd(18)}   0         —                          —        —        —`); continue; }
    console.log(
      `  ${g.label.padEnd(18)} ${String(s.n).padStart(3)}  ${String(g.rows.filter((x) => x.ambiguous).length).padStart(8)}   ` +
      `${s.min.toFixed(4).padStart(24)} ${s.median.toFixed(4).padStart(8)} ${s.max.toFixed(4).padStart(8)}`,
    );
  }

  console.log('\nWhat Watching Mode does with them, through the real shouldCorrect:');
  console.log('  Following steadily — the clock is where playback actually is.');
  console.log('  A jump taken here is a jump the viewer did not make.');
  console.log('  placement            n   corrected before   corrected after');
  for (const g of guard) {
    console.log(
      `  ${g.label.padEnd(18)} ${String(g.rows.length).padStart(3)}   ` +
      `${String(g.rows.filter((x) => x.followedBefore).length).padStart(16)}   ` +
      `${String(g.rows.filter((x) => x.followedAfter).length).padStart(15)}`,
    );
  }
  console.log('\n  Just after a 90-second recap skip — every match now proposes a real jump.');
  console.log('  A jump refused here is the feature failing at the moment it is wanted.');
  console.log('  placement            n   corrected before   corrected after');
  for (const g of guard) {
    console.log(
      `  ${g.label.padEnd(18)} ${String(g.rows.length).padStart(3)}   ` +
      `${String(g.rows.filter((x) => x.skipBefore).length).padStart(16)}   ` +
      `${String(g.rows.filter((x) => x.skipAfter).length).padStart(15)}`,
    );
  }

  console.log(`\nPearson r between confidence and error: ${r.toFixed(3)}  (n = ${placed.length})`);
  console.log(
    '\nRead r beside the bands, not instead of them: a coefficient near zero over a set\n' +
    'where almost every error is zero says the errors do not vary, not that confidence is\n' +
    'uninformative. The bands are the answer; r is a summary of them.\n',
  );
}
