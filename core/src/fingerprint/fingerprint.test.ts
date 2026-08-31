import { describe, expect, it } from 'vitest';
import {
  FFT_SIZE,
  buildReference,
  deserialiseReference,
  estimateBytes,
  findPeaks,
  fingerprint,
  framesToMs,
  hashPeaks,
  matchSample,
  packHash,
  serialiseReference,
} from './fingerprint.ts';

/**
 * Synthetic audio, deterministic so the tests do not flake.
 *
 * Each frame is a spectrum with a few strong tones. A "recording" of the same
 * material is the same spectrum with noise added and levels changed, which is what a
 * phone microphone in a room actually does to it.
 */
function makeSpectrogram(frameCount: number, seed = 1): Float32Array[] {
  // The real number of bins a 2048-point FFT produces, not a convenient small one.
  //
  // This used to be 128, which was faster and hid a bug for months: `packHash` shifts
  // the first bin left by 22 places, so the packed value only goes negative once a bin
  // reaches 512 — and a 128-bin fixture can never get there. Every landmark above about
  // 5.5kHz was being lost crossing the wire format, and no test could see it, because
  // no test produced one.
  const bins = FFT_SIZE / 2;
  let state = seed;
  const rand = () => {
    // Deterministic LCG — no Math.random, so failures reproduce.
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };

  return Array.from({ length: frameCount }, () => {
    const frame = new Float32Array(bins);
    // A handful of dominant tones per frame, in varying places.
    for (let t = 0; t < 4; t++) {
      const bin = 5 + Math.floor(rand() * (bins - 10));
      frame[bin] = 1 + rand();
    }
    return frame;
  });
}

/**
 * Simulate room noise and a different volume.
 *
 * The floor is a parameter rather than a constant because how loud the room is turned
 * out to be the *control* variable in `docs/research/12-what-a-match-knows.md`: swept
 * from 0.5 to 3.0 against peaks of 1–2, it moves reported confidence from 0.90 to 0.24
 * and does not move the position by a single frame. 0.05 stays the default so the
 * existing cases mean what they always did.
 */
function degrade(spectrogram: Float32Array[], seed = 7, floor = 0.05): Float32Array[] {
  let state = seed;
  const rand = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };

  return spectrogram.map((frame) => {
    const out = new Float32Array(frame.length);
    for (let i = 0; i < frame.length; i++) {
      // Quieter overall, plus a noise floor.
      out[i] = frame[i] * 0.6 + rand() * floor;
    }
    return out;
  });
}

describe('peak detection', () => {
  it('finds local maxima', () => {
    const frame = new Float32Array([0, 1, 5, 1, 0, 2, 8, 2, 0]);
    const peaks = findPeaks([frame], 2);
    expect(peaks.map((p) => p.bin).sort((a, b) => a - b)).toEqual([2, 6]);
  });

  it('keeps only the strongest peaks per frame', () => {
    const frame = new Float32Array([0, 1, 0, 2, 0, 3, 0, 4, 0]);
    expect(findPeaks([frame], 2)).toHaveLength(2);
  });

  it('ignores a broad plateau rather than emitting many peaks', () => {
    // A loud region should contribute one landmark, not fifty.
    const frame = new Float32Array([0, 5, 5, 5, 5, 0]);
    expect(findPeaks([frame], 10).length).toBeLessThanOrEqual(1);
  });

  it('returns nothing for silence', () => {
    expect(findPeaks([new Float32Array(64)], 3)).toEqual([]);
  });

  it('tags peaks with their frame', () => {
    const spectrogram = [new Float32Array([0, 3, 0]), new Float32Array([0, 4, 0])];
    expect(findPeaks(spectrogram, 1).map((p) => p.frame)).toEqual([0, 1]);
  });
});

describe('landmark hashing', () => {
  it('packs both frequencies and the delta into one integer', () => {
    const hash = packHash(100, 200, 12);
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBe(packHash(100, 200, 12));
  });

  it('distinguishes different pairs', () => {
    expect(packHash(100, 200, 12)).not.toBe(packHash(200, 100, 12));
    expect(packHash(100, 200, 12)).not.toBe(packHash(100, 200, 13));
  });

  it('stays unsigned across the whole bin range', () => {
    // A 2048-point FFT has 1024 bins, so the top bit of the packed hash is set for
    // everything above about 5.5kHz. Bitwise operators in JavaScript are signed, and a
    // negative hash does not survive the Uint32Array the wire format uses — it comes
    // back as its unsigned twin and never matches again. The old fixtures used 128
    // bins, so nothing here ever reached that half of the range.
    for (const binA of [0, 511, 512, 700, 1023]) {
      const hash = packHash(binA, 300, 5);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBe(new Uint32Array([hash])[0]);
    }
  });

  it('excludes absolute time, so the same audio hashes alike wherever it starts', () => {
    const early = hashPeaks([
      { frame: 10, bin: 40 },
      { frame: 15, bin: 60 },
    ]);
    const late = hashPeaks([
      { frame: 500, bin: 40 },
      { frame: 505, bin: 60 },
    ]);
    // Identical hashes, different anchor frames — the offset is recovered by voting.
    expect(early[0].hash).toBe(late[0].hash);
    expect(early[0].frame).not.toBe(late[0].frame);
  });

  it('respects the fanout limit', () => {
    const peaks = Array.from({ length: 20 }, (_, i) => ({ frame: i, bin: 10 + i }));
    const hashes = hashPeaks(peaks, { fanout: 2, fanoutFrames: 100 });
    // At most `fanout` partners per anchor.
    expect(hashes.length).toBeLessThanOrEqual(peaks.length * 2);
  });

  it('does not pair peaks further apart than the window', () => {
    const hashes = hashPeaks(
      [
        { frame: 0, bin: 10 },
        { frame: 500, bin: 20 },
      ],
      { fanoutFrames: 10 },
    );
    expect(hashes).toEqual([]);
  });

  it('produces nothing from a single peak', () => {
    expect(hashPeaks([{ frame: 0, bin: 10 }])).toEqual([]);
  });
});

describe('matching', () => {
  const episode = makeSpectrogram(600, 42);
  const reference = buildReference(fingerprint(episode));

  it('locates a clean sample at the right offset', () => {
    const sample = fingerprint(episode.slice(300, 340));
    const match = matchSample(sample, reference);
    expect(match).toBeDefined();
    expect(match!.offsetFrames).toBe(300);
  });

  it('locates a noisy, quieter sample — the microphone case', () => {
    const sample = fingerprint(degrade(episode.slice(200, 250)));
    const match = matchSample(sample, reference);
    expect(match).toBeDefined();
    // Peaks survive noise and level changes even when fine detail does not.
    expect(match!.offsetFrames).toBe(200);
  });

  it('finds the start of an episode', () => {
    const match = matchSample(fingerprint(episode.slice(0, 40)), reference);
    expect(match?.offsetFrames).toBe(0);
  });

  it('refuses to match a different episode', () => {
    // The failure mode that matters most: a confident wrong answer would put every
    // reaction on the wrong moment.
    const other = makeSpectrogram(200, 9999);
    expect(matchSample(fingerprint(other), reference)).toBeUndefined();
  });

  it('returns nothing for silence', () => {
    const silence = Array.from({ length: 30 }, () => new Float32Array(128));
    expect(matchSample(fingerprint(silence), reference)).toBeUndefined();
  });

  it('returns nothing for an empty sample', () => {
    expect(matchSample([], reference)).toBeUndefined();
  });

  it('rejects a match with too few votes however dominant', () => {
    const sample = fingerprint(episode.slice(300, 340));
    expect(matchSample(sample, reference, { minScore: 100_000 })).toBeUndefined();
  });

  it('reports confidence, which is high for a real match', () => {
    const match = matchSample(fingerprint(episode.slice(100, 160)), reference);
    expect(match!.confidence).toBeGreaterThan(0.15);
  });
});

/**
 * The runner-up, which is the half of the answer the matcher used to throw away.
 *
 * `docs/research/12-what-a-match-knows.md` is what these exist for. 300 probes at known
 * offsets: every probe that landed in a stretch of verbatim-repeated audio was placed
 * 725,995ms — twelve minutes — from where it actually was, and reported up to **93%
 * sure** while doing it. Confidence cannot see this and never could: it is the share of
 * matched landmarks agreeing on the winner, and when the same audio occurs twice both
 * copies collect very nearly the whole vote, so the winner's share stays high and the
 * position is a coin toss. Noise moves the number without moving the position; repetition
 * moves the position without moving the number. r = 0.030 over the whole run.
 *
 * The second signal was there all along. The vote is over every candidate offset, and the
 * runner-up — how much support the best *other* place got — is exactly the quantity that
 * separates "this audio occurs here" from "this audio occurs here and also over there".
 */
describe('an episode that contains the same audio twice', () => {
  /*
   * The fixture the finding needs, and it has to be built rather than borrowed: a random
   * spectrogram has no self-similarity at all, so the true offset never has a competitor
   * and the matcher is only ever choosing between one real peak and scattered noise. §6.43
   * — a fixture smaller than reality is a test that cannot fail — and this is the subject
   * the calibration's first version omitted entirely.
   */
  const twice = makeSpectrogram(600, 42);
  // A title sequence, a reprise, a reused sting: one stretch copied verbatim over a later
  // one. 80 frames is comfortably longer than the 40-frame windows sampled below, so a
  // window can sit wholly inside a copy — which is the case that goes wrong.
  for (let i = 0; i < 80; i++) twice[400 + i] = twice[100 + i];
  const repeated = buildReference(fingerprint(twice));

  const unique = makeSpectrogram(600, 42);
  const clean = buildReference(fingerprint(unique));

  it('places a sample from unique audio without a rival anywhere near it', () => {
    const match = matchSample(fingerprint(unique.slice(300, 340)), clean);
    expect(match!.offsetFrames).toBe(300);
    expect(match!.ambiguous).toBe(false);
    // The measured worst over 228 such probes was 0.0149 of the winner's vote. The bar
    // here is loose on purpose — the claim is that nothing else comes close, not a
    // pinned number that a different fixture would move.
    expect(match!.alternative!.score).toBeLessThan(match!.score * 0.1);
  });

  it('says so when the sample could be either of two places', () => {
    // Wholly inside the copy, which is where all 33 wrong placements in the run were.
    const match = matchSample(fingerprint(twice.slice(410, 450)), repeated);
    expect(match).toBeDefined();
    expect(match!.ambiguous).toBe(true);
    // And it names the other place rather than only admitting one exists, because that
    // is what lets `shouldCorrect` ask the clock which of the two it has been watching.
    expect(match!.alternative).toBeDefined();
    expect(Math.abs(match!.alternative!.offsetFrames - match!.offsetFrames)).toBe(300);
  });

  it('is still confident while being ambiguous, which is the whole finding', () => {
    const match = matchSample(fingerprint(twice.slice(410, 450)), repeated);
    // The number the screens show is untouched by the thing that makes this dangerous.
    // If this ever starts failing because confidence has become low here, the copy in
    // `COPY.watching.listenPlaced` can stop being hedged — until then it cannot.
    expect(match!.confidence).toBeGreaterThan(0.4);
    expect(match!.ambiguous).toBe(true);
  });

  it('still places the sample rather than refusing it', () => {
    // Refusing was the other option and was rejected: repeated audio is title sequences
    // and recaps, which is when people are watching. A matcher that goes quiet there is
    // useless exactly when it is wanted. See `MatchResult.ambiguous`.
    const match = matchSample(fingerprint(twice.slice(410, 450)), repeated);
    expect(match!.offsetFrames).toBeGreaterThanOrEqual(0);
    expect(match!.score).toBeGreaterThan(0);
  });

  it('picks the same winner every time, so which of two equal offsets wins is not luck', () => {
    /*
     * The old comparison was `score > bestScore` alone, so two offsets with equal votes —
     * precisely what duplicated audio produces — were separated by whichever the Map
     * yielded first. That is insertion order, which is hashing order, which depends on the
     * noise: the same episode and the same audio could be placed twelve minutes apart on
     * two runs with nothing anywhere to say why. Building the reference a second time in a
     * different order is the cheapest way to show the order no longer decides it.
     */
    const shuffled = buildReference([...fingerprint(twice)].reverse());
    const first = matchSample(fingerprint(twice.slice(410, 450)), repeated);
    const second = matchSample(fingerprint(twice.slice(410, 450)), shuffled);
    expect(second!.offsetFrames).toBe(first!.offsetFrames);
    expect(second!.alternative!.offsetFrames).toBe(first!.alternative!.offsetFrames);
  });

  it('does not call a match ambiguous just because the room is loud', () => {
    /*
     * The threshold's lower bound, and the case that decides it.
     *
     * A rival at 0.0149 of the winner was the worst the calibration saw across 228 probes
     * in unique audio, which invites sizing the threshold just above that — and it is a
     * trap, because those are synthetic spectrograms with no room in them. Noise is what
     * inflates the clean rival: it scatters spurious landmarks, and some of them land on
     * some other offset. So the bound has to be tested at the noisiest input this fixture
     * can produce, not the cleanest.
     *
     * 3.0 against peaks of 1–2 is the top of the calibration's own sweep, where reported
     * confidence has fallen to 0.24. Here it drives the clean rival to about 0.03 — twice
     * the worst the quiet probes managed — while the position stays exactly right, which
     * is the orthogonality doc 12 measured, visible in one assertion.
     */
    const noisy = fingerprint(degrade(unique.slice(200, 250), 7, 3.0));
    const match = matchSample(noisy, clean);
    expect(match!.offsetFrames, 'noise moved the position, which it is not supposed to do')
      .toBe(200);

    const rival = match!.alternative!.score / match!.score;
    expect(rival, 'the fixture stopped being noisy enough to defend the threshold')
      .toBeGreaterThan(0.02);
    // The whole point: a rival this size is still nowhere near a second place, and a
    // threshold low enough to call this ambiguous would refuse legitimate jumps for the
    // rest of the episode every time somebody watched with the window open.
    expect(match!.ambiguous).toBe(false);
  });

  it('flags a rival that is strong but not equal, which is what real repetition is', () => {
    /*
     * The fixture above copies the audio *byte for byte*, so both copies draw identical
     * landmarks and the vote splits exactly evenly — a rival at 1.0 of the winner. Almost
     * no real repetition is like that. A reprise is re-recorded, a theme sits at a
     * different mix, a sting plays over different dialogue: the copies share most
     * landmarks and not all, and the rival lands somewhere below 1.0.
     *
     * That band is the whole reason `AMBIGUOUS_VOTE_RATIO` is a half rather than a
     * near-one, and without this test nothing here can tell the two apart — a threshold of
     * 0.999 passes every other check in this file while catching only the fixture. So the
     * copy here is deliberately imperfect: every eighth frame is left as the original
     * episode, which breaks the landmark pairs that cross it and lands the rival at about
     * three-quarters of the winner. Swept while writing this — leaving every second frame
     * gives 0.006, every fourth 0.49, every eighth 0.74, every twentieth 0.90, a whole
     * copy 1.00 — which is the same 0.5-to-0.9 band the calibration's partly-copied
     * windows land in, and this fixture sits in the middle of it on purpose.
     */
    const uneven = makeSpectrogram(600, 42);
    for (let i = 0; i < 80; i++) if (i % 8 !== 0) uneven[400 + i] = uneven[100 + i];
    const reference = buildReference(fingerprint(uneven));

    const match = matchSample(fingerprint(uneven.slice(410, 450)), reference);
    const rival = match!.alternative!.score / match!.score;
    // Both bounds, because a fixture that drifted to either extreme would stop testing the
    // band it exists for: near 1.0 it is the verbatim case again, and near 0 it is a
    // unique match and would prove the opposite of what it claims.
    expect(rival).toBeGreaterThan(0.6);
    expect(rival).toBeLessThan(0.9);
    expect(match!.ambiguous).toBe(true);
  });

  it('treats two places 1.5 seconds apart as one place, and 1.5 seconds and a frame as two', () => {
    /*
     * Both sides of the neighbourhood bound, to the frame.
     *
     * §6.77's rule: every other case here sits well inside or well outside, so the
     * constant could move a long way and nothing would fail. It decides something real —
     * a true peak in continuous audio arrives with shoulders a few frames wide, and
     * counting a shoulder as the runner-up would mark every ordinary match ambiguous,
     * which would refuse every legitimate jump the feature exists to follow.
     *
     * Built rather than sampled: the same landmarks planted at two known distances is the
     * only way to put the rival exactly on the bound. 1.5s is `shouldCorrect`'s own floor,
     * which is what makes it the right distance — below it, this product has already
     * decided a difference in position is not worth acting on.
     */
    const hashes = fingerprint(unique.slice(300, 340));
    const at = (gap: number) =>
      buildReference([...hashes, ...hashes.map((h) => ({ hash: h.hash, frame: h.frame + gap }))]);
    const bound = Math.round((1.5 * 22_050) / 512); // 65 frames

    const same = matchSample(hashes, at(bound - 1));
    expect(same!.alternative, 'a rival inside the bound is the same placement, not a second one')
      .toBeUndefined();
    expect(same!.ambiguous).toBe(false);

    const two = matchSample(hashes, at(bound));
    expect(two!.alternative!.offsetFrames - two!.offsetFrames).toBe(bound);
    expect(two!.ambiguous).toBe(true);
  });

  it('does not count the winner\'s own neighbours as the rival', () => {
    // Offsets within 1.5s of the winner are the same placement with jitter, not a second
    // place — `shouldCorrect` would not act on the difference either. Asked with a huge
    // separation, a clean match has no rival left at all.
    const match = matchSample(fingerprint(unique.slice(300, 340)), clean, {
      separationFrames: 10_000,
    });
    expect(match!.alternative).toBeUndefined();
    expect(match!.ambiguous).toBe(false);
  });
});

describe('reference serialisation', () => {
  it('round-trips exactly', () => {
    const original = buildReference(fingerprint(makeSpectrogram(100, 5)));
    const restored = deserialiseReference(serialiseReference(original));

    expect(restored.size).toBe(original.size);
    for (const [hash, frames] of original) {
      expect(restored.get(hash)?.sort()).toEqual(frames.sort());
    }
  });

  it('still matches after a round trip', () => {
    const episode = makeSpectrogram(300, 11);
    const restored = deserialiseReference(serialiseReference(buildReference(fingerprint(episode))));
    expect(matchSample(fingerprint(episode.slice(150, 190)), restored)?.offsetFrames).toBe(150);
  });

  it('handles an empty reference', () => {
    expect(deserialiseReference(serialiseReference(new Map())).size).toBe(0);
  });

  it('stays within the size budget sized in research', () => {
    // Doc 6 sized this at roughly 1 MB per hour. At a 512-sample hop and 22.05 kHz
    // an hour is about 155,000 frames; 600 frames should scale well under that.
    const reference = buildReference(fingerprint(makeSpectrogram(600, 3)));
    const bytesPerFrame = estimateBytes(reference) / 600;
    const projectedPerHour = bytesPerFrame * 155_000;
    expect(projectedPerHour).toBeLessThan(12 * 1024 * 1024);
  });
});

describe('frame conversion', () => {
  it('converts frames to milliseconds', () => {
    // 512-sample hop at 22.05 kHz is ~23.2 ms per frame.
    expect(framesToMs(43, 512, 22_050)).toBeCloseTo(998.4, 0);
  });

  it('handles zero', () => {
    expect(framesToMs(0, 512, 22_050)).toBe(0);
  });
});

describe('capture configuration', () => {
  it('uses a hop and FFT size consistent with the sizing work', async () => {
    const { FFT_SIZE, HOP_SIZE, CAPTURE_MS } = await import('./fingerprint.ts');
    expect(FFT_SIZE).toBe(2048);
    expect(HOP_SIZE).toBe(512);
    // Long enough to be distinctive, short enough not to feel like surveillance.
    expect(CAPTURE_MS).toBeGreaterThanOrEqual(3000);
    expect(CAPTURE_MS).toBeLessThanOrEqual(10_000);
  });

});

describe('reference transport encoding', () => {
  it('round-trips hashes through base64', async () => {
    const { encodeHashes, decodeHashes } = await import('./references.ts');
    const original = Uint32Array.from([1, 2, 4_294_967_295, 0, 12345]);
    expect(Array.from(decodeHashes(encodeHashes(original)))).toEqual(Array.from(original));
  });

  it('handles a large payload without overflowing the stack', async () => {
    // A megabyte spread into String.fromCharCode in one call would throw.
    const { encodeHashes, decodeHashes } = await import('./references.ts');
    const big = Uint32Array.from({ length: 200_000 }, (_, i) => i);
    expect(decodeHashes(encodeHashes(big)).length).toBe(big.length);
  });

  it('handles an empty array', async () => {
    const { encodeHashes, decodeHashes } = await import('./references.ts');
    expect(decodeHashes(encodeHashes(new Uint32Array(0))).length).toBe(0);
  });

  it('truncates a misaligned payload rather than misreading it', async () => {
    // Uint32Array needs 4-byte alignment; a truncated transfer must not be read
    // as wildly wrong numbers.
    const { decodeHashes } = await import('./references.ts');
    const misaligned = btoa('abcdefg'); // 7 bytes
    expect(decodeHashes(misaligned).length).toBe(1);
  });

  it('survives a round trip into a usable reference', async () => {
    const { encodeHashes, decodeHashes } = await import('./references.ts');
    const episode = makeSpectrogram(300, 21);
    const packed = serialiseReference(buildReference(fingerprint(episode)));
    const restored = deserialiseReference(decodeHashes(encodeHashes(packed)));

    expect(matchSample(fingerprint(episode.slice(120, 160)), restored)?.offsetFrames).toBe(120);
  });
});
