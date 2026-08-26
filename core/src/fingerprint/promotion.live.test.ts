import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getConfig } from '../config.ts';
import { signIn, signOut } from '../sync/auth.ts';
import { spectrogramFromPcm } from './spectrogram.ts';
import { ContributionRecorder } from './contribute.ts';
import { SAMPLE_RATE } from './fingerprint.ts';
import { contributeReference, fetchReference } from './references.ts';

/**
 * Cross-validation, end to end, against the deployed project.
 *
 * Everything below this has been proven somewhere: the agreement rules against synthetic
 * episodes in the core, the grants in PGlite, the function's boot on the edge by
 * invoking it. What had never happened is the whole thing running once — two people
 * contributing, the promoter deciding, and a client reading back a reference it can
 * actually sync against. Until that happens the feature is a set of parts that pass
 * their own tests.
 *
 *   SB_SECRET=sb_secret_... CRON_SECRET=... \
 *     npx vitest run src/fingerprint/promotion.live.test.ts
 *
 * `CRON_SECRET` is the shared secret the promoter is deployed with — it refuses anything
 * without it, because it holds the service role.
 */

const url = getConfig().supabaseUrl;
const pub = getConfig().supabaseAnonKey;
const secret = process.env.SB_SECRET;
const cronSecret = process.env.CRON_SECRET;
const live = url && pub && secret && cronSecret ? describe : describe.skip;

/** Audio whose spectrum keeps changing, so any stretch of it is distinguishable. */
function episode(seconds: number, seed: number): Float32Array {
  const samples = new Float32Array(Math.round(seconds * SAMPLE_RATE));
  const next = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const segment = Math.round(SAMPLE_RATE * 0.2);
  for (let start = 0; start < samples.length; start += segment) {
    const tones = [300 + next() * 2500, 300 + next() * 2500, 300 + next() * 2500];
    const end = Math.min(start + segment, samples.length);
    for (let i = start; i < end; i++) {
      const t = i / SAMPLE_RATE;
      let value = 0;
      for (const hz of tones) value += Math.sin(2 * Math.PI * hz * t);
      samples[i] = value / tones.length;
    }
  }
  return samples;
}

/** The same audio through a worse microphone: what a second contributor actually hears. */
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

function contribution(spectrogram: Float32Array[]) {
  const recorder = new ContributionRecorder();
  recorder.push(spectrogram);
  return recorder.finish();
}

live('fingerprint promotion (live)', () => {
  const stamp = Date.now();
  const AGREED = `tmdb:ep:fp-agree-${stamp}`;
  const DISPUTED = `tmdb:ep:fp-dispute-${stamp}`;
  const password = 'test-password-123';

  const people: string[] = [];
  const showA = spectrogramFromPcm(episode(40, 4242));
  const showB = spectrogramFromPcm(episode(40, 9999));

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

    people.push(created.id);
    return { id: created.id as string, email };
  }

  /** Ask the deployed promoter to consider one episode. */
  const promote = (targetId: string) =>
    fetch(`${url}/functions/v1/promote-fingerprint`, {
      method: 'POST',
      headers: { 'x-cron-secret': cronSecret!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetId }),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));

  let first: { id: string; email: string };
  let second: { id: string; email: string };

  beforeAll(async () => {
    first = await makeUser('fpa');
    second = await makeUser('fpb');
  }, 60_000);

  afterAll(async () => {
    await signOut();
    for (const target of [AGREED, DISPUTED]) {
      await adminFetch(`/rest/v1/fingerprint_contributions?target_id=eq.${target}`, {
        method: 'DELETE',
      }).catch(() => {});
      await adminFetch(`/rest/v1/fingerprint_references?target_id=eq.${target}`, {
        method: 'DELETE',
      }).catch(() => {});
    }
    for (const id of people) {
      await adminFetch(`/auth/v1/admin/users/${id}`, { method: 'DELETE' }).catch(() => {});
    }
  }, 60_000);

  it('does not promote what only one person has mapped', async () => {
    await signIn(first.email, password);
    const mine = contribution(showA);
    const sent = await contributeReference({
      targetId: AGREED,
      hashes: mine.hashes,
      frameCount: mine.frames,
      hopSize: 512,
      sampleRate: SAMPLE_RATE,
    });
    expect(sent).toEqual({ ok: true });

    const result = await promote(AGREED);
    expect(result.status).toBe(200);
    expect(result.body.promoted).toBe(0);

    // And a client sees nothing, so Watching Mode falls back to syncing by hand.
    expect((await fetchReference(AGREED)).reference).toBeUndefined();
  }, 120_000);

  it('promotes once a second person hears the same thing', async () => {
    await signOut();
    await signIn(second.email, password);

    // The same audio, heard worse. If agreement needed identical recordings it would
    // never fire outside a test.
    const theirs = contribution(degrade(showA));
    expect(
      await contributeReference({
        targetId: AGREED,
        hashes: theirs.hashes,
        frameCount: theirs.frames,
        hopSize: 512,
        sampleRate: SAMPLE_RATE,
      }),
    ).toEqual({ ok: true });

    const result = await promote(AGREED);
    expect(result.status).toBe(200);
    expect(result.body.promoted).toBe(1);

    const stored = (await fetchReference(AGREED)).reference;
    expect(stored).toBeDefined();
    expect(stored!.agreement).toBe(2);
    expect(stored!.sampleRate).toBe(SAMPLE_RATE);
    // Readable as a reference, not just as bytes: this is what a sync consults.
    expect(stored!.reference.size).toBeGreaterThan(1000);
  }, 120_000);

  it('refuses two people who mapped different episodes', async () => {
    // The failure the whole check exists for, and the one length-comparison called
    // agreement: two episodes of a show are usually the same length.
    await signOut();
    await signIn(first.email, password);
    const mine = contribution(showA);
    await contributeReference({
      targetId: DISPUTED,
      hashes: mine.hashes,
      frameCount: mine.frames,
      hopSize: 512,
      sampleRate: SAMPLE_RATE,
    });

    await signOut();
    await signIn(second.email, password);
    const theirs = contribution(showB);
    await contributeReference({
      targetId: DISPUTED,
      hashes: theirs.hashes,
      frameCount: theirs.frames,
      hopSize: 512,
      sampleRate: SAMPLE_RATE,
    });

    const result = await promote(DISPUTED);
    expect(result.status).toBe(200);
    expect(result.body.promoted).toBe(0);
    expect(result.body.rejected).toBe(1);

    // No reference at all is the right answer. A wrong one would place every later
    // viewer's reactions confidently in the wrong place.
    expect((await fetchReference(DISPUTED)).reference).toBeUndefined();
  }, 120_000);
});
