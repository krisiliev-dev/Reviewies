import { db } from '../data/db.ts';
import { enqueue, queued } from '../sync/engine.ts';
import { getClient, getSession } from '../sync/auth.ts';
import type { Reaction } from '../domain/types.ts';

/**
 * Reactions: local-first, shared when signed in.
 *
 * The local copy is authoritative for display so Watching Mode works offline and
 * signed out. Remote reactions are merged in as they arrive — a network hiccup
 * costs you other people's reactions, never your own.
 *
 * Unlike comments, reactions are readable before you have watched an episode. That
 * asymmetry is deliberate and enforced in the database: replay is the whole point,
 * and gating them would leave every first-time viewer with an empty screen.
 */

/**
 * How long one reaction stays readable, on either platform.
 *
 * Four seconds, which is danmaku's own figure — Niconico has used roughly this since
 * 2006, and the number is doing real work: long enough to read a stranger's emoji while
 * your eyes are on the show, short enough that a busy moment does not become a wall.
 *
 * It was four seconds on the phone and seven on the web, which nobody had decided; the
 * web's stream reads it as a traverse (see `TRAVEL_MS` there) and the phone's as a window
 * behind the playback position, but both now show a reaction for the same length of time.
 */
export const REACTION_VISIBLE_MS = 4000;

/**
 * How many other people's reactions may be on screen at once, and what you can pick.
 *
 * The two platforms had the same control, called it the same thing, and meant different
 * things by it: the web was a slider from a quarter to all, thinning the crowd by a
 * proportion, and the phone was three chips capping the count. Neither was written down
 * anywhere, so neither was a decision (§6.55).
 *
 * A cap, not a proportion, because a proportion is not a promise anybody can act on: a
 * quarter of a quiet episode is nothing and all of a busy one is a wall, and the reader
 * has no way of knowing which they are about to get. "At most this many on screen" is
 * the same experience whichever episode you open.
 */
export const REACTION_DENSITY_CHOICES = [8, 24, 60] as const;
export const DEFAULT_REACTION_DENSITY = 24;

const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export async function addReaction(targetId: string, tMs: number, emoji: string): Promise<Reaction> {
  const reaction: Reaction = {
    id: uid(),
    targetId,
    tMs: Math.max(0, Math.round(tMs)),
    emoji,
    createdAt: Date.now(),
    mine: true,
  };

  // Queued rather than sent: tapping an emoji must never wait on the network — and
  // `queued` is what keeps the queue entry attached to the row when the tab goes between
  // them. This is the fastest tap in the product; §6.155.
  await queued(db.reactions, async () => {
    await db.reactions.add(reaction);
    await enqueue('reactions', reaction as unknown as Record<string, unknown>);
  });
  return reaction;
}

/**
 * Fetch everyone's reactions for one episode and merge them into the local store.
 *
 * Deliberately separate from the sync engine's pull. Sync moves *your* data on a
 * timer; this pulls a specific episode's shared timeline the moment you start
 * watching it, which is a different access pattern with different urgency.
 */
export async function fetchRemoteReactions(targetId: string, limit = 2000): Promise<number> {
  const client = getClient();
  if (!client || !(await getSession())) return 0;

  // A sample spread across the episode, not the first `limit` of them.
  //
  // Asking for reactions ordered by time with a limit sounds harmless and is not: an
  // episode with more reactions than the cap returns only its opening minutes, so the
  // busiest episodes — the ones worth watching along with — were exactly the ones that
  // fell silent after the titles. The server buckets by time and returns the liveliest
  // few from each, which is also the shape the density control here already wants.
  const sampled = await client.rpc('reactions_sample', {
    p_target: targetId,
    p_bucket_ms: 10_000,
    p_per_bucket: 10,
    p_limit: limit,
  });

  // A client can be newer than the database it is talking to — an app that has not been
  // updated, or a project mid-migration. Falling back to the old query keeps reactions
  // working there rather than emptying the screen; it is the previous behaviour, prefix
  // and all, and is meant to be reachable only until the migration lands.
  const { data, error } = sampled.error
    ? await client
        .from('reactions')
        .select('id, user_id, target_id, t_ms, emoji, created_at')
        .eq('target_id', targetId)
        .eq('deleted', false)
        .order('t_ms', { ascending: true })
        .limit(limit)
    : sampled;

  if (error || !data) return 0;

  const session = await getSession();
  const myId = session?.user.id;

  // The RPC and the fallback select return the same columns, but through different
  // typings, so they are read as one shape here rather than at each call site.
  const rows = data as Array<Record<string, unknown>>;

  const incoming: Reaction[] = rows.map((row) => ({
    id: String(row.id),
    targetId: String(row.target_id),
    tMs: Number(row.t_ms),
    emoji: String(row.emoji),
    createdAt: Date.parse(String(row.created_at)) || Date.now(),
    // Reactions we authored on another device are still ours.
    mine: row.user_id === myId,
  }));

  // bulkPut is keyed on id, so re-fetching is idempotent and cannot duplicate a
  // reaction that is already queued locally but not yet uploaded.
  // Deliberately not queued: these came *from* the server. Sending them back is a loop
  // nobody notices until it has spent somebody's data allowance, and the rows are
  // already there.
  await db.reactions.bulkPut(incoming);
  return incoming.length;
}

/**
 * Detect a consistent offset between your reactions and everyone else's.
 *
 * Manual sync drifts: you press "start watching" a few seconds late, and from then
 * on every reaction lands early or late. Reaction density is itself a fingerprint —
 * if your taps consistently trail the crowd's peaks by the same amount, that amount
 * is your offset.
 *
 * Costs nothing extra: it reuses data already collected, with no microphone and no
 * reference database.
 */
export function estimateDriftMs(
  mine: Array<{ tMs: number }>,
  others: Array<{ tMs: number }>,
  opts: { windowMs?: number; minMatches?: number } = {},
): number | undefined {
  const windowMs = opts.windowMs ?? 30_000;
  const minMatches = opts.minMatches ?? 3;
  if (mine.length < minMatches || others.length === 0) return undefined;

  const deltas: number[] = [];
  for (const m of mine) {
    // Nearest crowd reaction within the window; anything further apart is more
    // likely a different moment than a drifted match.
    let best: number | undefined;
    for (const o of others) {
      const d = o.tMs - m.tMs;
      if (Math.abs(d) > windowMs) continue;
      if (best === undefined || Math.abs(d) < Math.abs(best)) best = d;
    }
    if (best !== undefined) deltas.push(best);
  }

  if (deltas.length < minMatches) return undefined;

  // Median, not mean: one mistimed tap should not drag the estimate.
  deltas.sort((a, b) => a - b);
  const mid = Math.floor(deltas.length / 2);
  const median =
    deltas.length % 2 ? deltas[mid] : Math.round((deltas[mid - 1] + deltas[mid]) / 2);

  // Below a couple of seconds it is noise, not drift, and nudging would be worse
  // than leaving it alone.
  return Math.abs(median) >= 2000 ? median : undefined;
}
