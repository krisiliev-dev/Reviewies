import {
  CAPTURE_MS,
  FFT_SIZE,
  HOP_SIZE,
  SAMPLE_RATE,
  fingerprint,
  framesToMs,
  matchSample,
  type Reference,
} from '@reviewies/core/fingerprint/fingerprint';
import { SpectrogramStream } from '@reviewies/core/fingerprint/stream';
import { ContributionRecorder } from '@reviewies/core/fingerprint/contribute';
import { framesForMs } from '@reviewies/core/fingerprint/continuous';

// Re-exported for the screens that show what the capture will do.
export { CAPTURE_MS, FFT_SIZE, HOP_SIZE, SAMPLE_RATE };

/**
 * Microphone capture for automatic sync.
 *
 * Listens to a few seconds of room audio, fingerprints it locally, and matches against
 * the episode's reference timeline to recover the playback position.
 *
 * Non-negotiables, and the reason this is written the way it is:
 *
 *  - **Audio never leaves the device.** Fingerprinting happens here; only hashes are
 *    ever uploaded, and a hash is a one-way digest rather than a reproduction.
 *  - **The microphone runs only for an explicit, bounded capture.** No ambient
 *    listening, and the track is stopped the moment the sample is taken.
 *  - **Consent is per-use and specific**, not buried in a policy.
 *
 * ## Why this reads raw PCM rather than asking an AnalyserNode
 *
 * The obvious implementation, and the one this replaces, polls
 * `AnalyserNode.getFloatFrequencyData` on a timer set to the hop interval. It is much
 * less code and it is wrong in a way that does not show up locally.
 *
 * An analyser hands back whatever its buffer holds at the moment it is asked. It has no
 * notion of the caller wanting consecutive, evenly-spaced frames. A timer that fires
 * late duplicates a frame; one that fires twice in quick succession skips audio; a
 * throttled tab does both for minutes at a time. Meanwhile `framesToMs` — the function
 * that turns a match into a timecode — assumes every frame is exactly one hop after the
 * one before it. So the position it derives drifts with timer jitter, and a reference
 * contributed from a browser encodes that drift permanently, for everyone who later
 * matches against it.
 *
 * That is the same failure this codebase keeps running into: a reference built one way
 * and a sample taken another way share no landmarks, and nothing reports an error —
 * matching simply misses. The phone computes exact overlapping frames from PCM. So does
 * this now, through the same `SpectrogramStream`, so both platforms turn identical audio
 * into identical frames.
 */

export interface CaptureResult {
  positionMs: number;
  confidence: number;
  /**
   * The audio heard occurs in more than one place, and this is only one of them.
   *
   * The one-shot path has no clock to break the tie with — that is what makes it the
   * one-shot path — so unlike the phone's continuous session it cannot check the
   * placement against where playback already was. All it can do is place the sample and
   * say that it might be the other one, which is what the screen then does.
   */
  ambiguous: boolean;
}

export function micSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/**
 * The worklet that does the actual reading, as source text.
 *
 * Inline and loaded from a blob URL rather than shipped as a separate asset, because an
 * `audioWorklet.addModule` path has to survive dev server, production build and
 * whatever base path the app is deployed under. A blob is none of those things'
 * business.
 *
 * It buffers before posting: `process` is called every 128 frames, which at the analysis
 * rate is 172 times a second, and posting each one separately spends more time in
 * message passing than in analysis.
 */
const WORKLET_SOURCE = `
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(2048);
    this.used = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.used++] = channel[i];
      if (this.used === this.buffer.length) {
        this.port.postMessage(this.buffer.slice(0));
        this.used = 0;
      }
    }
    return true;
  }
}
registerProcessor('reviewies-recorder', RecorderProcessor);
`;

interface Microphone {
  /** The rate the hardware actually chose, which is not always the one requested. */
  sampleRate: number;
  close: () => void;
}

/**
 * Open the microphone and deliver raw PCM until closed.
 *
 * Prefers an AudioWorklet, which runs on the audio thread and cannot be starved by the
 * main thread. Falls back to a ScriptProcessorNode — deprecated, and still the only
 * thing that works on older Safari, which is a real share of the people who would open
 * this in a browser at all.
 */
async function openMicrophone(
  // The rate comes with every buffer rather than being read off the returned handle:
  // the audio graph is connected before `openMicrophone` returns, so the first buffers
  // can arrive while the caller is still waiting on the promise.
  onSamples: (pcm: Float32Array, sampleRate: number) => void,
): Promise<Microphone> {
  if (!micSupported()) throw new Error('No microphone available');

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      // Processing meant to flatter speech actively harms fingerprinting.
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  // Asking for the analysis rate makes the resampler a pass-through when the hardware
  // agrees. When it does not, `SpectrogramStream` resamples rather than pretending.
  const context = new AudioContext({ sampleRate: SAMPLE_RATE });
  let blobUrl: string | undefined;

  const close = () => {
    for (const track of stream.getTracks()) track.stop();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    void context.close().catch(() => {});
  };

  try {
    const source = context.createMediaStreamSource(stream);

    // A recording node still has to be connected to something for it to be pulled at
    // all, and connecting it straight to the speakers in a room with a television
    // playing is how you get feedback. Silenced first, then connected.
    const silence = context.createGain();
    silence.gain.value = 0;
    silence.connect(context.destination);

    if (context.audioWorklet) {
      blobUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
      await context.audioWorklet.addModule(blobUrl);

      const node = new AudioWorkletNode(context, 'reviewies-recorder');
      node.port.onmessage = (event) =>
        onSamples(event.data as Float32Array, context.sampleRate);
      source.connect(node);
      node.connect(silence);
    } else {
      const node = context.createScriptProcessor(2048, 1, 1);
      node.onaudioprocess = (event) => {
        // Copied, not passed through: the event's buffer is reused by the next call.
        onSamples(new Float32Array(event.inputBuffer.getChannelData(0)), context.sampleRate);
      };
      source.connect(node);
      node.connect(silence);
    }

    return { sampleRate: context.sampleRate, close };
  } catch (err) {
    close();
    throw err;
  }
}

/**
 * Record for a fixed duration, feeding every sample through a consumer.
 *
 * Time is kept by the audio itself rather than by a wall clock: the loop ends when
 * enough frames have arrived, so a stalled tab produces a shorter recording rather than
 * a recording that claims a length it does not have.
 */
async function record(
  durationMs: number,
  consume: (frames: Float32Array[]) => void,
  opts: { signal?: AbortSignal } = {},
): Promise<number> {
  const wanted = framesForMs(durationMs, HOP_SIZE, SAMPLE_RATE);
  let produced = 0;

  let settle: () => void;
  const done = new Promise<void>((resolve) => {
    settle = resolve;
  });

  let stream: SpectrogramStream | undefined;
  const microphone = await openMicrophone((pcm, sampleRate) => {
    // Built on the first buffer, when the hardware's real rate is known.
    stream ??= new SpectrogramStream({ sourceRate: sampleRate });
    const frames = stream.push(pcm);
    if (frames.length === 0) return;

    consume(frames);
    produced += frames.length;
    if (produced >= wanted) settle();
  });

  const onAbort = () => settle();
  opts.signal?.addEventListener('abort', onAbort);

  // A ceiling in real time as well, so a microphone that goes silent at the driver
  // level cannot hang the screen waiting for frames that will never arrive.
  const guard = setTimeout(() => settle(), durationMs * 2 + 2000);

  try {
    await done;
  } finally {
    clearTimeout(guard);
    opts.signal?.removeEventListener('abort', onAbort);
    microphone.close();
  }

  if (opts.signal?.aborted) throw new Error('Capture cancelled');
  return produced;
}

/** Record a short sample and turn it into a spectrogram. */
export async function captureSpectrogram(
  durationMs = CAPTURE_MS,
  opts: { signal?: AbortSignal } = {},
): Promise<Float32Array[]> {
  const spectrogram: Float32Array[] = [];
  await record(durationMs, (frames) => spectrogram.push(...frames), opts);
  return spectrogram;
}

/** Capture and locate the current position within a known episode. */
export async function syncByListening(
  reference: Reference,
  opts: { durationMs?: number; signal?: AbortSignal } = {},
): Promise<CaptureResult | undefined> {
  const spectrogram = await captureSpectrogram(opts.durationMs ?? CAPTURE_MS, opts);
  const match = matchSample(fingerprint(spectrogram), reference);
  if (!match) return undefined;

  // The offset locates the *start* of the sample, so add its length to land on where
  // playback is now rather than where it was when listening began.
  const sampleMs = framesToMs(spectrogram.length, HOP_SIZE, SAMPLE_RATE);

  return {
    positionMs: framesToMs(match.offsetFrames, HOP_SIZE, SAMPLE_RATE) + sampleMs,
    confidence: match.confidence,
    ambiguous: match.ambiguous,
  };
}

/**
 * Build a reference timeline to contribute for an episode.
 *
 * Only ever called after an explicit opt-in, and only from a session the user has synced
 * accurately by hand — a wrong contribution would misplace everyone else's reactions.
 * Cross-validating contributions against each other before trusting one is what the
 * `promote-fingerprint` function does.
 *
 * `startMs` is where the clock had reached when recording began, and it is not optional
 * in any meaningful sense. A reference's frame numbers are read as positions in the
 * episode, so a recording taken twelve minutes in and stamped from zero does not
 * describe a fragment — it asserts the episode starts there, and everyone who later
 * syncs against it is placed twelve minutes early.
 */
export async function captureContribution(
  durationMs: number,
  opts: { signal?: AbortSignal; startMs?: number } = {},
): Promise<{ hashes: Uint32Array; frames: number }> {
  // Hashed as the audio arrives rather than held whole, so the length someone is willing
  // to sit through is not bounded by memory.
  const recorder = new ContributionRecorder({
    startFrame: framesForMs(opts.startMs ?? 0, HOP_SIZE, SAMPLE_RATE),
  });
  await record(durationMs, (frames) => recorder.push(frames), opts);
  return recorder.finish();
}
