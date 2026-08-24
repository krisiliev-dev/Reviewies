import {
  CAPTURE_MS,
  FFT_SIZE,
  HOP_SIZE,
  fingerprint,
  framesToMs,
  matchSample,
  type Reference,
} from '@reviewies/core/fingerprint/fingerprint';

// Re-exported for the screens that show what the capture will do.
export { CAPTURE_MS, FFT_SIZE, HOP_SIZE };

/**
 * Microphone capture for automatic sync.
 *
 * Listens to a few seconds of room audio, fingerprints it locally, and matches
 * against the episode's reference timeline to recover the playback position.
 *
 * Non-negotiables, and the reason this is written the way it is:
 *
 *  - **Audio never leaves the device.** Fingerprinting happens here; only hashes are
 *    ever uploaded, and a hash is a one-way digest rather than a reproduction.
 *  - **The microphone runs only for an explicit, bounded capture.** No ambient
 *    listening, and the track is stopped the moment the sample is taken.
 *  - **Consent is per-use and specific**, not buried in a policy.
 */

export interface CaptureResult {
  positionMs: number;
  confidence: number;
}

export function micSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/**
 * Record a short sample and turn it into a spectrogram.
 *
 * The track is stopped in a finally block: failing to release the microphone would
 * leave the recording indicator on, which is exactly the kind of thing that destroys
 * trust in a feature like this.
 */
export async function captureSpectrogram(
  durationMs = CAPTURE_MS,
  opts: { signal?: AbortSignal } = {},
): Promise<Float32Array[]> {
  if (!micSupported()) throw new Error('No microphone available');

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      // Processing meant to flatter speech actively harms fingerprinting.
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  const context = new AudioContext({ sampleRate: 22_050 });

  try {
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser);

    const frames: Float32Array[] = [];
    const frameIntervalMs = (HOP_SIZE / context.sampleRate) * 1000;
    const deadline = Date.now() + durationMs;

    while (Date.now() < deadline) {
      if (opts.signal?.aborted) throw new Error('Capture cancelled');
      const frame = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(frame);
      // getFloatFrequencyData returns decibels, often -Infinity for silence.
      // Shift into positive magnitudes so peak-picking behaves.
      for (let i = 0; i < frame.length; i++) {
        frame[i] = Number.isFinite(frame[i]) ? Math.max(0, frame[i] + 100) : 0;
      }
      frames.push(frame);
      await new Promise((r) => setTimeout(r, frameIntervalMs));
    }

    return frames;
  } finally {
    // Release the microphone whatever happened.
    for (const track of stream.getTracks()) track.stop();
    void context.close().catch(() => {});
  }
}

/** Capture and locate the current position within a known episode. */
export async function syncByListening(
  reference: Reference,
  opts: { durationMs?: number; signal?: AbortSignal } = {},
): Promise<CaptureResult | undefined> {
  const spectrogram = await captureSpectrogram(opts.durationMs ?? CAPTURE_MS, opts);
  const match = matchSample(fingerprint(spectrogram), reference);
  if (!match) return undefined;

  // The offset locates the *start* of the sample, so add its length to land on
  // where playback is now rather than where it was when listening began.
  const sampleMs = framesToMs(spectrogram.length, HOP_SIZE, 22_050);

  return {
    positionMs: framesToMs(match.offsetFrames, HOP_SIZE, 22_050) + sampleMs,
    confidence: match.confidence,
  };
}

/**
 * Build a reference timeline to contribute for an episode.
 *
 * Only ever called after an explicit opt-in, and only from a session the user has
 * synced accurately by hand — a wrong contribution would misplace everyone else's
 * reactions. Cross-validating multiple contributions before trusting one is the
 * planned safeguard.
 */
export async function captureContribution(
  durationMs: number,
  opts: { signal?: AbortSignal } = {},
): Promise<{ hashes: Uint32Array; frames: number }> {
  const spectrogram = await captureSpectrogram(durationMs, opts);
  const hashes = fingerprint(spectrogram);

  const flat = new Uint32Array(hashes.length * 2);
  hashes.forEach((h, i) => {
    flat[i * 2] = h.hash;
    flat[i * 2 + 1] = h.frame;
  });

  return { hashes: flat, frames: spectrogram.length };
}
