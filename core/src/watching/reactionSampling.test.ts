import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What the client asks the server for.
 *
 * The SQL that spreads a sample across an episode is tested in the schema suite; this
 * checks the half that decides whether that SQL is ever reached — and that a client
 * talking to a database without the function still shows something.
 */

const rpc = vi.fn();
const from = vi.fn();

vi.mock('../sync/auth', () => ({
  getClient: () => ({ rpc, from }),
  getSession: async () => ({ user: { id: 'me' } }),
}));

const row = (id: string, tMs: number) => ({
  id,
  user_id: 'someone',
  target_id: 'tmdb:ep:1',
  t_ms: tMs,
  emoji: '👏',
  created_at: '2026-06-15T20:00:00Z',
});

/** The chain the fallback query builds, ending in a resolved result. */
function selectChain(result: { data?: unknown[]; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order']) {
    chain[method] = () => chain;
  }
  chain.limit = () => Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
  return chain;
}

describe('asking for a sample rather than a prefix', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { db } = await import('../data/db');
    await db.reactions.clear();
  });

  it('calls the sampling function with the density the screen can show', async () => {
    rpc.mockResolvedValue({ data: [row('a', 1000), row('b', 2_000_000)], error: null });
    const { fetchRemoteReactions } = await import('./reactions');
    const { db } = await import('../data/db');

    const merged = await fetchRemoteReactions('tmdb:ep:1');

    expect(rpc).toHaveBeenCalledWith('reactions_sample', {
      p_target: 'tmdb:ep:1',
      p_bucket_ms: 10_000,
      p_per_bucket: 10,
      p_limit: 2000,
    });
    expect(from).not.toHaveBeenCalled();
    expect(merged).toBe(2);
    expect(await db.reactions.count()).toBe(2);
  });

  it('falls back to the old query against a database without the function', async () => {
    // An app can be newer than the project it talks to. Emptying Watching Mode would be
    // a worse answer than the prefix this used to return.
    rpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } });
    from.mockReturnValue(selectChain({ data: [row('a', 1000)] }));

    const { fetchRemoteReactions } = await import('./reactions');
    expect(await fetchRemoteReactions('tmdb:ep:1')).toBe(1);
    expect(from).toHaveBeenCalledWith('reactions');
  });

  it('returns nothing rather than throwing when both fail', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'nope' } });
    from.mockReturnValue(selectChain({ error: { message: 'offline' } }));

    const { fetchRemoteReactions } = await import('./reactions');
    expect(await fetchRemoteReactions('tmdb:ep:1')).toBe(0);
  });
});
