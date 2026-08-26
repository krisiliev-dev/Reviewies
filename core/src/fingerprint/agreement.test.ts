import { describe, expect, it } from 'vitest';
import { agreesWith, chooseReference, type Contribution } from './agreement.ts';
import { ContributionRecorder } from './contribute.ts';
import { spectrogramFromPcm } from './spectrogram.ts';
import { HOP_SIZE, SAMPLE_RATE } from './fingerprint.ts';

/** Audio whose spectrum keeps changing, so any stretch is distinguishable. */
function episode(seconds: number, seed: number, rate = SAMPLE_RATE): Float32Array {
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

/** A microphone in a room: the same audio, but not the same recording of it. */
function degrade(spectrogram: Float32Array[], seed = 11): Float32Array[] {
  const next = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  return spectrogram.map((frame) => {
    const out = new Float32Array(frame.length);
    for (let i = 0; i < frame.length; i++) {
      out[i] = Math.max(0, frame[i] * (0.8 + next() * 0.4) + (next() - 0.5) * 4);
    }
    return out;
  });
}

// A minute each. Thirty seconds is not enough: corroboration requires fifteen seconds
// of *shared* coverage, and a fixture that cannot express two contributions overlapping
// by that much without being nearly identical tests the wrong thing.
const showA = spectrogramFromPcm(episode(60, 4242));
const showB = spectrogramFromPcm(episode(60, 9999));

/** Record a stretch of an episode, as somebody with a running clock would. */
function contribution(
  id: string,
  spectrogram: Float32Array[],
  fromFrame: number,
  toFrame: number,
  /** Where their hand-synced clock *thinks* they are, if it is wrong. */
  believedStart = fromFrame,
): Contribution {
  const recorder = new ContributionRecorder({ startFrame: believedStart });
  recorder.push(spectrogram.slice(fromFrame, toFrame));
  const { hashes, frames } = recorder.finish();
  return { id, hashes, frameCount: frames, hopSize: HOP_SIZE, sampleRate: SAMPLE_RATE };
}

describe('agreesWith', () => {
  it('agrees when two people mapped the same episode', () => {
    const first = contribution('a', showA, 0, 1800);
    const second = contribution('b', degrade(showA), 0, 1800);

    const verdict = agreesWith(first, second);
    expect(verdict.agrees).toBe(true);
    expect(Math.abs(verdict.offsetFrames!)).toBeLessThanOrEqual(1);
  });

  it('agrees when they mapped overlapping but different stretches', () => {
    // Nobody starts and stops at the same moment. Partial overlap is the normal case,
    // not the exception.
    const first = contribution('a', showA, 0, 1600);
    const second = contribution('b', degrade(showA), 900, 2500);

    // Sixteen seconds in common, and the verdict must not depend on which of the two is
    // handed in as the candidate — they cover very different amounts of the episode.
    expect(agreesWith(first, second).agrees).toBe(true);
    expect(agreesWith(second, first).agrees).toBe(true);
  });

  it('refuses when someone mapped a different episode', () => {
    // The failure this whole module exists for. Two episodes of the same show are
    // usually the same length, so the old frame-count check called this agreement.
    const first = contribution('a', showA, 0, 1800);
    const second = contribution('b', showB, 0, 1800);

    expect(first.frameCount).toBe(second.frameCount); // identical by the old test
    const verdict = agreesWith(first, second);
    expect(verdict.agrees).toBe(false);
    // Unrelated audio still shares a scattering of landmarks by coincidence, so the
    // honest verdict is that the evidence is weak rather than that there is none.
    expect(verdict.reason).toBe('weak-match');
    expect(verdict.confidence).toBeLessThan(0.1);
  });

  it('refuses when the audio matches but the clock does not', () => {
    // Right episode, badly synced. It would be promoted and would misplace everyone by
    // exactly the amount this person was out.
    const first = contribution('a', showA, 0, 1800);
    const second = contribution('b', degrade(showA), 0, 1800, 1200); // ~28s adrift

    const verdict = agreesWith(first, second);
    expect(verdict.agrees).toBe(false);
    expect(verdict.reason).toBe('mistimed');
    // And it says how far out, which is the useful part of the answer.
    expect(Math.abs(verdict.offsetFrames!)).toBeGreaterThan(1000);
  });

  it('tolerates the second or two two hand-synced clocks differ by', () => {
    const first = contribution('a', showA, 0, 1800);
    // Roughly two seconds of honest disagreement about when the episode started.
    const second = contribution('b', degrade(showA), 0, 1800, 86);

    expect(agreesWith(first, second).agrees).toBe(true);
  });

  it('refuses contributions analysed differently rather than calling it disagreement', () => {
    const first = contribution('a', showA, 0, 1800);
    const second = { ...contribution('b', showA, 0, 1800), sampleRate: 44_100 };

    const verdict = agreesWith(first, second);
    expect(verdict.agrees).toBe(false);
    expect(verdict.reason).toBe('different-analysis');
  });

  it('refuses an empty contribution', () => {
    const first = contribution('a', showA, 0, 1800);
    const empty = { ...first, id: 'b', hashes: new Uint32Array(0) };

    expect(agreesWith(first, empty).reason).toBe('empty');
    expect(agreesWith(empty, first).reason).toBe('empty');
  });

  it('refuses a sliver of overlap that could not carry a vote', () => {
    const first = contribution('a', showA, 0, 1800);
    const sliver = contribution('b', degrade(showA), 1750, 1800);

    const verdict = agreesWith(first, sliver);
    expect(verdict.agrees).toBe(false);
    expect(verdict.reason).toBe('too-short');
  });

  it('gives the same verdict whichever way round it is asked', () => {
    // chooseReference compares every pair, so an asymmetric verdict would make the
    // winner depend on iteration order. It is also just wrong: whether two recordings
    // are of the same audio cannot depend on which one is mentioned first.
    const pairs: Array<[ReturnType<typeof contribution>, ReturnType<typeof contribution>]> = [
      [contribution('a', showA, 0, 1800), contribution('b', degrade(showA), 0, 1800)],
      [contribution('a', showA, 0, 900), contribution('b', degrade(showA), 0, 2400)],
      [contribution('a', showA, 0, 1600), contribution('b', degrade(showA), 900, 2500)],
      [contribution('a', showA, 0, 1800), contribution('b', showB, 0, 1800)],
      [contribution('a', showA, 0, 900), contribution('b', showB, 0, 2400)],
    ];

    for (const [first, second] of pairs) {
      expect(agreesWith(first, second).agrees).toBe(agreesWith(second, first).agrees);
    }
  });

  it('refuses two contributions that cover different halves of the episode', () => {
    // They may both be perfectly good, but neither has checked the other's work — and
    // the old length-only test would have called them a matching pair.
    const firstHalf = contribution('a', showA, 0, 1200);
    const secondHalf = contribution('b', degrade(showA), 1300, 2500);

    expect(agreesWith(firstHalf, secondHalf).agrees).toBe(false);
  });
});

describe('chooseReference', () => {
  it('waits until enough people have agreed', () => {
    expect(chooseReference([contribution('a', showA, 0, 1800)])).toBeUndefined();
  });

  it('promotes what two people agree on', () => {
    const promotion = chooseReference([
      contribution('a', showA, 0, 1800),
      contribution('b', degrade(showA), 0, 1800),
    ]);

    expect(promotion?.agreement).toBe(2);
    expect(promotion?.supporters.length).toBe(1);
  });

  it('does not let one early mistake own the episode', () => {
    // The old promotion took the earliest contribution and counted votes for it, so a
    // wrong first upload won permanently and every correct one afterwards helped it.
    const promotion = chooseReference([
      contribution('wrong-episode', showB, 0, 1800),
      contribution('right-1', showA, 0, 1800),
      contribution('right-2', degrade(showA), 0, 1800),
      contribution('right-3', degrade(showA, 77), 300, 2100),
    ]);

    expect(promotion).toBeDefined();
    expect(promotion!.chosen.id).not.toBe('wrong-episode');
    expect(promotion!.agreement).toBe(3);
    expect(promotion!.supporters).not.toContain('wrong-episode');
  });

  it('refuses to promote anything when nobody corroborates anybody', () => {
    const promotion = chooseReference([
      contribution('a', showA, 0, 1800),
      contribution('b', showB, 0, 1800),
    ]);

    expect(promotion).toBeUndefined();
  });

  it('prefers the fuller contribution when support is equal', () => {
    const promotion = chooseReference([
      contribution('short', showA, 0, 900),
      contribution('long', degrade(showA), 0, 2400),
    ]);

    expect(promotion?.chosen.id).toBe('long');
  });

  it('honours a higher bar when one is asked for', () => {
    const contributions = [
      contribution('a', showA, 0, 1800),
      contribution('b', degrade(showA), 0, 1800),
    ];
    expect(chooseReference(contributions, { required: 3 })).toBeUndefined();
    expect(chooseReference(contributions, { required: 2 })).toBeDefined();
  });
});
