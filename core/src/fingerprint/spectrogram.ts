import { FFT_SIZE, HOP_SIZE } from './fingerprint.ts';

/**
 * Turning raw audio into the spectrogram the fingerprinter expects.
 *
 * The web never needed this: `AnalyserNode.getFloatFrequencyData` hands over a
 * finished magnitude spectrum. React Native has no Web Audio, so the transform has to
 * happen here — which is the better place for it anyway, because it means the same
 * code produces the spectrogram on every platform.
 *
 * That matters more than it sounds. A reference built from one implementation and a
 * sample taken with a slightly different one will not match, and the failure is
 * silent: every lookup simply misses. One implementation removes the question.
 */

/**
 * In-place iterative radix-2 Cooley–Tukey FFT.
 *
 * Real input, so the imaginary array starts at zero. Only the first half of the output
 * is meaningful — the spectrum of a real signal is symmetric, and the second half is
 * its mirror.
 */
export function fft(real: Float32Array, imaginary: Float32Array): void {
  const n = real.length;
  if (n <= 1) return;
  if ((n & (n - 1)) !== 0) throw new Error(`FFT size must be a power of two, got ${n}`);

  // Bit-reversal permutation, so the butterflies below can run in place.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imaginary[i], imaginary[j]] = [imaginary[j], imaginary[i]];
    }
  }

  for (let length = 2; length <= n; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const wReal = Math.cos(angle);
    const wImaginary = Math.sin(angle);

    for (let start = 0; start < n; start += length) {
      let currentReal = 1;
      let currentImaginary = 0;

      for (let k = 0; k < length / 2; k++) {
        const a = start + k;
        const b = a + length / 2;

        const tReal = real[b] * currentReal - imaginary[b] * currentImaginary;
        const tImaginary = real[b] * currentImaginary + imaginary[b] * currentReal;

        real[b] = real[a] - tReal;
        imaginary[b] = imaginary[a] - tImaginary;
        real[a] += tReal;
        imaginary[a] += tImaginary;

        const nextReal = currentReal * wReal - currentImaginary * wImaginary;
        currentImaginary = currentReal * wImaginary + currentImaginary * wReal;
        currentReal = nextReal;
      }
    }
  }
}

/**
 * A Hann window, cached by size.
 *
 * Without one, every frame's edges are a discontinuity and the transform smears energy
 * across the whole spectrum — which is exactly the peak structure the fingerprinter
 * depends on being clean.
 */
const windows = new Map<number, Float32Array>();

export function hannWindow(size: number): Float32Array {
  const cached = windows.get(size);
  if (cached) return cached;

  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  windows.set(size, window);
  return window;
}

/**
 * Magnitudes for one frame, in the same shape the web path produced.
 *
 * The web returns decibels shifted into positive territory; this matches that, because
 * `findPeaks` compares magnitudes against neighbours and a different scale would move
 * the peaks. Silence becomes zero rather than negative infinity.
 */
export function frameMagnitudes(samples: Float32Array, fftSize = FFT_SIZE): Float32Array {
  const real = new Float32Array(fftSize);
  const imaginary = new Float32Array(fftSize);
  const window = hannWindow(fftSize);

  const usable = Math.min(samples.length, fftSize);
  for (let i = 0; i < usable; i++) real[i] = samples[i] * window[i];

  fft(real, imaginary);

  const bins = fftSize / 2;
  const output = new Float32Array(bins);
  for (let i = 0; i < bins; i++) {
    const magnitude = Math.sqrt(real[i] * real[i] + imaginary[i] * imaginary[i]);
    // Same shift the web path applies, so a reference built on either matches a
    // sample taken on the other.
    const decibels = 20 * Math.log10(magnitude + 1e-12);
    output[i] = Math.max(0, decibels + 100);
  }
  return output;
}

/**
 * A whole spectrogram from PCM.
 *
 * Frames overlap by `fftSize - hopSize`, which is what gives the fingerprinter enough
 * time resolution to place a match to within a fraction of a second.
 */
export function spectrogramFromPcm(
  samples: Float32Array,
  options: { fftSize?: number; hopSize?: number } = {},
): Float32Array[] {
  const fftSize = options.fftSize ?? FFT_SIZE;
  const hopSize = options.hopSize ?? HOP_SIZE;

  const frames: Float32Array[] = [];
  for (let offset = 0; offset + fftSize <= samples.length; offset += hopSize) {
    frames.push(frameMagnitudes(samples.subarray(offset, offset + fftSize), fftSize));
  }
  return frames;
}
