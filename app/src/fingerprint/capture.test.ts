import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAPTURE_MS, FFT_SIZE, HOP_SIZE, SAMPLE_RATE, micSupported } from './capture';
import { spectrogramFromPcm } from '@reviewies/core/fingerprint/spectrogram';

/**
 * The seam between a browser's audio graph and the analysis.
 *
 * The algorithm is tested in the core. What is left here is the part that genuinely
 * needs a browser — and it is not incidental glue, it is where the previous
 * implementation was wrong. Polling an `AnalyserNode` on a timer produced frames whose
 * spacing depended on when the timer happened to fire, while every timecode derived
 * from them assumed exact hop spacing. So these tests are mostly one assertion in
 * different clothes: whatever shape the audio arrives in, the frames must be the frames
 * that audio actually contains.
 */

/** A tone, so the spectrum has a knowable answer. */
function tone(hz: number, samples: number, rate = SAMPLE_RATE): Float32Array {
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i++) out[i] = Math.sin((2 * Math.PI * hz * i) / rate);
  return out;
}

interface FakeAudio {
  /** Resolves once the recorder is connected and buffers will be accepted. */
  ready: Promise<void>;
  feed: (pcm: Float32Array) => void;
  /** Deliver a signal in pieces of varying length, as hardware does. */
  feedInChunks: (pcm: Float32Array, sizes: number[]) => void;
  tracksStopped: () => number;
  contextClosed: () => boolean;
  gains: () => number[];
}

/**
 * A Web Audio graph that does nothing but hand over what it is given.
 *
 * jsdom has no audio, so the alternative to this is not testing the seam at all — which
 * is how the old implementation shipped.
 */
function installFakeAudio(opts: { sampleRate?: number; worklet?: boolean } = {}): FakeAudio {
  const sampleRate = opts.sampleRate ?? SAMPLE_RATE;
  const useWorklet = opts.worklet ?? true;

  let sink: ((pcm: Float32Array) => void) | undefined;
  let stopped = 0;
  let closed = false;
  const gains: number[] = [];
  let announceReady: () => void;
  const ready = new Promise<void>((resolve) => {
    announceReady = resolve;
  });

  const tracks = [{ stop: () => stopped++ }];
  const stream = { getTracks: () => tracks };

  class FakeContext {
    readonly sampleRate = sampleRate;
    readonly destination = {};
    readonly audioWorklet = useWorklet ? { addModule: async () => {} } : undefined;

    createMediaStreamSource() {
      return { connect: () => {} };
    }
    createGain() {
      const node = { gain: { value: 1 }, connect: () => {} };
      // Recorded at connect time, which is after the caller has set it.
      queueMicrotask(() => gains.push(node.gain.value));
      return node;
    }
    createScriptProcessor() {
      const node = {
        onaudioprocess: undefined as ((e: unknown) => void) | undefined,
        connect: () => {},
      };
      queueMicrotask(() => {
        sink = (pcm) =>
          node.onaudioprocess?.({ inputBuffer: { getChannelData: () => pcm } });
        announceReady();
      });
      return node;
    }
    async close() {
      closed = true;
    }
  }

  class FakeWorkletNode {
    readonly port = { onmessage: undefined as ((e: { data: Float32Array }) => void) | undefined };
    connect() {}
    constructor() {
      queueMicrotask(() => {
        sink = (pcm) => this.port.onmessage?.({ data: pcm });
        announceReady();
      });
    }
  }

  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('AudioWorkletNode', FakeWorkletNode);
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: () => 'blob:fake',
    revokeObjectURL: () => {},
  });
  vi.stubGlobal('Blob', class {});
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: async () => stream },
  });

  const feed = (pcm: Float32Array) => {
    if (!sink) throw new Error('fed before the recorder was connected');
    sink(pcm);
  };

  return {
    ready,
    feed,
    feedInChunks: (pcm, sizes) => {
      let offset = 0;
      let i = 0;
      while (offset < pcm.length) {
        const size = sizes[i++ % sizes.length];
        feed(pcm.slice(offset, offset + size));
        offset += size;
      }
    },
    tracksStopped: () => stopped,
    contextClosed: () => closed,
    gains: () => gains,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('what capture reports about itself', () => {
  it('reports the microphone as unavailable in jsdom rather than throwing', () => {
    // The important property is that it answers. Watching Mode offers manual sync as
    // the fallback, so an honest "no" is a working path and an exception is not.
    expect(typeof micSupported()).toBe('boolean');
  });

  it('uses the same analysis parameters as the algorithm it feeds', () => {
    // A reference built at one FFT size cannot be matched against a sample taken at
    // another, and the failure is silent — every match simply misses.
    expect(FFT_SIZE).toBe(2048);
    expect(HOP_SIZE).toBe(512);
    expect(CAPTURE_MS).toBe(6000);
    expect(SAMPLE_RATE).toBe(22_050);
  });
});

describe('capturing through a browser audio graph', () => {
  it('produces exactly the frames the audio contains', async () => {
    const audio = installFakeAudio();
    const { captureSpectrogram } = await import('./capture');

    const signal = tone(1000, SAMPLE_RATE * 2);
    const pending = captureSpectrogram(1000);
    await audio.ready;
    audio.feedInChunks(signal, [2048]);

    const captured = await pending;
    const expected = spectrogramFromPcm(signal);

    expect(captured.length).toBeGreaterThan(40);
    captured.forEach((frame, i) => {
      expect(Array.from(frame)).toEqual(Array.from(expected[i]));
    });
  });

  it('gives the same answer however unevenly the buffers arrive', async () => {
    // The heart of it. Buffer boundaries are a fact of the hardware and have nothing to
    // do with the hop size; frames must not shift because a buffer was short.
    const audio = installFakeAudio();
    const { captureSpectrogram } = await import('./capture');

    const signal = tone(1400, SAMPLE_RATE * 2);
    const pending = captureSpectrogram(1000);
    await audio.ready;
    audio.feedInChunks(signal, [128, 4096, 37, 1024, 900]);

    const captured = await pending;
    const expected = spectrogramFromPcm(signal);
    // Asserted before the comparison, so an empty capture cannot pass by having nothing
    // to disagree about.
    expect(captured.length).toBeGreaterThan(40);
    captured.forEach((frame, i) => {
      expect(Array.from(frame)).toEqual(Array.from(expected[i]));
    });
  });

  it('resamples hardware that ignores the requested rate', async () => {
    const audio = installFakeAudio({ sampleRate: 48_000 });
    const { captureSpectrogram } = await import('./capture');

    const hz = 1500;
    const pending = captureSpectrogram(1000);
    await audio.ready;
    audio.feedInChunks(tone(hz, 48_000 * 2, 48_000), [4096]);

    const captured = await pending;
    const frame = captured[10];
    let peak = 0;
    for (let bin = 1; bin < frame.length; bin++) if (frame[bin] > frame[peak]) peak = bin;

    // The tone lands where the analysis rate says it should, not where 48kHz would.
    expect(Math.abs(peak - Math.round((hz * FFT_SIZE) / SAMPLE_RATE))).toBeLessThanOrEqual(1);
  });

  it('works through a ScriptProcessorNode for browsers without worklets', async () => {
    const audio = installFakeAudio({ worklet: false });
    const { captureSpectrogram } = await import('./capture');

    const signal = tone(1000, SAMPLE_RATE * 2);
    const pending = captureSpectrogram(1000);
    await audio.ready;
    audio.feedInChunks(signal, [2048]);

    const captured = await pending;
    expect(Array.from(captured[5])).toEqual(Array.from(spectrogramFromPcm(signal)[5]));
  });

  it('releases the microphone when it is done', async () => {
    // Leaving the recording indicator on is the single thing most likely to lose
    // someone's trust in a feature that listens to their room.
    const audio = installFakeAudio();
    const { captureSpectrogram } = await import('./capture');

    const pending = captureSpectrogram(500);
    await audio.ready;
    audio.feedInChunks(tone(800, SAMPLE_RATE), [2048]);
    await pending;

    expect(audio.tracksStopped()).toBe(1);
    expect(audio.contextClosed()).toBe(true);
  });

  it('releases the microphone when cancelled part-way', async () => {
    const audio = installFakeAudio();
    const { captureSpectrogram } = await import('./capture');

    const controller = new AbortController();
    const pending = captureSpectrogram(30_000, { signal: controller.signal });
    await audio.ready;
    audio.feed(tone(800, 4096));
    controller.abort();

    await expect(pending).rejects.toThrow(/cancelled/i);
    expect(audio.tracksStopped()).toBe(1);
  });

  it('never routes the microphone back to the speakers', async () => {
    // The recorder has to be connected to something to be pulled at all, and the
    // obvious something is the destination — in a room with a television playing.
    const audio = installFakeAudio();
    const { captureSpectrogram } = await import('./capture');

    const pending = captureSpectrogram(500);
    await audio.ready;
    audio.feedInChunks(tone(800, SAMPLE_RATE), [2048]);
    await pending;

    expect(audio.gains()).toEqual([0]);
  });

  it('stamps a contribution with where the episode had reached', async () => {
    const audio = installFakeAudio();
    const { captureContribution } = await import('./capture');

    const pending = captureContribution(1000, { startMs: 600_000 });
    await audio.ready;
    audio.feedInChunks(tone(900, SAMPLE_RATE * 2), [2048]);

    const { hashes, frames } = await pending;
    expect(hashes.length).toBeGreaterThan(0);

    // Frames are episode time. A contribution starting ten minutes in must say so, or
    // it claims the episode begins there and misplaces everyone who uses it.
    const startFrame = Math.round((600 * SAMPLE_RATE) / HOP_SIZE);
    for (let i = 1; i < hashes.length; i += 2) {
      expect(hashes[i]).toBeGreaterThanOrEqual(startFrame);
    }
    expect(frames).toBeGreaterThan(startFrame);
  });
});
