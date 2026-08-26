import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db.ts';
import { addReaction, estimateDriftMs } from './reactions.ts';

/** The outbox lives in the main database now; see sync/engine.ts. */
const outbox = db.outbox as unknown as import('../data/store.ts').Table<{
  key: string;
  row: Record<string, unknown>;
  attempts: number;
}>;

beforeEach(async () => {
  await db.reactions.clear();
  await outbox.clear();
});

describe('adding a reaction', () => {
  it('writes locally and queues for upload', async () => {
    const r = await addReaction('tmdb:ep:1', 42_000, '😮');

    expect((await db.reactions.get(r.id))?.emoji).toBe('😮');
    // Queued, not sent — tapping an emoji must not wait on the network.
    expect(await outbox.get(`reactions:${r.id}`)).toBeDefined();
  });

  it('marks your own reactions as yours', async () => {
    const r = await addReaction('tmdb:ep:1', 1000, '👍');
    expect(r.mine).toBe(true);
  });

  it('clamps a negative timestamp rather than storing nonsense', async () => {
    const r = await addReaction('tmdb:ep:1', -5000, '👍');
    expect(r.tMs).toBe(0);
  });

  it('rounds sub-millisecond positions', async () => {
    const r = await addReaction('tmdb:ep:1', 1234.7, '🔥');
    expect(Number.isInteger(r.tMs)).toBe(true);
  });

  it('keeps repeat reactions at the same moment as separate entries', async () => {
    await addReaction('tmdb:ep:1', 5000, '😂');
    await addReaction('tmdb:ep:1', 5000, '😂');
    expect(await db.reactions.count()).toBe(2);
  });
});

describe('crowd drift estimation', () => {
  const at = (...ms: number[]) => ms.map((tMs) => ({ tMs }));

  it('detects a consistent lag behind the crowd', () => {
    // Every one of my taps lands 8s after the crowd's.
    const drift = estimateDriftMs(at(18_000, 38_000, 58_000), at(10_000, 30_000, 50_000));
    expect(drift).toBe(-8000);
  });

  it('detects running ahead of the crowd', () => {
    const drift = estimateDriftMs(at(10_000, 30_000, 50_000), at(16_000, 36_000, 56_000));
    expect(drift).toBe(6000);
  });

  it('returns nothing when already in sync', () => {
    // Sub-2s differences are noise; nudging would make things worse.
    expect(estimateDriftMs(at(10_000, 30_000, 50_000), at(10_500, 30_400, 49_800))).toBeUndefined();
  });

  it('ignores a single mistimed tap by using the median', () => {
    const drift = estimateDriftMs(
      at(15_000, 35_000, 55_000, 900_000),
      at(10_000, 30_000, 50_000, 70_000),
    );
    expect(drift).toBe(-5000);
  });

  it('refuses to guess from too few reactions', () => {
    expect(estimateDriftMs(at(15_000), at(10_000))).toBeUndefined();
  });

  it('refuses to guess with no crowd data', () => {
    expect(estimateDriftMs(at(1000, 2000, 3000), [])).toBeUndefined();
  });

  it('ignores crowd reactions too far away to be the same moment', () => {
    // A 10-minute gap is a different scene, not drift.
    expect(estimateDriftMs(at(600_000, 620_000, 640_000), at(1000, 2000, 3000))).toBeUndefined();
  });

  /**
   * The edges of it, none of which anything reached.
   *
   * §6.75 mutated this function in eighteen places and every change survived the suite —
   * the highest proportion in the package. The tests above are all comfortably inside
   * the thresholds: eight seconds of drift against a two-second bar, three matches
   * against a minimum of three, a ten-minute gap against a thirty-second window. So
   * every boundary, and the whole even-length half of the median, was free to move.
   *
   * It is not a decorative function. It is what offers to correct somebody's timing
   * mid-episode, and being wrong about the direction or the amount is worse than saying
   * nothing.
   */
  it('takes the reading at exactly two seconds, and not just under', () => {
    expect(estimateDriftMs(at(12_000, 32_000, 52_000), at(10_000, 30_000, 50_000))).toBe(-2000);
    expect(
      estimateDriftMs(at(11_999, 31_999, 51_999), at(10_000, 30_000, 50_000)),
    ).toBeUndefined();
  });

  it('averages the middle two when the number of matches is even', () => {
    // Four matches, a hundred seconds apart so each has one candidate, with deltas of
    // −2000 −4000 −6000 −8000. The answer is −5000: the mean of the middle pair, which
    // is not any single delta and not the mean of the outer pair either. Every test
    // above has an odd count, so this branch had never run.
    const drift = estimateDriftMs(
      at(12_000, 114_000, 216_000, 318_000),
      at(10_000, 110_000, 210_000, 310_000),
    );
    expect(drift).toBe(-5000);
  });

  it('does not flip the sign when the crowd is equally split either side', () => {
    // Two candidates the same distance apart in opposite directions. Which one is kept
    // decides whether somebody is told to nudge forwards or backwards, and the two
    // answers are five seconds apart in opposite directions.
    const drift = estimateDriftMs(
      at(20_000, 120_000, 220_000),
      at(15_000, 25_000, 115_000, 125_000, 215_000, 225_000),
    );
    expect(drift).toBe(-5000);
  });

  it('counts a match exactly at the edge of the window, and nothing past it', () => {
    // Thirty seconds is the window. At exactly that distance the crowd reaction is
    // still the same moment; a millisecond further out it is not.
    // Spaced a hundred seconds apart so each of mine has exactly one candidate and the
    // nearest-match rule cannot quietly pick a closer one.
    expect(estimateDriftMs(at(40_000, 140_000, 240_000), at(10_000, 110_000, 210_000))).toBe(
      -30_000,
    );
    expect(
      estimateDriftMs(at(40_001, 140_001, 240_001), at(10_000, 110_000, 210_000)),
    ).toBeUndefined();
  });

  it('needs three of my own reactions, not two', () => {
    expect(estimateDriftMs(at(18_000, 38_000), at(10_000, 30_000))).toBeUndefined();
    expect(estimateDriftMs(at(18_000, 38_000, 58_000), at(10_000, 30_000, 50_000))).toBe(-8000);
  });

  it('needs three that actually matched, not three that were offered', () => {
    // Three of mine, but only two land within the window of any crowd reaction.
    expect(estimateDriftMs(at(18_000, 38_000, 900_000), at(10_000, 30_000))).toBeUndefined();
  });
});
