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
