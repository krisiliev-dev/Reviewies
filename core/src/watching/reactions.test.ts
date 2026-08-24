import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { addReaction, estimateDriftMs } from './reactions';

/** The outbox lives in the main database now; see sync/engine.ts. */
const outbox = db.outbox as unknown as import('../data/store').Table<{
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
});
