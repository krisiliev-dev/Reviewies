import { getClient, getSession } from '../sync/auth.ts';
import { deserialiseReference, type Reference } from './fingerprint.ts';
import { decodeHashes, encodeHashes } from './wire.ts';

// Re-exported because callers have always imported them from here, and the split is an
// implementation detail of where the code can run rather than a change to the API.
export { decodeHashes, encodeHashes };

/**
 * Fetching and contributing fingerprint reference timelines.
 *
 * The reference for one episode is small enough — roughly a megabyte per hour — to
 * download whole and match entirely in the browser. That is what removes the need for
 * a global index, which is the genuinely expensive part of a Shazam-style system.
 */

export interface StoredReference {
  reference: Reference;
  frameCount: number;
  hopSize: number;
  sampleRate: number;
  agreement: number;
}

/**
 * Fetch the accepted reference for an episode.
 *
 * Undefined is the normal answer for anything nobody has contributed yet, which will
 * be most episodes for a long time. Callers fall back to manual sync.
 */
export interface ReferenceResult {
  reference?: StoredReference;
  /** Set when the timeline could not be read. Absent means it was read and there is none. */
  failed?: string;
}

/**
 * The timeline for an episode, if anybody has mapped it.
 *
 * `undefined` for both "nobody has mapped this" and "we could not ask" sent the screen
 * to say the first — which is a statement about the world, and it sends somebody off to
 * spend an episode recording a timeline that may already exist.
 */
export async function fetchReference(
  targetId: string,
  audioTrack = 'default',
): Promise<ReferenceResult> {
  const client = getClient();
  // Not a failure: signed out, this feature is not offered at all.
  if (!client || !(await getSession())) return {};

  const { data, error } = await client
    .from('fingerprint_references')
    .select('hashes, frame_count, hop_size, sample_rate, agreement')
    .eq('target_id', targetId)
    .eq('audio_track', audioTrack)
    .maybeSingle();

  if (error) return { failed: error.message };
  if (!data) return {};

  try {
    return {
      reference: {
        reference: deserialiseReference(decodeHashes(String(data.hashes))),
        frameCount: Number(data.frame_count),
        hopSize: Number(data.hop_size),
        sampleRate: Number(data.sample_rate),
        agreement: Number(data.agreement),
      },
    };
  } catch {
    // A corrupt payload should degrade to manual sync, not crash Watching Mode — and
    // it is a failure rather than an absence: there *is* a timeline, it is unreadable.
    return { failed: 'The stored timeline could not be read.' };
  }
}

/**
 * Contribute a timeline for an episode.
 *
 * Only ever called after an explicit opt-in, and only from a session synced accurately
 * by hand. Upserted rather than inserted so a second attempt corrects the first
 * instead of stacking — one enthusiastic contributor must not be able to outvote
 * everyone else.
 */
/**
 * How long a contributed reference has to be, and how long the apps record for.
 *
 * Twenty seconds is the floor: shorter than that and there is not enough of the episode
 * to place anybody else in it, so the contribution costs a stranger a failed sync rather
 * than helping. Thirty is what the apps record, which leaves room for the first second
 * or two being someone still settling.
 *
 * Both numbers were made up twice. The phone refused anything under twenty seconds and
 * the web never checked at all — it recorded a fixed thirty and uploaded whatever came
 * back, so a recording cut short by a lost microphone went to the server as a reference
 * everybody else would then be matched against. The floor is enforced here now, where
 * every caller passes through, rather than in whichever screen remembered it.
 */
export const MIN_REFERENCE_MS = 20_000;
export const CONTRIBUTION_MS = 30_000;

/**
 * Is this recording too short to be worth anybody's time?
 *
 * Frames, not wall-clock: what reaches the server is a spectrogram, and a recording
 * interrupted half way through has the frames it managed rather than the ones it was
 * asked for. Pulled out of `contributeReference` so it can be tested without a signed-in
 * client — the check it guards was previously only reachable against a live backend,
 * which is to say never (§7).
 */
export function tooShortToContribute(
  frameCount: number,
  hopSize: number,
  sampleRate: number,
): boolean {
  if (frameCount <= 0) return true;
  return (frameCount * hopSize * 1000) / sampleRate < MIN_REFERENCE_MS;
}

export async function contributeReference(opts: {
  targetId: string;
  hashes: Uint32Array;
  frameCount: number;
  hopSize: number;
  sampleRate: number;
  audioTrack?: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const client = getClient();
  const session = await getSession();
  if (!client || !session) return { ok: false, reason: 'Sign in to contribute.' };
  if (opts.frameCount <= 0) return { ok: false, reason: 'Nothing was recorded.' };

  if (tooShortToContribute(opts.frameCount, opts.hopSize, opts.sampleRate)) {
    return {
      ok: false,
      reason: 'That was too short to be useful. Twenty seconds is about the minimum.',
    };
  }

  const { error } = await client.from('fingerprint_contributions').upsert(
    {
      user_id: session.user.id,
      target_id: opts.targetId,
      audio_track: opts.audioTrack ?? 'default',
      hashes: encodeHashes(opts.hashes),
      frame_count: opts.frameCount,
      hop_size: opts.hopSize,
      sample_rate: opts.sampleRate,
    },
    { onConflict: 'user_id,target_id,audio_track' },
  );

  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}
