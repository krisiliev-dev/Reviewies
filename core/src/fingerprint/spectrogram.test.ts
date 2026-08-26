import { describe, expect, it } from 'vitest';
import { fft, frameMagnitudes, hannWindow, spectrogramFromPcm } from './spectrogram.ts';
import { FFT_SIZE, HOP_SIZE } from './fingerprint.ts';

/** A pure tone, which has a known answer: one peak, at a known bin. */
function tone(hz: number, sampleRate: number, length: number): Float32Array {
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) samples[i] = Math.sin((2 * Math.PI * hz * i) / sampleRate);
  return samples;
}

describe('the transform', () => {
  it('puts a pure tone in the bin it belongs in', () => {
    // The whole thing rests on this. A transform that is subtly wrong still produces
    // plausible-looking peaks, so it has to be checked against a known answer.
    const sampleRate = 22_050;
    const hz = 1000;
    const magnitudes = frameMagnitudes(tone(hz, sampleRate, FFT_SIZE));

    let loudest = 0;
    for (let i = 1; i < magnitudes.length; i++) {
      if (magnitudes[i] > magnitudes[loudest]) loudest = i;
    }

    const expected = Math.round((hz * FFT_SIZE) / sampleRate);
    expect(Math.abs(loudest - expected)).toBeLessThanOrEqual(1);
  });

  it('separates two tones into two peaks', () => {
    const sampleRate = 22_050;
    const a = tone(1000, sampleRate, FFT_SIZE);
    const b = tone(4000, sampleRate, FFT_SIZE);
    const mixed = new Float32Array(FFT_SIZE);
    for (let i = 0; i < FFT_SIZE; i++) mixed[i] = a[i] + b[i];

    const magnitudes = frameMagnitudes(mixed);
    const binOf = (hz: number) => Math.round((hz * FFT_SIZE) / sampleRate);

    // Both should stand well clear of a quiet bin between them.
    const quiet = magnitudes[binOf(2500)];
    expect(magnitudes[binOf(1000)]).toBeGreaterThan(quiet + 10);
    expect(magnitudes[binOf(4000)]).toBeGreaterThan(quiet + 10);
  });

  it('reports silence as zero rather than negative infinity', () => {
    // log10(0) is -Infinity, which would poison every comparison downstream.
    const magnitudes = frameMagnitudes(new Float32Array(FFT_SIZE));
    expect([...magnitudes].every((m) => m === 0)).toBe(true);
  });

  it('refuses a size that is not a power of two', () => {
    expect(() => fft(new Float32Array(100), new Float32Array(100))).toThrow(/power of two/);
  });

  it('leaves a single sample alone', () => {
    const real = new Float32Array([5]);
    fft(real, new Float32Array(1));
    expect(real[0]).toBe(5);
  });
});

describe('the window', () => {
  it('tapers to zero at both ends', () => {
    const window = hannWindow(64);
    expect(window[0]).toBeCloseTo(0, 6);
    expect(window[63]).toBeCloseTo(0, 6);
    expect(window[32]).toBeGreaterThan(0.9);
  });

  it('is cached, since it is rebuilt for every frame otherwise', () => {
    expect(hannWindow(64)).toBe(hannWindow(64));
  });
});

describe('building a spectrogram', () => {
  it('produces overlapping frames at the configured hop', () => {
    const samples = tone(1000, 22_050, FFT_SIZE + HOP_SIZE * 3);
    const frames = spectrogramFromPcm(samples);
    expect(frames).toHaveLength(4);
    expect(frames[0]).toHaveLength(FFT_SIZE / 2);
  });

  it('returns nothing when there is not even one frame of audio', () => {
    expect(spectrogramFromPcm(new Float32Array(100))).toEqual([]);
  });

  it('is stable: the same audio gives the same spectrogram', () => {
    // A reference and a sample are computed at different times, possibly on different
    // devices. If this were not deterministic, nothing would ever match.
    const samples = tone(1000, 22_050, FFT_SIZE * 2);
    expect(spectrogramFromPcm(samples)).toEqual(spectrogramFromPcm(samples));
  });
});
