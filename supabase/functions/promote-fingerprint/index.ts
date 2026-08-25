/**
 * Promotes contributed timelines into the reference clients actually use.
 *
 * The decision this makes is not made here. `chooseReference` in `@reviewies/core`
 * decides, and it is tested there against synthetic episodes - the same episode heard
 * through a worse microphone, different episodes of similar length, contributions
 * covering different stretches, and a contributor whose clock was half a minute out.
 * This file fetches rows, hands them over, and writes down the answer.
 *
 * It runs here rather than on a client for a reason that is part of the trust model:
 * RLS lets you read your own raw contribution and nobody else's, because an unvalidated
 * timeline is exactly what forging agreement would require. Cross-validation therefore
 * has to happen somewhere holding the service role.
 *
 * Deploy:
 *   supabase functions deploy promote-fingerprint --no-verify-jwt
 *   supabase secrets set CRON_SECRET=...
 *
 * Invoked on a schedule, or directly for one episode:
 *   POST { "targetId": "tmdb:episode:123", "audioTrack": "default" }
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { chooseReference, type Contribution } from '../../../core/src/fingerprint/agreement.ts';
import { decodeHashes } from '../../../core/src/fingerprint/wire.ts';

/** Episodes considered per scheduled run. Promotion is quadratic in contributions. */
const BATCH = 25;

interface Row {
  id: string;
  target_id: string;
  audio_track: string;
  hashes: string;
  frame_count: number;
  hop_size: number;
  sample_rate: number;
}

Deno.serve(async (req) => {
  // Service role in hand, so this must not be openly callable.
  const secret = Deno.env.get('CRON_SECRET');
  if (secret && req.headers.get('x-cron-secret') !== secret) {
    return new Response('forbidden', { status: 403 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let only: { targetId?: string; audioTrack?: string } = {};
  try {
    only = await req.json();
  } catch {
    // No body means "whatever needs doing", which is how the schedule calls it.
  }

  let pending = supabase
    .from('fingerprint_contributions')
    .select('id, target_id, audio_track, hashes, frame_count, hop_size, sample_rate');
  if (only.targetId) pending = pending.eq('target_id', only.targetId);
  if (only.audioTrack) pending = pending.eq('audio_track', only.audioTrack);

  const { data, error } = await pending;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Group by episode and track. A dub and its original are different audio and must
  // never be compared, let alone allowed to corroborate each other.
  const groups = new Map<string, Row[]>();
  for (const row of (data ?? []) as Row[]) {
    const key = `${row.target_id}\u0000${row.audio_track}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const promoted: string[] = [];
  const rejected: string[] = [];
  let considered = 0;

  for (const [key, rows] of groups) {
    // One contribution can never be corroborated, so there is nothing to weigh.
    if (rows.length < 2) continue;
    if (considered >= BATCH) break;
    considered++;

    const [targetId, audioTrack] = key.split('\u0000');

    let contributions: Contribution[];
    try {
      contributions = rows.map((row) => ({
        id: row.id,
        hashes: decodeHashes(row.hashes),
        frameCount: row.frame_count,
        hopSize: row.hop_size,
        sampleRate: row.sample_rate,
      }));
    } catch {
      // A corrupt payload is one contributor's problem, not the episode's.
      rejected.push(targetId);
      continue;
    }

    const winner = chooseReference(contributions);
    if (!winner) {
      // Nobody corroborates anybody yet. Not an error - it is the normal state of an
      // episode one person has mapped, and the right answer for one where two people
      // mapped different things.
      rejected.push(targetId);
      continue;
    }

    const source = rows.find((row) => row.id === winner.chosen.id)!;
    const { error: writeError } = await supabase.rpc('record_fingerprint_reference', {
      p_target: targetId,
      p_track: audioTrack,
      p_hashes: source.hashes,
      p_frame_count: source.frame_count,
      p_hop_size: source.hop_size,
      p_sample_rate: source.sample_rate,
      p_agreement: winner.agreement,
    });

    if (writeError) return Response.json({ error: writeError.message }, { status: 500 });
    promoted.push(targetId);
  }

  return Response.json({ considered, promoted: promoted.length, rejected: rejected.length });
});
