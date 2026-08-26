import { describe, expect, it } from 'vitest';
import { Resampler, SpectrogramStream, downmix, int16ToFloat } from './stream.ts';
import { spectrogramFromPcm } from './spectrogram.ts';
import { FFT_SIZE, HOP_SIZE, SAMPLE_RATE } from './fingerprint.ts';

/** A pure tone, so the spectrum has a known answer. */
function tone(hz: number, samples: number, rate = SAMPLE_RATE): Float32Array {
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i++) out[i] = Math.sin((2 * Math.PI * hz * i) / rate);
  return out;
}

function interleave(...channels: Float32Array[]): Float32Array {
  const frames = channels[0].length;
  const out = new Float32Array(frames * channels.length);
  for (let i = 0; i < frames; i++) {
    channels.forEach((channel, c) => {
      out[i * channels.length + c] = channel[i];
    });
  }
  return out;
}

/** Feed a signal in irregular pieces, the way hardware actually delivers it. */
function chunks(signal: Float32Array, sizes: number[]): Float32Array[] {
  const out: Float32Array[] = [];
  let offset = 0;
  let i = 0;
  while (offset < signal.length) {
    const size = sizes[i++ % sizes.length];
    out.push(signal.slice(offset, offset + size));
    offset += size;
  }
  return out;
}

describe('downmix', () => {
  it('averages the channels', () => {
    const left = Float32Array.from([1, 1, 1]);
    const right = Float32Array.from([0, 0.5, -1]);
    expect(Array.from(downmix(interleave(left, right), 2))).toEqual([0.5, 0.75, 0]);
  });

  it('leaves mono alone', () => {
    const mono = Float32Array.from([0.1, 0.2]);
    expect(downmix(mono, 1)).toBe(mono);
  });

  it('ignores a trailing partial frame rather than reading past the end', () => {
    // Five samples of stereo is two whole frames and one orphan.
    const odd = Float32Array.from([1, 1, 2, 2, 3]);
    expect(Array.from(downmix(odd, 2))).toEqual([1, 2]);
  });
});

describe('int16ToFloat', () => {
  it('maps full scale into [-1, 1]', () => {
    const out = int16ToFloat(Int16Array.from([0, 32767, -32768]));
    expect(out[0]).toBe(0);
    expect(out[1]).toBeCloseTo(1, 3);
    expect(out[2]).toBe(-1);
  });
});

describe('Resampler', () => {
  it('passes through untouched when the rates match', () => {
    const resampler = new Resampler(SAMPLE_RATE, SAMPLE_RATE);
    expect(resampler.isIdentity).toBe(true);
    const input = tone(440, 512);
    expect(resampler.push(input)).toBe(input);
  });

  it('produces roughly the expected number of samples for the ratio', () => {
    const resampler = new Resampler(48_000, 22_050);
    let produced = 0;
    for (const chunk of chunks(tone(440, 48_000, 48_000), [1024])) {
      produced += resampler.push(chunk).length;
    }
    // A sample or two of slack for the boundary sample held back at the end.
    expect(produced).toBeGreaterThan(22_040);
    expect(produced).toBeLessThanOrEqual(22_050);
  });

  it('is seamless across buffer boundaries', () => {
    // The whole point of carrying `phase`: resampling in pieces must equal resampling
    // in one go. A per-buffer reset would put a small timing step at every boundary.
    const signal = tone(700, 8000, 44_100);

    const oneGo = new Resampler(44_100).push(signal);

    const piecemeal: number[] = [];
    const pieces = new Resampler(44_100);
    for (const chunk of chunks(signal, [317, 1024, 61, 2048])) {
      piecemeal.push(...pieces.push(chunk));
    }

    expect(piecemeal.length).toBe(oneGo.length);
    for (let i = 0; i < oneGo.length; i++) {
      expect(piecemeal[i]).toBeCloseTo(oneGo[i], 6);
    }
  });

  it('holds back a buffer too short to interpolate within', () => {
    const resampler = new Resampler(48_000);
    expect(resampler.push(Float32Array.from([0.5])).length).toBe(0);
    // The held sample is not lost; it becomes the first of the next buffer.
    expect(resampler.push(Float32Array.from([0.5, 0.5, 0.5, 0.5])).length).toBeGreaterThan(0);
  });

  it('refuses a nonsense rate rather than dividing by zero later', () => {
    expect(() => new Resampler(0)).toThrow(/positive/);
  });
});

describe('SpectrogramStream', () => {
  it('emits the same frames as analysing the whole signal at once', () => {
    const signal = tone(1000, FFT_SIZE + HOP_SIZE * 8);
    const reference = spectrogramFromPcm(signal);

    const streamed: Float32Array[] = [];
    const stream = new SpectrogramStream({ sourceRate: SAMPLE_RATE });
    for (const chunk of chunks(signal, [100, 700, 33, 4096])) {
      streamed.push(...stream.push(chunk));
    }

    expect(streamed.length).toBe(reference.length);
    streamed.forEach((frame, i) => {
      expect(Array.from(frame)).toEqual(Array.from(reference[i]));
    });
  });

  it('advances by the hop size, not the window size', () => {
    const stream = new SpectrogramStream({ sourceRate: SAMPLE_RATE });
    // Exactly one window plus three hops of audio is four frames.
    const frames = stream.push(tone(500, FFT_SIZE + HOP_SIZE * 3));
    expect(frames.length).toBe(4);
    expect(stream.frameCount).toBe(4);
  });

  it('reports frames through the callback in order', () => {
    const indices: number[] = [];
    const stream = new SpectrogramStream({
      sourceRate: SAMPLE_RATE,
      onFrame: (_frame, index) => indices.push(index),
    });
    stream.push(tone(500, FFT_SIZE + HOP_SIZE * 4));
    expect(indices).toEqual([0, 1, 2, 3, 4]);
  });

  it('downmixes and resamples on the way in', () => {
    // Stereo at 48kHz — what a phone actually hands over — must still land the tone in
    // the bin the analysis rate says it belongs to.
    const hz = 1500;
    const source = tone(hz, 48_000, 48_000);
    const stream = new SpectrogramStream({ sourceRate: 48_000, channels: 2 });

    const frames: Float32Array[] = [];
    for (const chunk of chunks(interleave(source, source), [4096])) {
      frames.push(...stream.push(chunk));
    }

    expect(frames.length).toBeGreaterThan(10);
    const frame = frames[10];
    let peak = 0;
    for (let bin = 1; bin < frame.length; bin++) if (frame[bin] > frame[peak]) peak = bin;

    const expected = Math.round((hz * FFT_SIZE) / SAMPLE_RATE);
    expect(Math.abs(peak - expected)).toBeLessThanOrEqual(1);
  });

  it('starts over on reset', () => {
    const stream = new SpectrogramStream({ sourceRate: SAMPLE_RATE });
    stream.push(tone(500, FFT_SIZE * 2));
    expect(stream.frameCount).toBeGreaterThan(0);
    stream.reset();
    expect(stream.frameCount).toBe(0);
    // The half-filled buffer went with it: a short push produces nothing.
    expect(stream.push(tone(500, HOP_SIZE)).length).toBe(0);
  });
});
