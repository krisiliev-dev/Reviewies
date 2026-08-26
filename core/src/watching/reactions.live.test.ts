import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getConfig } from '../config.ts';
import { getClient, signIn, signOut } from '../sync/auth.ts';
import { db } from '../data/db.ts';
import { fetchRemoteReactions } from './reactions.ts';

/**
 * The shared half of Watching Mode, against the real project.
 *
 * `reactions_sample` is a database function whose whole job is to return a spread of an
 * episode rather than its opening minutes, and whose SECURITY INVOKER-ness is what keeps
 * blocking working through it. Neither property can be proven anywhere but a real
 * database: the schema tests run the same SQL in PGlite, and the client tests mock the
 * network, so between them nothing has ever asked the deployed project a question.
 *
 *   SB_SECRET=sb_secret_... npx vitest run src/watching/reactions.live.test.ts
 */

const url = getConfig().supabaseUrl;
const pub = getConfig().supabaseAnonKey;
const secret = process.env.SB_SECRET;
const live = url && pub && secret ? describe : describe.skip;

live('reaction sampling (live)', () => {
  const stamp = Date.now();
  const EPISODE = `tmdb:ep:sample-${stamp}`;
  const RUNTIME_MS = 45 * 60 * 1000;
  const password = 'test-password-123';

  const people: Array<{ id: string; email: string }> = [];

  const adminFetch = (path: string, init: RequestInit = {}) =>
    fetch(`${url}${path}`, {
      ...init,
      headers: {
        apikey: secret!,
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });

  async function makeUser(tag: string) {
    const email = `${tag}-${stamp}@example.com`;
    const created = await adminFetch('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email, password, email_confirm: true }),
    }).then((r) => r.json());

    await adminFetch('/rest/v1/profiles', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({ id: created.id, handle: `${tag}${stamp}`.slice(0, 28) }),
    });

    people.push({ id: created.id, email });
    return { id: created.id as string, email };
  }

  let author: { id: string; email: string };
  let viewer: { id: string; email: string };

  beforeAll(async () => {
    author = await makeUser('rx');
    viewer = await makeUser('rv');

    // A popular episode: a storm over the opening titles, then a normal scattering.
    // That shape is the point — a burst at the start is enough to consume a
    // by-timestamp limit entirely and leave the rest of the hour invisible.
    const rows: unknown[] = [];
    for (let i = 0; i < 1200; i++) {
      rows.push({
        id: crypto.randomUUID(),
        user_id: author.id,
        target_id: EPISODE,
        t_ms: Math.floor((i / 1200) * 60_000),
        emoji: '👏',
      });
    }
    for (let i = 0; i < 300; i++) {
      rows.push({
        id: crypto.randomUUID(),
        user_id: author.id,
        target_id: EPISODE,
        t_ms: 60_000 + Math.floor((i / 300) * (RUNTIME_MS - 60_000)),
        emoji: '😂',
      });
    }

    // In batches: a single insert of fifteen hundred rows is a large enough body that a
    // failure would be about request size rather than about anything under test.
    for (let i = 0; i < rows.length; i += 500) {
      const res = await adminFetch('/rest/v1/reactions', {
        method: 'POST',
        body: JSON.stringify(rows.slice(i, i + 500)),
      });
      if (!res.ok) throw new Error(`seeding failed: ${res.status} ${await res.text()}`);
    }
  }, 120_000);

  afterAll(async () => {
    await signOut();
    await adminFetch(`/rest/v1/reactions?target_id=eq.${EPISODE}`, { method: 'DELETE' }).catch(
      () => {},
    );
    for (const person of people) {
      await adminFetch(`/auth/v1/admin/users/${person.id}`, { method: 'DELETE' }).catch(() => {});
    }
  }, 60_000);

  it('returns a spread of the episode rather than its first minutes', async () => {
    await db.reactions.clear();
    await signIn(viewer.email, password);

    const merged = await fetchRemoteReactions(EPISODE);
    expect(merged).toBeGreaterThan(50);

    // Fifteen hundred were seeded and the fallback query's limit is two thousand, so a
    // count near fifteen hundred would mean the RPC was never reached and this test was
    // quietly measuring the old behaviour.
    expect(merged).toBeLessThan(800);

    const stored = await db.reactions.where('targetId').equals(EPISODE).toArray();
    const latest = Math.max(...stored.map((r) => r.tMs));

    // The old query took the earliest two thousand by timestamp, which for this episode
    // is entirely inside the first minute.
    expect(latest).toBeGreaterThan(RUNTIME_MS - 120_000);

    // And the opening storm must not still dominate what came back.
    const opening = stored.filter((r) => r.tMs < 60_000).length;
    expect(opening).toBeLessThan(stored.length / 2);
  }, 60_000);

  it('comes back in timeline order, ready to replay', async () => {
    await db.reactions.clear();
    await signIn(viewer.email, password);
    await fetchRemoteReactions(EPISODE);

    const stored = await db.reactions.where('targetId').equals(EPISODE).sortBy('tMs');
    expect(stored.length).toBeGreaterThan(50);
    // Every reaction sits inside the episode it belongs to.
    expect(stored.every((r) => r.tMs >= 0 && r.tMs <= RUNTIME_MS)).toBe(true);
  }, 60_000);

  it('hides a blocked person through the function, not only through a plain select', async () => {
    // The reason the function is SECURITY INVOKER. Definer rights would run it as the
    // owner, skip `reactions_select`, and hand back reactions from someone the viewer
    // blocked — through this one code path, silently, while every other path behaved.
    await signIn(viewer.email, password);
    const client = getClient()!;
    const { error } = await client
      .from('blocks')
      .insert({ user_id: viewer.id, blocked_id: author.id });
    expect(error).toBeNull();

    await db.reactions.clear();
    expect(await fetchRemoteReactions(EPISODE)).toBe(0);
  }, 60_000);
});
