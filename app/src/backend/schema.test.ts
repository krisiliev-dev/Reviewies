import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * Row-level security tests, run against real Postgres (PGlite is Postgres compiled
 * to WebAssembly), using the exact migration SQL that would be deployed.
 *
 * RLS bugs fail silently and leak data, so these assert the negative cases — what a
 * user must *not* be able to see — as much as the positive ones.
 */

const ROOT = resolve(__dirname, '../../..');
const migration = readFileSync(resolve(ROOT, 'supabase/migrations/0001_init.sql'), 'utf8');
const shim = readFileSync(resolve(ROOT, 'supabase/test/shim.sql'), 'utf8');

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';
const EPISODE = 'tmdb:ep:62085';

let db: PGlite;

/** Run a statement as an ordinary authenticated user, with RLS in force. */
async function asUser<T = unknown>(userId: string, sql: string, params: unknown[] = []) {
  await db.exec('set role app_user');
  await db.query('select set_config($1, $2, false)', ['app.user_id', userId]);
  try {
    return await db.query<T>(sql, params);
  } finally {
    await db.exec('reset role');
  }
}

/** Privileged setup, bypassing RLS the way a service role would. */
async function asAdmin(sql: string, params: unknown[] = []) {
  return db.query(sql, params);
}

beforeAll(async () => {
  db = await new PGlite();
  await db.exec(shim);
  await db.exec(migration);
  // Grants must be re-applied: the shim runs before the tables exist.
  await db.exec('grant select, insert, update, delete on all tables in schema public to app_user');
  await db.exec('grant execute on all functions in schema public to app_user');
}, 60_000);

beforeEach(async () => {
  await asAdmin('truncate profiles, follows, blocks, watches, ratings, watchlist, library, reactions, comments, reports cascade');
  await asAdmin("insert into profiles (id, handle) values ($1,'alice'), ($2,'bob')", [ALICE, BOB]);
});

describe('private history is owner-only', () => {
  beforeEach(async () => {
    await asAdmin(
      "insert into watches (id, user_id, target_id, watched_at) values (gen_random_uuid(), $1, $2, now())",
      [ALICE, EPISODE],
    );
  });

  it('lets the owner read their own watches', async () => {
    const res = await asUser(ALICE, 'select * from watches');
    expect(res.rows).toHaveLength(1);
  });

  it('hides one user\'s watches from another', async () => {
    const res = await asUser(BOB, 'select * from watches');
    expect(res.rows).toHaveLength(0);
  });

  it('refuses to let a user write history attributed to someone else', async () => {
    await expect(
      asUser(BOB, "insert into watches (id, user_id, target_id, watched_at) values (gen_random_uuid(), $1, 'x', now())", [
        ALICE,
      ]),
    ).rejects.toThrow(/row-level security/i);
  });

  it('keeps watchlists private between users', async () => {
    await asUser(ALICE, "insert into watchlist (user_id, title_id, kind, note, added_at) values ($1,'tmdb:tv:1','show','Ana recommended', now())", [ALICE]);
    expect((await asUser(ALICE, 'select * from watchlist')).rows).toHaveLength(1);
    expect((await asUser(BOB, 'select * from watchlist')).rows).toHaveLength(0);
  });
});

describe('rewatches', () => {
  it('accepts repeat watches of the same episode', async () => {
    for (let i = 0; i < 3; i++) {
      await asUser(
        ALICE,
        "insert into watches (id, user_id, target_id, watched_at) values (gen_random_uuid(), $1, $2, now())",
        [ALICE, EPISODE],
      );
    }
    const res = await asUser<{ count: string }>(ALICE, 'select count(*)::text as count from watches');
    expect(res.rows[0].count).toBe('3');
  });
});

describe('comments are spoiler-gated by the database', () => {
  beforeEach(async () => {
    // Alice has watched the episode and commented on it.
    await asAdmin("insert into watches (id, user_id, target_id, watched_at) values (gen_random_uuid(), $1, $2, now())", [ALICE, EPISODE]);
    await asAdmin("insert into comments (id, user_id, target_id, body) values (gen_random_uuid(), $1, $2, 'That reveal!')", [ALICE, EPISODE]);
  });

  it('hides comments from someone who has not watched the episode', async () => {
    const res = await asUser(BOB, 'select * from comments');
    expect(res.rows).toHaveLength(0);
  });

  it('reveals them once that person has watched it', async () => {
    await asAdmin("insert into watches (id, user_id, target_id, watched_at) values (gen_random_uuid(), $1, $2, now())", [BOB, EPISODE]);
    const res = await asUser(BOB, 'select * from comments');
    expect(res.rows).toHaveLength(1);
  });

  it('always shows authors their own comment', async () => {
    const res = await asUser(ALICE, 'select * from comments');
    expect(res.rows).toHaveLength(1);
  });

  it('does not leak via a comment on a different episode', async () => {
    await asAdmin("insert into watches (id, user_id, target_id, watched_at) values (gen_random_uuid(), $1, 'tmdb:ep:99', now())", [BOB]);
    // Bob has watched a different episode, so the gated comment stays hidden.
    expect((await asUser(BOB, 'select * from comments')).rows).toHaveLength(0);
  });

  it('blocks commenting on an episode you have not watched', async () => {
    await expect(
      asUser(BOB, "insert into comments (id, user_id, target_id, body) values (gen_random_uuid(), $1, $2, 'spoiler bait')", [
        BOB,
        EPISODE,
      ]),
    ).rejects.toThrow(/row-level security/i);
  });

  it('hides soft-deleted comments', async () => {
    await asAdmin("insert into watches (id, user_id, target_id, watched_at) values (gen_random_uuid(), $1, $2, now())", [BOB, EPISODE]);
    await asAdmin('update comments set deleted = true');
    expect((await asUser(BOB, 'select * from comments')).rows).toHaveLength(0);
  });
});

describe('reactions are shared but attributable', () => {
  beforeEach(async () => {
    await asAdmin("insert into reactions (id, user_id, target_id, t_ms, emoji) values (gen_random_uuid(), $1, $2, 42000, '😮')", [ALICE, EPISODE]);
  });

  it('is readable before watching, so a first-time viewer sees the replay', async () => {
    // This is the deliberate asymmetry with comments: gating reactions would leave
    // every new viewer with an empty screen and defeat Watching Mode.
    const res = await asUser(BOB, 'select * from reactions');
    expect(res.rows).toHaveLength(1);
  });

  it('refuses reactions attributed to another user', async () => {
    await expect(
      asUser(BOB, "insert into reactions (id, user_id, target_id, t_ms, emoji) values (gen_random_uuid(), $1, $2, 100, '👍')", [
        ALICE,
        EPISODE,
      ]),
    ).rejects.toThrow(/row-level security/i);
  });

  it('rejects a negative timestamp', async () => {
    await expect(
      asUser(BOB, "insert into reactions (id, user_id, target_id, t_ms, emoji) values (gen_random_uuid(), $1, $2, -5, '👍')", [
        BOB,
        EPISODE,
      ]),
    ).rejects.toThrow(/check constraint/i);
  });

  it('rejects an oversized emoji field, so it cannot be used as a text channel', async () => {
    await expect(
      asUser(BOB, "insert into reactions (id, user_id, target_id, t_ms, emoji) values (gen_random_uuid(), $1, $2, 100, $3)", [
        BOB,
        EPISODE,
        'x'.repeat(200),
      ]),
    ).rejects.toThrow(/check constraint/i);
  });
});

describe('blocking works in both directions', () => {
  beforeEach(async () => {
    await asAdmin("insert into reactions (id, user_id, target_id, t_ms, emoji) values (gen_random_uuid(), $1, $2, 1000, '🔥')", [ALICE, EPISODE]);
  });

  it('hides a blocked user\'s reactions from the blocker', async () => {
    await asUser(BOB, 'insert into blocks (user_id, blocked_id) values ($1,$2)', [BOB, ALICE]);
    expect((await asUser(BOB, 'select * from reactions')).rows).toHaveLength(0);
  });

  it('also hides the blocker from the blocked user', async () => {
    // Symmetry matters: a block that only works one way lets the blocked party
    // keep watching the person who blocked them.
    await asUser(BOB, 'insert into blocks (user_id, blocked_id) values ($1,$2)', [BOB, ALICE]);
    await asAdmin("insert into reactions (id, user_id, target_id, t_ms, emoji) values (gen_random_uuid(), $1, $2, 2000, '👀')", [BOB, EPISODE]);
    const res = await asUser(ALICE, 'select * from reactions where user_id = $1', [BOB]);
    expect(res.rows).toHaveLength(0);
  });

  it('hides blocked profiles', async () => {
    await asUser(BOB, 'insert into blocks (user_id, blocked_id) values ($1,$2)', [BOB, ALICE]);
    const res = await asUser<{ handle: string }>(BOB, 'select * from profiles');
    expect(res.rows.map((r) => r.handle)).toEqual(['bob']);
  });
});

describe('data integrity', () => {
  it('rejects self-follows', async () => {
    await expect(
      asUser(ALICE, 'insert into follows (follower_id, followee_id) values ($1,$1)', [ALICE]),
    ).rejects.toThrow(/no_self_follow/i);
  });

  it('rejects an out-of-range rating', async () => {
    await expect(
      asUser(ALICE, "insert into ratings (user_id, target_id, value, rated_at) values ($1,'x', 7.0, now())", [ALICE]),
    ).rejects.toThrow(/check constraint/i);
  });

  it('rejects a malformed handle', async () => {
    await expect(
      asAdmin("insert into profiles (id, handle) values (gen_random_uuid(), 'Not A Handle!')"),
    ).rejects.toThrow(/check constraint/i);
  });

  it('keeps reports unreadable by other users', async () => {
    await asUser(ALICE, "insert into reports (reporter_id, subject_type, subject_id, reason) values ($1,'comment','abc','spoiler')", [ALICE]);
    expect((await asUser(ALICE, 'select * from reports')).rows).toHaveLength(1);
    expect((await asUser(BOB, 'select * from reports')).rows).toHaveLength(0);
  });
});
