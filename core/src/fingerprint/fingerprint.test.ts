import { describe, expect, it } from 'vitest';
import {
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
} from './fingerprint';

/**
 * Synthetic audio, deterministic so the tests do not flake.
 *
 * Each frame is a spectrum with a few strong tones. A "recording" of the same
 * material is the same spectrum with noise added and levels changed, which is what a
 * phone microphone in a room actually does to it.
 */
function makeSpectrogram(frameCount: number, seed = 1): Float32Array[] {
  const bins = 128;
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

/** Simulate room noise and a different volume. */
function degrade(spectrogram: Float32Array[], seed = 7): Float32Array[] {
  let state = seed;
  const rand = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };

  return spectrogram.map((frame) => {
    const out = new Float32Array(frame.length);
    for (let i = 0; i < frame.length; i++) {
      // Quieter overall, plus a noise floor well below the peaks.
      out[i] = frame[i] * 0.6 + rand() * 0.05;
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
    const { FFT_SIZE, HOP_SIZE, CAPTURE_MS } = await import('./fingerprint');
    expect(FFT_SIZE).toBe(2048);
    expect(HOP_SIZE).toBe(512);
    // Long enough to be distinctive, short enough not to feel like surveillance.
    expect(CAPTURE_MS).toBeGreaterThanOrEqual(3000);
    expect(CAPTURE_MS).toBeLessThanOrEqual(10_000);
  });

});

describe('reference transport encoding', () => {
  it('round-trips hashes through base64', async () => {
    const { encodeHashes, decodeHashes } = await import('./references');
    const original = Uint32Array.from([1, 2, 4_294_967_295, 0, 12345]);
    expect(Array.from(decodeHashes(encodeHashes(original)))).toEqual(Array.from(original));
  });

  it('handles a large payload without overflowing the stack', async () => {
    // A megabyte spread into String.fromCharCode in one call would throw.
    const { encodeHashes, decodeHashes } = await import('./references');
    const big = Uint32Array.from({ length: 200_000 }, (_, i) => i);
    expect(decodeHashes(encodeHashes(big)).length).toBe(big.length);
  });

  it('handles an empty array', async () => {
    const { encodeHashes, decodeHashes } = await import('./references');
    expect(decodeHashes(encodeHashes(new Uint32Array(0))).length).toBe(0);
  });

  it('truncates a misaligned payload rather than misreading it', async () => {
    // Uint32Array needs 4-byte alignment; a truncated transfer must not be read
    // as wildly wrong numbers.
    const { decodeHashes } = await import('./references');
    const misaligned = btoa('abcdefg'); // 7 bytes
    expect(decodeHashes(misaligned).length).toBe(1);
  });

  it('survives a round trip into a usable reference', async () => {
    const { encodeHashes, decodeHashes } = await import('./references');
    const episode = makeSpectrogram(300, 21);
    const packed = serialiseReference(buildReference(fingerprint(episode)));
    const restored = deserialiseReference(decodeHashes(encodeHashes(packed)));

    expect(matchSample(fingerprint(episode.slice(120, 160)), restored)?.offsetFrames).toBe(120);
  });
});
