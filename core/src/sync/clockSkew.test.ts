import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../data/db.ts';
import { enqueue, resetSyncState, syncOnce } from './engine.ts';
import {
  clockOffsetMs,
  clockWarning,
  observeServerTime,
  resetClock,
  syncedNow,
} from './clock.ts';
import type { Change, PullResult } from './types.ts';

/**
 * What a wrong clock does to somebody's library.
 *
 * §6.66 fixed *which* calendar a date is read in. This is the other half: sync is
 * last-write-wins on `updatedAt`, and `updatedAt` is a number **the device writes**.
 * Nothing anywhere checked it against anything.
 *
 * A phone whose clock is a week fast is not exotic — a dead coin cell, a bad NTP server,
 * a factory-reset tablet with no network yet, somebody who set the date by hand to
 * unlock an expired trial. What it did here was silent and looked exactly like sync
 * working. §6.67.
 */

const DAY = 86_400_000;
const NOW = Date.parse('2026-08-26T12:00:00Z');

const row = (status: string) => ({ titleId: 'tmdb:tv:1', kind: 'show', status, addedAt: NOW });

/**
 * Only `Date` is faked, deliberately.
 *
 * Faking the timers as well stops fake-indexeddb, which schedules its own work on real
 * ones — every database call then hangs until the test times out, which looks like a
 * failing assertion and is not.
 */
const outboxTable = () =>
  db.outbox as unknown as import('../data/store.ts').Table<{
    key: string;
    updatedAt: number;
    row: Record<string, unknown>;
  }>;

beforeEach(async () => {
  resetClock();
  await resetSyncState();
  await Promise.all([db.library.clear(), db.watches.clear()]);
});

afterEach(() => {
  vi.useRealTimers();
  resetClock();
});

describe('a clock corrected against the server', () => {
  it('stamps with the server’s time once it has heard from it', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW - 7 * DAY); // this device thinks it is last Wednesday
    observeServerTime(NOW);

    // Within a second of the truth, rather than a week out.
    expect(Math.abs(syncedNow() - NOW)).toBeLessThan(1000);
  });

  it('halves the round trip, so a slow connection is not read as skew', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    // The server stamped its header somewhere inside a four-second request.
    observeServerTime(NOW, 4000);
    expect(syncedNow() - NOW).toBe(2000);
  });

  it('says nothing rather than guessing before the server has answered', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW - 7 * DAY);
    // No correction is available, so the device's own belief is all there is — but it
    // must not silently pretend to be corrected.
    expect(syncedNow()).toBe(NOW - 7 * DAY);
  });

  it('writes an outbox entry with the corrected time, not the device’s', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW + 7 * DAY); // a week fast
    observeServerTime(NOW);

    await enqueue('library', row('watching'));
    const entry = await outboxTable().get('library:tmdb:tv:1');
    expect(Math.abs((entry?.updatedAt ?? 0) - NOW)).toBeLessThan(1000);
  });
});

describe('telling somebody their clock is wrong', () => {
  it('says nothing at all when the clock is fine', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    observeServerTime(NOW);
    expect(clockWarning()).toBeUndefined();
  });

  it('says nothing before the server has ever answered', () => {
    // An unknown offset is not a wrong one. Warning about it would mean warning
    // everybody who has never signed in, which is most people.
    expect(clockWarning()).toBeUndefined();
  });

  it('says nothing about a few minutes, which nobody can act on', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW + 5 * 60_000);
    observeServerTime(NOW);
    expect(clockWarning()).toBeUndefined();
  });

  it('names the scale of it once it is enough to make the calendar wrong', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW + 3 * DAY);
    observeServerTime(NOW);
    expect(clockWarning()).toContain('3 days');
  });

  it('counts a fast clock and a slow one the same way', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW - 2 * 3_600_000);
    observeServerTime(NOW);
    expect(clockWarning()).toContain('2 hours');
  });

  /**
   * The two edges of the sentence, which nothing pinned.
   *
   * §6.75 mutated `clock.ts` in fourteen places and ten of the changes survived — the
   * highest proportion of any module measured. The tests above sit at five minutes,
   * two hours and three days, so every threshold between them was free to move: the
   * hour at which the warning appears at all, and the point where hours become days.
   * The three-day test does not even pin the divisor, because 72 ÷ 25 still rounds to
   * three.
   */
  it('speaks at exactly an hour, and not a minute before', () => {
    // An hour is the stated bar — the point where the calendar starts being wrong — and
    // "at least an hour" and "more than an hour" are different sentences. It is the
    // first: the warning appears the moment the skew reaches the threshold.
    //
    // Written as sixty minutes rather than as `NOTABLE_SKEW_MS`, deliberately. A test
    // that measures a constant with the same constant moves when it moves and says
    // nothing — the trap §6.75 found in the retry-limit test two files away.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW + 59 * 60_000);
    observeServerTime(NOW);
    expect(clockWarning()).toBeUndefined();

    vi.setSystemTime(NOW + 60 * 60_000);
    observeServerTime(NOW);
    expect(clockWarning()).toContain('1 hour');
  });

  it('counts in hours up to two days, and in days after that', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW + 47 * 3_600_000);
    observeServerTime(NOW);
    expect(clockWarning()).toContain('47 hours');

    // 48 is where a number of hours stops being something anybody can picture.
    vi.setSystemTime(NOW + 48 * 3_600_000);
    observeServerTime(NOW);
    expect(clockWarning()).toContain('2 days');

    // Twenty-five rather than ten, because ten days is 240 hours and 240 divided by
    // twenty-five still rounds to ten — the divisor could be wrong and the sentence
    // would come out the same.
    vi.setSystemTime(NOW + 25 * DAY);
    observeServerTime(NOW);
    expect(clockWarning()).toContain('25 days');
  });

  it('promises the history is safe, because it is', () => {
    // The whole point of the sentence: sync is corrected and unaffected. Somebody
    // reading a warning about their clock should not conclude their library is at risk.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW + 3 * DAY);
    observeServerTime(NOW);
    expect(clockWarning()).toContain('safe');
  });
});

describe('a device whose clock is wrong', () => {
  it('does not lock its own outbox when the clock is corrected backwards', async () => {
    // The fast phone finds a network, NTP pulls it back a week, and every edit made
    // afterwards was older than what was already queued. `enqueue` dropped them
    // silently: the button worked and the change vanished.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW + 7 * DAY);
    await enqueue('library', row('dropped'));

    vi.setSystemTime(NOW);
    await enqueue('library', row('watching'));

    const entry = await outboxTable().get('library:tmdb:tv:1');
    expect(entry?.row.status).toBe('watching');
  });

  it('still lets an importer say which of two writes came first', async () => {
    // The exception, and the reason the check exists at all: a replay of somebody's
    // history knows its own order and passes it explicitly. That comparison stays.
    await enqueue('library', row('completed'), { updatedAt: NOW });
    await enqueue('library', row('watching'), { updatedAt: NOW - DAY });

    const entry = await outboxTable().get('library:tmdb:tv:1');
    expect(entry?.row.status).toBe('completed');
  });

  it('does not stop the other device pulling anything at all', async () => {
    // The cursor is the part nothing tested, because `MemoryBackend` hands out a
    // sequence number while the real backend derives it from a timestamp. A row stamped
    // a week ahead moved a *correct* device's cursor a week ahead, and its next pull
    // asked for everything later than that. Nothing is. Sync stopped, for a week, with
    // no symptom but silence.
    const server = new TimestampCursorBackend();
    server.seed({
      table: 'library',
      pk: 'tmdb:tv:1',
      row: row('dropped'),
      updatedAt: NOW + 7 * DAY,
      deleted: false,
    });

    await syncOnce(server);

    server.seed({
      table: 'library',
      pk: 'tmdb:tv:2',
      row: { ...row('watching'), titleId: 'tmdb:tv:2' },
      updatedAt: Date.now() + 60_000,
      deleted: false,
    });

    // The future-stamped row keeps coming back until the clock reaches it, which is
    // harmless — applying it twice is idempotent. What matters is that the honest row
    // written a moment ago arrives at all, which before the cursor clamp it did not.
    await syncOnce(server);
    expect(await db.library.get('tmdb:tv:2')).toBeDefined();
  });

  it('does not lose the edit a slow device just made', async () => {
    // A week slow, and every write it pushed claimed to be a week old — so a server
    // that resolves by `updatedAt` kept the row the person had just replaced, and their
    // change evaporated. This is the case the offset fixes at the source rather than
    // downstream: the stamp is right, so nothing has to be argued about afterwards.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW - 7 * DAY);
    observeServerTime(NOW);
    await enqueue('library', row('watching'));
    vi.useRealTimers();

    const server = new TimestampCursorBackend();
    server.seed({
      table: 'library',
      pk: 'tmdb:tv:1',
      row: row('dropped'),
      updatedAt: NOW - DAY,
      deleted: false,
    });

    await syncOnce(server);
    expect(server.snapshot().find((c) => c.pk === 'tmdb:tv:1')?.row.status).toBe('watching');
  });

  it('and a pending local edit is not overwritten while it is still waiting', async () => {
    // `applyRemote` compared timestamps under a comment saying a pending edit always
    // wins. Unconditional is both simpler and what the comment always claimed — and on
    // a device whose clock is slow it is the difference between the person's change
    // surviving the next pull and being replaced by the thing they just changed.
    //
    // Reproduced the way it actually happens: an edit made while a push is in flight
    // stays in the outbox (the engine only clears entries it still recognises), and the
    // pull in the same cycle then meets it.
    const server = new TimestampCursorBackend();
    server.seed({
      table: 'library',
      pk: 'tmdb:tv:1',
      row: row('dropped'),
      updatedAt: Date.now() + 60_000,
      deleted: false,
    });

    await enqueue('library', row('completed'));
    server.duringPush = async () => {
      // The person taps again while the request is out, on a clock a week slow.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW - 7 * DAY);
      await enqueue('library', row('watching'));
      vi.useRealTimers();
    };

    const result = await syncOnce(server);
    expect(result.conflictsResolvedLocally).toBe(1);
    expect((await db.library.get('tmdb:tv:1'))?.status).not.toBe('dropped');
  });
});

/**
 * A server whose cursor is a timestamp, which is what the real one is.
 *
 * `MemoryBackend` returns a monotonic sequence number, so every engine test to date has
 * run against a server that could not have the bug above — a fixture smaller than
 * reality (§6.43) in the one subsystem where being wrong loses data.
 */
class TimestampCursorBackend {
  readonly name = 'timestamp-cursor';
  private rows = new Map<string, Change>();

  /** Runs while a push is in flight, so an edit can land mid-request. */
  duringPush?: () => Promise<void>;

  async push(changes: Change[]): Promise<void> {
    await this.duringPush?.();
    for (const change of changes) {
      const key = `${change.table}:${change.pk}`;
      const existing = this.rows.get(key);
      if (existing && existing.updatedAt > change.updatedAt) continue;
      this.rows.set(key, { ...change });
    }
  }

  async pull(cursor: number): Promise<PullResult> {
    const changes: Change[] = [];
    let newest = cursor;
    for (const change of this.rows.values()) {
      if (change.updatedAt <= cursor) continue;
      changes.push(change);
      newest = Math.max(newest, change.updatedAt);
    }
    return { changes, cursor: newest };
  }

  seed(change: Change): void {
    this.rows.set(`${change.table}:${change.pk}`, change);
  }

  snapshot(): Change[] {
    return [...this.rows.values()];
  }
}

/**
 * What survives the app being closed.
 *
 * The offset is written to a preference so a device that has been corrected once stays
 * corrected — otherwise every cold start writes wrongly-stamped rows until the first
 * successful request comes back. §6.75 mutated the function that reads it back and
 * nothing failed: every test in this file starts from a cleared clock, so the reading
 * half had never run.
 */
describe('a clock that has already been corrected', () => {
  it('uses this device\'s own time until the server has answered', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    // Not "close to": with nothing known, correcting by anything at all is inventing an
    // answer, and the offset has to be exactly zero rather than nearly zero.
    expect(syncedNow()).toBe(NOW);
    expect(clockOffsetMs()).toBeUndefined();
  });

  it('remembers the correction across a restart', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW + 3 * DAY);
    observeServerTime(NOW);
    expect(syncedNow()).toBeCloseTo(NOW, -4);

    // A fresh process: nothing in memory, the preference still on disk.
    resetClock({ keepStored: true });
    expect(clockOffsetMs()).toBeCloseTo(-3 * DAY, -4);
    expect(syncedNow()).toBeCloseTo(NOW, -4);
  });

  it('and forgets it when the clock is reset outright', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW + 3 * DAY);
    observeServerTime(NOW);

    resetClock();
    // Nothing stored is not the same as an offset of zero: one is an unknown and the
    // other is a measurement.
    expect(clockOffsetMs()).toBeUndefined();
  });
});
