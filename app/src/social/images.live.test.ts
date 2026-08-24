// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Live tests for the comment-image upload path.
 *
 * Runs in the node environment, not jsdom. jsdom's `File` is not something undici can
 * stream, so a multipart upload built with it arrives at the function empty or
 * malformed — the request fails for reasons that have nothing to do with the code
 * under test. This cost an hour of chasing 502s that curl could not reproduce.
 *
 * This one can only be proven live. `storage.objects` is owned by a role we cannot
 * become, so the rules that would normally be row-level policies live inside the
 * `upload-comment-image` edge function instead — and a function's behaviour is not
 * something PGlite or a unit test can check.
 *
 *   SB_SECRET=sb_secret_... npx vitest run src/social/images.live.test.ts
 */

const url = import.meta.env?.VITE_SUPABASE_URL as string | undefined;
const pub = import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined;
const secret = process.env.SB_SECRET;
const live = url && pub && secret ? describe : describe.skip;

/** Smallest possible real PNG: a 1×1 transparent pixel. */
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

live('comment images (live)', () => {
  const password = 'test-password-123';
  let token: string;
  let otherToken: string;
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

  async function makeUser(): Promise<{ id: string; token: string }> {
    const email = `img-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
    const created = await adminFetch('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email, password, email_confirm: true }),
    }).then((r) => r.json());

    await adminFetch('/rest/v1/profiles', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({ id: created.id, handle: `img${Date.now()}${Math.floor(Math.random() * 999)}` }),
    });

    const session = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: pub!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then((r) => r.json());

    return { id: created.id, token: session.access_token };
  }

  const upload = (bearer: string | undefined, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return fetch(`${url}/functions/v1/upload-comment-image`, {
      method: 'POST',
      headers: { apikey: pub!, ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      body,
    });
  };

  beforeAll(async () => {
    const a = await makeUser();
    const b = await makeUser();
    userId = a.id;
    token = a.token;
    otherToken = b.token;
  }, 30_000);

  afterAll(async () => {
    await adminFetch(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' });
  });

  it('accepts an image from a signed-in user and returns a public URL', async () => {
    const res = await upload(token, new File([PNG], 'shot.png', { type: 'image/png' }));
    expect(res.status).toBe(200);

    const { url: publicUrl } = await res.json();
    expect(publicUrl).toContain('/comment-images/');

    // A public bucket is served over a route that does not apply RLS, which is what
    // lets an image render for anyone who can already see the comment.
    const fetched = await fetch(publicUrl);
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get('content-type')).toContain('image/png');
  }, 30_000);

  it('files the image under the uploader, not anywhere they ask', async () => {
    // The path is derived from the verified JWT. It is the whole reason this runs
    // server-side: with no policy on storage.objects, nothing else confines a write.
    const { url: publicUrl } = await upload(
      token,
      new File([PNG], 'shot.png', { type: 'image/png' }),
    ).then((r) => r.json());

    expect(publicUrl).toContain(`/comment-images/${userId}/`);
  }, 30_000);

  it('keeps two users in separate folders', async () => {
    const mine = await upload(token, new File([PNG], 'a.png', { type: 'image/png' })).then((r) =>
      r.json(),
    );
    const theirs = await upload(otherToken, new File([PNG], 'b.png', { type: 'image/png' })).then(
      (r) => r.json(),
    );

    expect(mine.url).not.toBe(theirs.url);
    expect(theirs.url).not.toContain(`/${userId}/`);
  }, 30_000);

  it('refuses an upload with no session', async () => {
    const res = await upload(undefined, new File([PNG], 'shot.png', { type: 'image/png' }));
    expect(res.status).toBe(401);
  }, 30_000);

  it('refuses a file that is not an image', async () => {
    // Without this the bucket is a general-purpose file host with a 5 MB limit.
    const res = await upload(token, new File(['#!/bin/sh'], 'x.sh', { type: 'text/x-shellscript' }));
    expect(res.status).toBe(415);
    expect((await res.json()).error).toMatch(/Images only/);
  }, 30_000);

  it('refuses a file over the size limit', async () => {
    const big = new File([new Uint8Array(6 * 1024 * 1024)], 'big.png', { type: 'image/png' });
    const res = await upload(token, big);

    expect(res.status).toBe(413);
    expect((await res.json()).error).toMatch(/over 5 MB/);
  }, 60_000);

  it('refuses an empty file rather than storing a zero-byte image', async () => {
    const res = await upload(token, new File([], 'empty.png', { type: 'image/png' }));
    expect(res.status).toBe(400);
  }, 30_000);

  it('explains itself when nothing was sent', async () => {
    const res = await fetch(`${url}/functions/v1/upload-comment-image`, {
      method: 'POST',
      headers: { apikey: pub!, Authorization: `Bearer ${token}` },
      body: new FormData(),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/No file was sent/);
  }, 30_000);
});
