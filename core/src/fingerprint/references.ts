import { getClient, getSession } from '../sync/auth';
import { deserialiseReference, type Reference } from './fingerprint';

/**
 * Fetching and contributing fingerprint reference timelines.
 *
 * The reference for one episode is small enough — roughly a megabyte per hour — to
 * download whole and match entirely in the browser. That is what removes the need for
 * a global index, which is the genuinely expensive part of a Shazam-style system.
 */

/** Pack a Uint32Array into base64 for transport. */
export function encodeHashes(hashes: Uint32Array): string {
  const bytes = new Uint8Array(hashes.buffer, hashes.byteOffset, hashes.byteLength);
  let binary = '';
  // Chunked: spreading a megabyte into String.fromCharCode overflows the stack.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function decodeHashes(encoded: string): Uint32Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  // Uint32Array needs 4-byte alignment; a truncated payload would misread wildly.
  const usable = bytes.byteLength - (bytes.byteLength % 4);
  return new Uint32Array(bytes.buffer.slice(0, usable));
}

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
export async function fetchReference(
  targetId: string,
  audioTrack = 'default',
): Promise<StoredReference | undefined> {
  const client = getClient();
  if (!client || !(await getSession())) return undefined;

  const { data, error } = await client
    .from('fingerprint_references')
    .select('hashes, frame_count, hop_size, sample_rate, agreement')
    .eq('target_id', targetId)
    .eq('audio_track', audioTrack)
    .maybeSingle();

  if (error || !data) return undefined;

  try {
    return {
      reference: deserialiseReference(decodeHashes(String(data.hashes))),
      frameCount: Number(data.frame_count),
      hopSize: Number(data.hop_size),
      sampleRate: Number(data.sample_rate),
      agreement: Number(data.agreement),
    };
  } catch {
    // A corrupt payload should degrade to manual sync, not crash Watching Mode.
    return undefined;
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
