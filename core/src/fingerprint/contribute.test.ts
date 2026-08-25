import { describe, expect, it } from 'vitest';
import { ContributionRecorder } from './contribute';
import { spectrogramFromPcm } from './spectrogram';
import { SpectrogramStream } from './stream';
import {
  HOP_SIZE,
  SAMPLE_RATE,
  buildReference,
  deserialiseReference,
  fingerprint,
  matchSample,
} from './fingerprint';

/** Audio whose spectrum keeps changing, so landmarks are distinctive over time. */
function signal(seconds: number, rate: number, seed = 4242): Float32Array {
  const samples = new Float32Array(Math.round(seconds * rate));
  const next = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const segment = Math.round(rate * 0.2);
  for (let start = 0; start < samples.length; start += segment) {
    const tones = [300 + next() * 2500, 300 + next() * 2500, 300 + next() * 2500];
    const end = Math.min(start + segment, samples.length);
    for (let i = start; i < end; i++) {
      const t = i / rate;
      let value = 0;
      for (const hz of tones) value += Math.sin(2 * Math.PI * hz * t);
      samples[i] = value / tones.length;
    }
  }
  return samples;
}

const spectrogram = spectrogramFromPcm(signal(20, SAMPLE_RATE));

describe('ContributionRecorder', () => {
  it('produces exactly what hashing the whole spectrogram produces', () => {
    // The requirement the whole class exists to meet. A phone that hashes incrementally
    // and a laptop that hashes in one go must describe the same audio identically, or
    // their references silently fail to interoperate.
    const recorder = new ContributionRecorder();
    for (const frame of spectrogram) recorder.pushFrame(frame);
    const { hashes, frames } = recorder.finish();

    const expected = fingerprint(spectrogram);
    expect(frames).toBe(spectrogram.length);
    expect(hashes.length).toBe(expected.length * 2);

    expected.forEach((hash, index) => {
      expect(hashes[index * 2]).toBe(hash.hash);
      expect(hashes[index * 2 + 1]).toBe(hash.frame);
    });
  });

  it('does not care how the frames are batched', () => {
    const batched = new ContributionRecorder();
    let offset = 0;
    for (const size of [1, 17, 3, 200, 41]) {
      while (offset < spectrogram.length) {
        batched.push(spectrogram.slice(offset, offset + size));
        offset += size;
        break;
      }
    }
    batched.push(spectrogram.slice(offset));

    const whole = new ContributionRecorder();
    whole.push(spectrogram);

    expect(Array.from(batched.finish().hashes)).toEqual(Array.from(whole.finish().hashes));
  });

  it('keeps only a fanout of peaks in memory, however long the recording', () => {
    // The reason it can record a whole episode on a phone. Measured through the public
    // surface: hashes committed should keep pace with frames pushed rather than all
    // arriving at the end, which is what holding everything would look like.
    const recorder = new ContributionRecorder();
    recorder.push(spectrogram.slice(0, 400));
    const early = recorder.hashCount;

    recorder.push(spectrogram.slice(400, 800));
    expect(recorder.hashCount).toBeGreaterThan(early * 1.5);
    expect(early).toBeGreaterThan(0);
  });

  it('hashes the tail rather than dropping it', () => {
    // The last fanout's worth of anchors are still pending when recording stops, and
    // losing them would quietly truncate every contribution by half a second.
    const short = spectrogram.slice(0, 60);
    const recorder = new ContributionRecorder();
    recorder.push(short);

    const before = recorder.hashCount;
    const { hashes } = recorder.finish();
    expect(hashes.length / 2).toBeGreaterThan(before);
    expect(hashes.length / 2).toBe(fingerprint(short).length);
  });

  it('stamps frames in episode time, not recording time', () => {
    // The bug this guards against does not look like a bug. A contribution recorded
    // twelve minutes in and stamped from zero produces a reference that matches
    // perfectly and reports every position twelve minutes early.
    const start = 900; // roughly twenty seconds in at the analysis rate
    const offset = new ContributionRecorder({ startFrame: start });
    offset.push(spectrogram.slice(0, 200));
    const shifted = offset.finish();

    const plain = new ContributionRecorder();
    plain.push(spectrogram.slice(0, 200));
    const base = plain.finish();

    expect(shifted.hashes.length).toBe(base.hashes.length);
    for (let i = 0; i < base.hashes.length; i += 2) {
      expect(shifted.hashes[i]).toBe(base.hashes[i]); // the landmark is the same
      expect(shifted.hashes[i + 1]).toBe(base.hashes[i + 1] + start); // its time is not
    }

    // And the stored extent is where it ended in the episode, not how long it ran.
    expect(shifted.frames).toBe(start + 200);
    expect(base.frames).toBe(200);
  });

  it('places a partial contribution at its real position in the episode', () => {
    // Record only the middle of the episode, then look up a moment inside it. The
    // answer must be where it is in the episode, not where it is in the recording.
    const from = 400;
    const recorder = new ContributionRecorder({ startFrame: from });
    recorder.push(spectrogram.slice(from, from + 300));
    const reference = deserialiseReference(recorder.finish().hashes);

    const match = matchSample(fingerprint(spectrogram.slice(from + 120, from + 220)), reference);
    expect(match?.offsetFrames).toBe(from + 120);
  });

  it('records nothing from nothing', () => {
    const { hashes, frames } = new ContributionRecorder().finish();
    expect(frames).toBe(0);
    expect(hashes.length).toBe(0);
  });

  it('starts over on reset', () => {
    const recorder = new ContributionRecorder();
    recorder.push(spectrogram.slice(0, 100));
    recorder.reset();
    expect(recorder.frameCount).toBe(0);
    expect(recorder.hashCount).toBe(0);
    expect(recorder.finish().hashes.length).toBe(0);
  });

  it('yields a reference that a live capture actually matches', () => {
    // End to end, and through the wire format: contribute from streamed audio, then
    // locate a later slice of the same audio in what came back.
    const recorder = new ContributionRecorder();
    const capture = new SpectrogramStream({ sourceRate: 48_000 });
    const source = signal(20, 48_000);
    for (let offset = 0; offset < source.length; offset += 4096) {
      recorder.push(capture.push(source.slice(offset, offset + 4096)));
    }

    const { hashes } = recorder.finish();
    const reference = deserialiseReference(hashes);

    const sample = new SpectrogramStream({ sourceRate: 48_000 });
    const frames: Float32Array[] = [];
    const slice = source.slice(Math.round(9 * 48_000), Math.round(15 * 48_000));
    for (let offset = 0; offset < slice.length; offset += 4096) {
      frames.push(...sample.push(slice.slice(offset, offset + 4096)));
    }

    const match = matchSample(fingerprint(frames), reference);
    expect(match).toBeDefined();
    // The offset places the slice's start at nine seconds into the recording.
    const startMs = (match!.offsetFrames * HOP_SIZE * 1000) / SAMPLE_RATE;
    expect(Math.abs(startMs - 9_000)).toBeLessThan(120);
  });

  it('agrees with a reference built the web app’s way', () => {
    const streamed = new ContributionRecorder();
    streamed.push(spectrogram);
    const fromStream = deserialiseReference(streamed.finish().hashes);
    const fromWhole = buildReference(fingerprint(spectrogram));

    expect(fromStream.size).toBe(fromWhole.size);
    for (const [hash, frames] of fromWhole) {
      expect(fromStream.get(hash)).toEqual(frames);
    }
  });
});
