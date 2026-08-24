import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getClient, signIn, signOut } from '../sync/auth';
import { fetchComments, postComment } from './comments';

/**
 * Live comment tests against the real project.
 *
 * The spoiler gate is a database policy, so it can only be proven against a real
 * database. Skipped unless credentials are supplied:
 *
 *   SB_SECRET=sb_secret_... npx vitest run src/social/comments.live.test.ts
 *
 * These sign in through the real auth module rather than mocking it. An earlier
 * version built its own client and mocked `../sync/auth` to return it — but the
 * module under test is imported statically at the top of this file, so the mock never
 * applied. It passed anyway, because both clients happened to share one localStorage
 * key and the real client therefore found the session. Namespacing that key per
 * worker broke the coincidence and revealed the test had never exercised what it
 * claimed to. Using the real module removes the question.
 */

const url = import.meta.env?.VITE_SUPABASE_URL as string | undefined;
const pub = import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined;
const secret = process.env.SB_SECRET;
const live = url && pub && secret ? describe : describe.skip;

live('comments (live)', () => {
  // Unique per run: shared IDs make exact-count assertions fail for reasons that
  // have nothing to do with the behaviour under test.
  const EPISODE = `tmdb:ep:comments-${Date.now()}`;
  const password = 'test-password-123';
  let userId: string;

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

  beforeAll(async () => {
    const email = `comments-${Date.now()}@example.com`;
    const created = await adminFetch('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email, password, email_confirm: true }),
    }).then((r) => r.json());
    userId = created.id;

    await signIn(email, password);
    await adminFetch('/rest/v1/profiles', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({ id: userId, handle: `c${Date.now()}`.slice(0, 28) }),
    });
  }, 30_000);

  afterAll(async () => {
    await signOut();
    if (userId) {
      await adminFetch(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' }).catch(() => {});
    }
  });

  it('refuses a comment on an episode you have not watched', async () => {
    // The database policy is what refuses this; the module translates the raw
    // policy violation into something actionable.
    await expect(postComment(EPISODE, 'spoiler bait')).rejects.toThrow(/Mark this episode watched/i);
  }, 30_000);

  it('accepts and returns a comment once the episode is watched', async () => {
    const client = getClient()!;

    await client.from('watches').insert({
      id: crypto.randomUUID(),
      user_id: userId,
      target_id: EPISODE,
      watched_at: new Date().toISOString(),
    });

    await postComment(EPISODE, 'The pacing in the back half finally earns the slow start.');

    const result = await fetchComments(EPISODE, true);
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].mine).toBe(true);
    expect(result.comments[0].body).toMatch(/back half/);
  }, 30_000);

  it('rejects an empty comment before it reaches the network', async () => {
    await expect(postComment(EPISODE, '   ')).rejects.toThrow(/Say something/i);
  });

  it('rejects a comment over the length limit', async () => {
    await expect(postComment(EPISODE, 'x'.repeat(4001))).rejects.toThrow(/4000/);
  });
});
