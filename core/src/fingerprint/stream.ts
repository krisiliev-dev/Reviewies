/**
 * Turning a live microphone stream into spectrogram frames.
 *
 * The web path never needed this: `AnalyserNode` was handed an `AudioContext` opened
 * at the analysis rate and gave back finished frequency frames. A phone gives raw PCM
 * at whatever rate the hardware chose, in buffers whose length has nothing to do with
 * the FFT size, and interleaved if the microphone is stereo. Everything between "raw
 * PCM buffer" and "frame the fingerprinter can read" lives here.
 *
 * It is written as a push pipeline with carried state rather than as a function over a
 * whole recording, because the point of task 40 is continuous listening: correcting
 * drift every few seconds for as long as an episode runs, not taking one sample and
 * dead-reckoning from it. Buffers arrive every few dozen milliseconds and must be
 * consumed and dropped, so no stage may hold the whole stream.
 *
 * Three joins have to be seamless, and each is a place a naive implementation loses
 * or duplicates samples at every buffer boundary — audibly harmless, but enough to
 * shift the spectrum and cost the match:
 *
 *  - downmix, which is per-sample and stateless;
 *  - resampling, which carries a fractional read position between buffers;
 *  - framing, which carries `fftSize - hopSize` samples of overlap between frames.
 */

import { FFT_SIZE, HOP_SIZE, SAMPLE_RATE } from './fingerprint';
import { frameMagnitudes } from './spectrogram';

/**
 * Collapse interleaved channels to mono by averaging.
 *
 * Averaging rather than taking the left channel: a phone held near a stereo television
 * hears both speakers anyway, and dropping half the signal only costs landmarks.
 */
export function downmix(interleaved: Float32Array, channels: number): Float32Array {
  if (channels <= 1) return interleaved;

  const frames = Math.floor(interleaved.length / channels);
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += interleaved[i * channels + c];
    mono[i] = sum / channels;
  }
  return mono;
}

/** Read `int16` PCM, which some hardware paths prefer, as the floats everything else speaks. */
export function int16ToFloat(data: Int16Array): Float32Array {
  const out = new Float32Array(data.length);
  // 32768 rather than 32767: the format is asymmetric, and dividing by the larger
  // magnitude is what keeps full-scale negative peaks inside [-1, 1].
  for (let i = 0; i < data.length; i++) out[i] = data[i] / 32768;
  return out;
}

/**
 * A linear resampler that survives being fed in pieces.
 *
 * Linear interpolation is cheap and imprecise, and that is the right trade here:
 * fingerprinting looks at where spectral peaks are, not at how clean the audio sounds,
 * and the imprecision costs a fraction of a bin. A polyphase filter would cost far
 * more CPU on a phone that is also playing back reactions.
 *
 * The state that matters is `phase`: the fractional read position left over when the
 * previous buffer ran out. Resetting it to zero for each buffer — the obvious thing to
 * write — inserts a small timing discontinuity at every boundary, dozens of times a
 * second, which smears exactly the peaks the fingerprint depends on.
 */
export class Resampler {
  readonly sourceRate: number;
  readonly targetRate: number;
  // Annotated rather than inferred: `new Float32Array(0)` infers a view over a plain
  // ArrayBuffer, which then refuses the `subarray` results assigned to it later.
  private pending: Float32Array = new Float32Array(0);
  private phase = 0;

  constructor(sourceRate: number, targetRate: number = SAMPLE_RATE) {
    if (!(sourceRate > 0) || !(targetRate > 0)) {
      throw new Error(`Sample rates must be positive, got ${sourceRate} -> ${targetRate}`);
    }
    this.sourceRate = sourceRate;
    this.targetRate = targetRate;
  }

  /** True when the rates match and the resampler is a pass-through. */
  get isIdentity(): boolean {
    return this.sourceRate === this.targetRate;
  }

  push(samples: Float32Array): Float32Array {
    if (this.isIdentity) return samples;

    const buffer = concat(this.pending, samples);
    const ratio = this.sourceRate / this.targetRate;

    // The last sample has no successor to interpolate towards, so it is held back
    // rather than extrapolated from — it will be the first sample of the next buffer.
    const limit = buffer.length - 1;
    if (limit <= 0) {
      this.pending = buffer;
      return new Float32Array(0);
    }

    const count = Math.max(0, Math.ceil((limit - this.phase) / ratio));
    const out = new Float32Array(count);

    let position = this.phase;
    for (let i = 0; i < count; i++) {
      const index = Math.floor(position);
      const fraction = position - index;
      out[i] = buffer[index] * (1 - fraction) + buffer[index + 1] * fraction;
      position += ratio;
    }

    const consumed = Math.floor(position);
    this.pending = buffer.subarray(consumed);
    this.phase = position - consumed;
    return out;
  }

  reset(): void {
    this.pending = new Float32Array(0);
    this.phase = 0;
  }
}

export interface SpectrogramStreamOptions {
  /** What the hardware is actually delivering. Read it from the stream, never assume. */
  sourceRate: number;
  /** Interleaved channel count. */
  channels?: number;
  fftSize?: number;
  hopSize?: number;
  /** Called once per completed frame, in order. */
  onFrame?: (frame: Float32Array, index: number) => void;
}

/**
 * PCM in, spectrogram frames out.
 *
 * Frames overlap by `fftSize - hopSize`, which is why the tail of each analysis window
 * is kept rather than dropped: the next frame starts one hop later, not one window
 * later.
 */
export class SpectrogramStream {
  readonly sourceRate: number;
  private readonly resampler: Resampler;
  private readonly channels: number;
  private readonly fftSize: number;
  private readonly hopSize: number;
  private readonly onFrame?: (frame: Float32Array, index: number) => void;
  private buffer: Float32Array = new Float32Array(0);
  private emitted = 0;

  constructor(options: SpectrogramStreamOptions) {
    this.sourceRate = options.sourceRate;
    this.channels = options.channels ?? 1;
    this.fftSize = options.fftSize ?? FFT_SIZE;
    this.hopSize = options.hopSize ?? HOP_SIZE;
    this.onFrame = options.onFrame;
    this.resampler = new Resampler(options.sourceRate);
  }

  /** Frames produced since the last reset. Doubles as the stream's clock. */
  get frameCount(): number {
    return this.emitted;
  }

  /** Push one hardware buffer. Returns the frames it completed. */
  push(interleaved: Float32Array): Float32Array[] {
    const resampled = this.resampler.push(downmix(interleaved, this.channels));
    this.buffer = concat(this.buffer, resampled);

    const frames: Float32Array[] = [];
    let offset = 0;
    while (offset + this.fftSize <= this.buffer.length) {
      const frame = frameMagnitudes(
        this.buffer.subarray(offset, offset + this.fftSize),
        this.fftSize,
      );
      frames.push(frame);
      this.onFrame?.(frame, this.emitted);
      this.emitted++;
      offset += this.hopSize;
    }

    // Keep the overlap. `subarray` is a view into the old buffer, so copy: otherwise
    // every buffer would keep the whole stream alive behind a shrinking window.
    this.buffer = this.buffer.slice(offset);
    return frames;
  }

  reset(): void {
    this.resampler.reset();
    this.buffer = new Float32Array(0);
    this.emitted = 0;
  }
}

function concat(a: Float32Array, b: Float32Array): Float32Array {
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  const out = new Float32Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
