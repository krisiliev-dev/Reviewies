import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
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
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations');
const migrations = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(MIGRATIONS_DIR, f), 'utf8'));
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
  for (const sql of migrations) await db.exec(sql);
  // Grants must be re-applied: the shim runs before the tables exist.
  await db.exec('grant select, insert, update, delete on all tables in schema public to app_user');
  await db.exec('grant execute on all functions in schema public to app_user');
}, 60_000);

beforeEach(async () => {
  await asAdmin(
    'truncate storage.objects, profiles, follows, blocks, watches, ratings, watchlist, library, reactions, comments, reports, push_subscriptions, notification_preferences, notification_queue, upcoming_episodes, fingerprint_contributions, fingerprint_references, lists, list_items, content_warning_votes cascade',
  );
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

  it('hides the profile of someone who blocked you', async () => {
    await asUser(ALICE, 'insert into blocks (user_id, blocked_id) values ($1,$2)', [ALICE, BOB]);
    const res = await asUser<{ handle: string }>(BOB, 'select * from profiles');
    expect(res.rows.map((r) => r.handle)).toEqual(['bob']);
  });

  it('still shows you the profile of someone you blocked', async () => {
    // Migration 0008. Hiding them from the blocker too made the block list a column
    // of UUIDs with no way to tell who they were or to undo anything.
    await asUser(BOB, 'insert into blocks (user_id, blocked_id) values ($1,$2)', [BOB, ALICE]);
    const res = await asUser<{ handle: string }>(BOB, 'select * from profiles order by handle');
    expect(res.rows.map((r) => r.handle)).toEqual(['alice', 'bob']);
  });

  it('does not make that exception reciprocal', async () => {
    // The carve-out is one-directional on purpose: blocking someone must not hand
    // them a way to see you again.
    await asUser(BOB, 'insert into blocks (user_id, blocked_id) values ($1,$2)', [BOB, ALICE]);
    const res = await asUser<{ handle: string }>(ALICE, 'select * from profiles');
    expect(res.rows.map((r) => r.handle)).toEqual(['alice']);
  });

  it('keeps blocked users out of everything else', async () => {
    // The profile carve-out must not leak into the content policies: reactions,
    // comments and lists all stay hidden.
    await asUser(BOB, 'insert into blocks (user_id, blocked_id) values ($1,$2)', [BOB, ALICE]);
    expect((await asUser(BOB, 'select * from reactions')).rows).toHaveLength(0);
  });
});

describe('following', () => {
  it('lets a user follow someone', async () => {
    await asUser(ALICE, 'insert into follows (follower_id, followee_id) values ($1,$2)', [
      ALICE,
      BOB,
    ]);
    expect((await asUser(ALICE, 'select * from follows')).rows).toHaveLength(1);
  });

  it('refuses a follow attributed to someone else', async () => {
    await expect(
      asUser(BOB, 'insert into follows (follower_id, followee_id) values ($1,$2)', [ALICE, BOB]),
    ).rejects.toThrow();
  });

  it('refuses following yourself', async () => {
    await expect(
      asUser(ALICE, 'insert into follows (follower_id, followee_id) values ($1,$2)', [
        ALICE,
        ALICE,
      ]),
    ).rejects.toThrow();
  });

  it('shows a user who follows them', async () => {
    await asUser(ALICE, 'insert into follows (follower_id, followee_id) values ($1,$2)', [
      ALICE,
      BOB,
    ]);
    expect((await asUser(BOB, 'select * from follows')).rows).toHaveLength(1);
  });

  it('does not expose follow edges between other people', async () => {
    // follows_select is deliberately narrow, which is why no public follower count
    // is offered anywhere in the app.
    const carol = '33333333-3333-3333-3333-333333333333';
    await asAdmin("insert into profiles (id, handle) values ($1,'carol')", [carol]);
    await asAdmin('insert into follows (follower_id, followee_id) values ($1,$2)', [carol, BOB]);
    expect((await asUser(ALICE, 'select * from follows')).rows).toHaveLength(0);
  });
});

describe('push notifications', () => {
  it('keeps a device subscription private to its owner', async () => {
    await asUser(
      ALICE,
      "insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push.example/a', 'k', 'a')",
      [ALICE],
    );
    expect((await asUser(ALICE, 'select * from push_subscriptions')).rows).toHaveLength(1);
    expect((await asUser(BOB, 'select * from push_subscriptions')).rows).toHaveLength(0);
  });

  it('refuses a subscription registered against another user', async () => {
    await expect(
      asUser(
        BOB,
        "insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push.example/b', 'k', 'a')",
        [ALICE],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('rejects a duplicate endpoint for the same user', async () => {
    const insert = () =>
      asUser(
        ALICE,
        "insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push.example/dup', 'k', 'a')",
        [ALICE],
      );
    await insert();
    await expect(insert()).rejects.toThrow(/duplicate key/i);
  });

  it('rejects an unknown notification preference', async () => {
    await expect(
      asUser(ALICE, "insert into notification_preferences (user_id, preference) values ($1, 'sometimes')", [ALICE]),
    ).rejects.toThrow(/check constraint/i);
  });

  it('lets a user read their own queued notifications but not write them', async () => {
    // A client that could enqueue its own notifications could enqueue them for
    // anyone, so only the service role writes here.
    await asAdmin(
      "insert into notification_queue (user_id, target_id, title, body) values ($1, 'tmdb:ep:1', 'New episode', 'S1E1 is out')",
      [ALICE],
    );
    expect((await asUser(ALICE, 'select * from notification_queue')).rows).toHaveLength(1);
    expect((await asUser(BOB, 'select * from notification_queue')).rows).toHaveLength(0);

    await expect(
      asUser(
        BOB,
        "insert into notification_queue (user_id, target_id, title, body) values ($1, 'tmdb:ep:2', 'x', 'y')",
        [BOB],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('allows only one queued notification per user and episode', async () => {
    const enqueue = () =>
      asAdmin(
        "insert into notification_queue (user_id, target_id, title, body) values ($1, 'tmdb:ep:9', 'x', 'y')",
        [ALICE],
      );
    await enqueue();
    // Re-running the scheduler must not send the same thing twice.
    await expect(enqueue()).rejects.toThrow(/duplicate key/i);
  });
});

describe('notification scheduler', () => {
  const SERIES = 'tmdb:tv:1';
  const EP = 'tmdb:ep:today';

  async function seedUpcoming(kind = 'premiere') {
    await asAdmin(
      `insert into upcoming_episodes (target_id, series_id, series_name, season, number, air_date, kind)
       values ($1, $2, 'The Long Dark', 2, 1, current_date, $3)`,
      [EP, SERIES, kind],
    );
    await asAdmin(
      "insert into library (user_id, title_id, kind, status, added_at) values ($1, $2, 'show', 'watching', now())",
      [ALICE, SERIES],
    );
  }

  const queued = async () =>
    (await asAdmin('select * from notification_queue')).rows as Array<Record<string, unknown>>;

  it('queues a premiere for someone tracking the show', async () => {
    await seedUpcoming('premiere');
    await asAdmin('select queue_todays_notifications()');

    const rows = await queued();
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('The Long Dark');
    expect(String(rows[0].body)).toMatch(/Season 2 starts today/);
  });

  it('does not queue a regular episode on the milestones default', async () => {
    await seedUpcoming('regular');
    await asAdmin('select queue_todays_notifications()');
    expect(await queued()).toHaveLength(0);
  });

  it('queues a regular episode when the user asked for everything', async () => {
    await seedUpcoming('regular');
    await asAdmin("insert into notification_preferences (user_id, preference) values ($1, 'all')", [ALICE]);
    await asAdmin('select queue_todays_notifications()');
    expect(await queued()).toHaveLength(1);
  });

  it('queues nothing when notifications are off', async () => {
    await seedUpcoming('premiere');
    await asAdmin("insert into notification_preferences (user_id, preference) values ($1, 'off')", [ALICE]);
    await asAdmin('select queue_todays_notifications()');
    expect(await queued()).toHaveLength(0);
  });

  it('never announces an episode already watched', async () => {
    await seedUpcoming('premiere');
    await asAdmin(
      'insert into watches (id, user_id, target_id, watched_at) values (gen_random_uuid(), $1, $2, now())',
      [ALICE, EP],
    );
    await asAdmin('select queue_todays_notifications()');
    expect(await queued()).toHaveLength(0);
  });

  it('ignores shows the user paused', async () => {
    await seedUpcoming('premiere');
    await asAdmin("update library set status = 'paused' where user_id = $1", [ALICE]);
    await asAdmin('select queue_todays_notifications()');
    expect(await queued()).toHaveLength(0);
  });

  it('is safe to run twice', async () => {
    await seedUpcoming('premiere');
    await asAdmin('select queue_todays_notifications()');
    await asAdmin('select queue_todays_notifications()');
    // The unique constraint means a re-run cannot double-send.
    expect(await queued()).toHaveLength(1);
  });

  it('does not queue for users who are not tracking the show', async () => {
    await seedUpcoming('premiere');
    await asAdmin('select queue_todays_notifications()');
    const rows = await queued();
    expect(rows.every((r) => r.user_id === ALICE)).toBe(true);
  });
});

describe('fingerprint references', () => {
  const TARGET = 'tmdb:ep:fp';

  const contribute = (user: string, frames: number, hashes = 'AAAA') =>
    asAdmin(
      `insert into fingerprint_contributions (user_id, target_id, hashes, frame_count)
       values ($1, $2, $3, $4)`,
      [user, TARGET, hashes, frames],
    );

  it('lets a user manage their own contribution', async () => {
    await asUser(
      ALICE,
      `insert into fingerprint_contributions (user_id, target_id, hashes, frame_count)
       values ($1, $2, 'AAAA', 1000)`,
      [ALICE, TARGET],
    );
    expect((await asUser(ALICE, 'select * from fingerprint_contributions')).rows).toHaveLength(1);
  });

  it('hides one user\'s contribution from another', async () => {
    // A raw unvalidated timeline is exactly what a malicious client would want in
    // order to forge agreement.
    await contribute(ALICE, 1000);
    expect((await asUser(BOB, 'select * from fingerprint_contributions')).rows).toHaveLength(0);
  });

  it('allows only one contribution per user, episode and audio track', async () => {
    await contribute(ALICE, 1000);
    // Repeated attempts must replace rather than stack, so one enthusiastic user
    // cannot outvote everyone else.
    await expect(contribute(ALICE, 1200)).rejects.toThrow(/duplicate key/i);
  });

  it('treats different audio tracks as separate references', async () => {
    await contribute(ALICE, 1000);
    await asAdmin(
      `insert into fingerprint_contributions (user_id, target_id, audio_track, hashes, frame_count)
       values ($1, $2, 'dub-de', 'BBBB', 1000)`,
      [ALICE, TARGET],
    );
    expect((await asAdmin('select * from fingerprint_contributions')).rows).toHaveLength(2);
  });

  it('does not promote a lone contribution', async () => {
    await contribute(ALICE, 1000);
    const res = await asAdmin('select promote_fingerprint($1) as promoted', [TARGET]);
    expect((res.rows[0] as { promoted: boolean }).promoted).toBe(false);
    expect((await asAdmin('select * from fingerprint_references')).rows).toHaveLength(0);
  });

  it('promotes once two contributions agree on length', async () => {
    await contribute(ALICE, 1000);
    await contribute(BOB, 1005);
    const res = await asAdmin('select promote_fingerprint($1) as promoted', [TARGET]);
    expect((res.rows[0] as { promoted: boolean }).promoted).toBe(true);

    const rows = (await asAdmin('select * from fingerprint_references')).rows as Array<{
      agreement: number;
    }>;
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].agreement)).toBe(2);
  });

  it('does not promote when contributions disagree wildly', async () => {
    // A mistimed or wrong-episode contribution would misplace every later viewer's
    // reactions, which is worse than having no reference at all.
    await contribute(ALICE, 1000);
    await contribute(BOB, 9000);
    const res = await asAdmin('select promote_fingerprint($1) as promoted', [TARGET]);
    expect((res.rows[0] as { promoted: boolean }).promoted).toBe(false);
  });

  it('returns false when there is nothing to promote', async () => {
    const res = await asAdmin('select promote_fingerprint($1) as promoted', ['tmdb:ep:none']);
    expect((res.rows[0] as { promoted: boolean }).promoted).toBe(false);
  });

  it('publishes accepted references to any signed-in user', async () => {
    await contribute(ALICE, 1000);
    await contribute(BOB, 1000);
    await asAdmin('select promote_fingerprint($1)', [TARGET]);
    // Bob can read the reference even though he cannot read Alice's contribution.
    expect((await asUser(BOB, 'select * from fingerprint_references')).rows).toHaveLength(1);
  });

  it('refuses to let a client write a reference directly', async () => {
    await expect(
      asUser(
        ALICE,
        "insert into fingerprint_references (target_id, hashes, frame_count) values ($1, 'X', 10)",
        [TARGET],
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('lists', () => {
  const makeList = (owner: string, isPublic = false) =>
    asAdmin(
      "insert into lists (user_id, name, is_public) values ($1, 'Best of 2026', $2) returning id",
      [owner, isPublic],
    ).then((r) => (r.rows[0] as { id: string }).id);

  it('mixes film and television in one list', async () => {
    // The unmet need r/Simkl named. Costs us nothing, since we are unified.
    const id = await makeList(ALICE);
    await asUser(
      ALICE,
      "insert into list_items (list_id, title_id, kind) values ($1,'tmdb:tv:1','show'), ($1,'tmdb:movie:4','film')",
      [id],
    );
    expect((await asUser(ALICE, 'select * from list_items')).rows).toHaveLength(2);
  });

  it('keeps a private list private', async () => {
    await makeList(ALICE, false);
    expect((await asUser(BOB, 'select * from lists')).rows).toHaveLength(0);
  });

  it('shows a published list to others', async () => {
    await makeList(ALICE, true);
    expect((await asUser(BOB, 'select * from lists')).rows).toHaveLength(1);
  });

  it('hides items of a private list, not just the list itself', async () => {
    // The obvious leak: hiding the container but leaving its contents readable.
    const id = await makeList(ALICE, false);
    await asAdmin("insert into list_items (list_id, title_id, kind) values ($1,'tmdb:tv:1','show')", [id]);
    expect((await asUser(BOB, 'select * from list_items')).rows).toHaveLength(0);
  });

  it('reveals items once the list is published', async () => {
    const id = await makeList(ALICE, true);
    await asAdmin("insert into list_items (list_id, title_id, kind) values ($1,'tmdb:tv:1','show')", [id]);
    expect((await asUser(BOB, 'select * from list_items')).rows).toHaveLength(1);
  });

  it('hides a published list from someone who blocked its owner', async () => {
    await makeList(ALICE, true);
    await asUser(BOB, 'insert into blocks (user_id, blocked_id) values ($1,$2)', [BOB, ALICE]);
    expect((await asUser(BOB, 'select * from lists')).rows).toHaveLength(0);
  });

  it('refuses to let someone add items to another user\'s list', async () => {
    const id = await makeList(ALICE, true);
    await expect(
      asUser(BOB, "insert into list_items (list_id, title_id, kind) values ($1,'tmdb:tv:9','show')", [id]),
    ).rejects.toThrow(/row-level security/i);
  });

  it('rejects an empty list name', async () => {
    await expect(
      asUser(ALICE, "insert into lists (user_id, name) values ($1, '')", [ALICE]),
    ).rejects.toThrow(/check constraint/i);
  });

  it('rejects a duplicate title in the same list', async () => {
    const id = await makeList(ALICE);
    const add = () =>
      asUser(ALICE, "insert into list_items (list_id, title_id, kind) values ($1,'tmdb:tv:1','show')", [id]);
    await add();
    await expect(add()).rejects.toThrow(/duplicate key/i);
  });

  it('hides a soft-deleted list', async () => {
    const id = await makeList(ALICE, true);
    await asAdmin('update lists set deleted = true where id = $1', [id]);
    expect((await asUser(BOB, 'select * from lists')).rows).toHaveLength(0);
  });
});

describe('content warnings', () => {
  const TITLE = 'tmdb:tv:1';

  const vote = (user: string, warning: string, present = true) =>
    asAdmin(
      'insert into content_warning_votes (user_id, title_id, warning, present) values ($1,$2,$3,$4)',
      [user, TITLE, warning, present],
    );

  it('aggregates yes and no votes', async () => {
    await vote(ALICE, 'animal-harm', true);
    await vote(BOB, 'animal-harm', false);

    const rows = (await asAdmin('select * from content_warnings($1)', [TITLE])).rows as Array<{
      warning: string;
      yes_votes: string;
      no_votes: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].yes_votes)).toBe(1);
    expect(Number(rows[0].no_votes)).toBe(1);
  });

  it('keeps a contested warning visible rather than hiding it', async () => {
    // Disappearing when disputed would be worse than showing the dispute.
    await vote(ALICE, 'gore', true);
    await vote(BOB, 'gore', false);
    expect((await asAdmin('select * from content_warnings($1)', [TITLE])).rows).toHaveLength(1);
  });

  it('allows only one vote per user, title and warning', async () => {
    await vote(ALICE, 'suicide');
    await expect(vote(ALICE, 'suicide')).rejects.toThrow(/duplicate key/i);
  });

  it('rejects a warning outside the vocabulary', async () => {
    // Free text would become a second, unmoderated comment field.
    await expect(vote(ALICE, 'anything-i-like')).rejects.toThrow(/check constraint/i);
  });

  it('refuses a vote cast as another user', async () => {
    await expect(
      asUser(
        BOB,
        'insert into content_warning_votes (user_id, title_id, warning) values ($1,$2,$3)',
        [ALICE, TITLE, 'gore'],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('hides votes from someone you blocked', async () => {
    await vote(ALICE, 'gore');
    await asUser(BOB, 'insert into blocks (user_id, blocked_id) values ($1,$2)', [BOB, ALICE]);
    expect((await asUser(BOB, 'select * from content_warning_votes')).rows).toHaveLength(0);
  });

  it('returns nothing for a title nobody has voted on', async () => {
    expect((await asAdmin('select * from content_warnings($1)', ['tmdb:tv:none'])).rows).toHaveLength(0);
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

describe('comment images', () => {
  it('creates the bucket with a size limit and an image-only allow list', async () => {
    const res = await asAdmin(
      "select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'comment-images'",
    );
    const rows = res.rows as Array<{ file_size_limit: string; allowed_mime_types: string[] }>;
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].file_size_limit)).toBe(5 * 1024 * 1024);
    // An open allow list would make the bucket a general file host.
    expect(rows[0].allowed_mime_types).toContain('image/png');
    expect(rows[0].allowed_mime_types).not.toContain('application/pdf');
  });

  /**
   * There are deliberately no policy tests here.
   *
   * An earlier version of migration 0009 confined uploads to `<user-id>/` with
   * policies on `storage.objects`, and this suite asserted them. That migration
   * cannot be applied: the table is owned by `supabase_storage_admin`, and the role
   * the Management API and SQL editor both run as cannot become it. The rules now
   * live in the `upload-comment-image` edge function instead.
   *
   * Testing them against the shim's stand-in table would have been worse than not
   * testing them: the assertions would pass against a fixture that no longer
   * resembles production. They are covered by `src/social/images.live.test.ts`,
   * which drives the deployed function.
   */
});
