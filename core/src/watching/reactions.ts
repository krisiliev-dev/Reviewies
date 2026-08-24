import { db } from '../data/db';
import { enqueue } from '../sync/engine';
import { getClient, getSession } from '../sync/auth';
import type { Reaction } from '../domain/types';

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

  await db.reactions.add(reaction);
  // Queued rather than sent: tapping an emoji must never wait on the network.
  await enqueue('reactions', reaction as unknown as Record<string, unknown>);
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

  const { data, error } = await client
    .from('reactions')
    .select('id, user_id, target_id, t_ms, emoji, created_at')
    .eq('target_id', targetId)
    .eq('deleted', false)
    .order('t_ms', { ascending: true })
    .limit(limit);

  if (error || !data) return 0;

  const session = await getSession();
  const myId = session?.user.id;

  const incoming: Reaction[] = data.map((row) => ({
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
