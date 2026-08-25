import { getClient, getSession } from '../sync/auth';

/**
 * Profiles, following and blocking.
 *
 * The schema for all three shipped with the first migration and was RLS-tested from
 * the start, but nothing in the app could reach it — you could not set a handle, find
 * anyone, or follow them. Social was day-one scope, so this closes the gap between a
 * verified schema and a usable feature.
 *
 * Two consequences of the row-level security policies shape this module and are worth
 * stating rather than discovering later:
 *
 * - `follows_select` only exposes rows where you are the follower or the followee, so
 *   a public follower count is not queryable and is not offered. That is a deliberate
 *   privacy property, not an omission.
 * - `is_blocked` is symmetric: blocking someone also hides you from them.
 */

export interface Person {
  id: string;
  handle: string;
  displayName?: string;
}

/** Mirrors the `check (handle ~ '^[a-z0-9_]{2,30}$')` constraint in migration 0001. */
const HANDLE_RE = /^[a-z0-9_]{2,30}$/;

/**
 * Fix up what someone typed before rejecting it.
 *
 * People type `@ana`, `Ana Ruiz`, or paste with a trailing space. Silently correcting
 * the obvious cases is kinder than bouncing them off a regex they cannot see.
 */
export function normaliseHandle(input: string): string {
  return input
    .trim()
    .replace(/^@/, '')
    .toLowerCase()
    .replace(/[\s.-]+/g, '_');
}

/** Returns a human explanation, or undefined when the handle is usable. */
export function validateHandle(input: string): string | undefined {
  const handle = normaliseHandle(input);
  if (handle.length < 2) return 'Handles need at least two characters.';
  if (handle.length > 30) return 'Handles can be at most 30 characters.';
  if (!HANDLE_RE.test(handle)) return 'Handles can use letters, numbers and underscores only.';
  return undefined;
}

const toPerson = (row: Record<string, unknown>): Person => ({
  id: String(row.id),
  handle: String(row.handle),
  displayName: row.display_name ? String(row.display_name) : undefined,
});

/**
 * Unwrap an embedded profile from a join.
 *
 * PostgREST returns a to-one embed as an object, but without generated types the
 * client infers an array, and a wrong guess here silently empties a whole list.
 * Accepting both costs one line and removes the question.
 */
export function embeddedPerson(value: unknown): Person | undefined {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object') return undefined;
  const record = row as Record<string, unknown>;
  return record.id ? toPerson(record) : undefined;
}

export async function fetchMyProfile(): Promise<Person | undefined> {
  const client = getClient();
  const session = await getSession();
  if (!client || !session) return undefined;

  const { data, error } = await client
    .from('profiles')
    .select('id, handle, display_name')
    .eq('id', session.user.id)
    .maybeSingle();

  return error || !data ? undefined : toPerson(data);
}

export async function updateProfile(changes: {
  handle?: string;
  displayName?: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const client = getClient();
  const session = await getSession();
  if (!client || !session) return { ok: false, reason: 'Sign in first.' };

  const patch: Record<string, string | null> = {};

  if (changes.handle !== undefined) {
    const problem = validateHandle(changes.handle);
    if (problem) return { ok: false, reason: problem };
    patch.handle = normaliseHandle(changes.handle);
  }
  if (changes.displayName !== undefined) {
    patch.display_name = changes.displayName.trim().slice(0, 60) || null;
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await client.from('profiles').update(patch).eq('id', session.user.id);

  if (error) {
    // The handle is unique; say so plainly rather than showing a constraint name.
    if (error.code === '23505') return { ok: false, reason: 'That handle is taken.' };
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}

/**
 * Find people by handle or display name.
 *
 * Accounts that blocked you are filtered by the select policy. Accounts *you* blocked
 * are now visible to you (migration 0008) so the block list can render, which means
 * search has to drop them explicitly — otherwise blocking someone would fail to
 * remove them from the one place you are most likely to run into them again.
 */
/**
 * One person, by their exact handle.
 *
 * `searchPeople` is a substring match built for a search box, which is the wrong tool
 * for restoring a follow list: "ana" would match "ana", "anastasia" and "banana", and
 * picking the first is how a restore follows a stranger.
 */
export async function findByHandle(handle: string): Promise<Person | undefined> {
  const client = getClient();
  if (!client) return undefined;

  const normalised = normaliseHandle(handle);
  if (!HANDLE_RE.test(normalised)) return undefined;

  const { data, error } = await client
    .from('profiles')
    .select('id, handle, display_name')
    .eq('handle', normalised)
    .maybeSingle();

  if (error || !data) return undefined;
  return toPerson(data);
}

export async function searchPeople(query: string): Promise<Person[]> {
  const client = getClient();
  const session = await getSession();
  if (!client || !session) return [];

  const q = normaliseHandle(query);
  if (q.length < 2) return [];

  const { data, error } = await client
    .from('profiles')
    .select('id, handle, display_name')
    .or(`handle.ilike.%${q}%,display_name.ilike.%${query.trim()}%`)
    .neq('id', session.user.id)
    .limit(20);

  if (error || !data) return [];

  const blocked = new Set((await fetchBlocked()).map((p) => p.id));
  return data.map(toPerson).filter((p) => !blocked.has(p.id));
}

async function fetchEdge(column: 'follower_id' | 'followee_id'): Promise<Person[]> {
  const client = getClient();
  const session = await getSession();
  if (!client || !session) return [];

  // Two foreign keys point at profiles, so the join needs naming explicitly — PostgREST
  // cannot guess which side is wanted. The names are Postgres's own, derived from the
  // inline `references` in migration 0001 rather than declared anywhere.
  //
  // Written out rather than assembled from `column`, which is what this was. A name
  // built at runtime cannot be checked against the schema by anything — and a wrong one
  // does not throw, it returns `{ data: null, error }` and every caller here reads that
  // as "you follow nobody". backendQueries.test.ts checks these two against the
  // migrations, and could not have checked the interpolated form.
  const embed =
    column === 'follower_id'
      ? 'profiles!follows_followee_id_fkey (id, handle, display_name)'
      : 'profiles!follows_follower_id_fkey (id, handle, display_name)';

  const { data, error } = await client.from('follows').select(embed).eq(column, session.user.id);

  if (error || !data) return [];

  return data
    .map((row) => embeddedPerson(row.profiles))
    .filter((p): p is Person => Boolean(p));
}

/** People you follow. */
export const fetchFollowing = (): Promise<Person[]> => fetchEdge('follower_id');

/** People who follow you. Only visible to you; see the note at the top of this file. */
export const fetchFollowers = (): Promise<Person[]> => fetchEdge('followee_id');

export async function follow(
  personId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const client = getClient();
  const session = await getSession();
  if (!client || !session) return { ok: false, reason: 'Sign in first.' };
  if (personId === session.user.id) return { ok: false, reason: 'You already know what you watch.' };

  const { error } = await client
    .from('follows')
    .insert({ follower_id: session.user.id, followee_id: personId });

  if (error && error.code !== '23505') return { ok: false, reason: error.message };
  return { ok: true };
}

export async function unfollow(personId: string): Promise<void> {
  const client = getClient();
  const session = await getSession();
  if (!client || !session) return;
  await client
    .from('follows')
    .delete()
    .eq('follower_id', session.user.id)
    .eq('followee_id', personId);
}

/**
 * Block someone.
 *
 * Blocking also stops following them, in both directions. Leaving a follow edge in
 * place would keep their activity plumbed into a feed the block was meant to end.
 */
export async function blockPerson(personId: string): Promise<void> {
  const client = getClient();
  const session = await getSession();
  if (!client || !session) return;

  await client.from('blocks').insert({ user_id: session.user.id, blocked_id: personId });
  await client
    .from('follows')
    .delete()
    .or(
      `and(follower_id.eq.${session.user.id},followee_id.eq.${personId}),` +
        `and(follower_id.eq.${personId},followee_id.eq.${session.user.id})`,
    );
}

export async function unblockPerson(personId: string): Promise<void> {
  const client = getClient();
  const session = await getSession();
  if (!client || !session) return;
  await client
    .from('blocks')
    .delete()
    .eq('user_id', session.user.id)
    .eq('blocked_id', personId);
}

/**
 * Who you have blocked.
 *
 * Readable only because migration 0008 carves out an exception to the profile select
 * policy for accounts you blocked yourself. Without it this list would be a column of
 * UUIDs with no way to tell who they were, or to undo anything.
 */
export async function fetchBlocked(): Promise<Person[]> {
  const client = getClient();
  const session = await getSession();
  if (!client || !session) return [];

  const { data, error } = await client
    .from('blocks')
    .select('profiles!blocks_blocked_id_fkey (id, handle, display_name)')
    .eq('user_id', session.user.id);

  if (error || !data) return [];

  return data
    .map((row) => embeddedPerson(row.profiles))
    .filter((p): p is Person => Boolean(p));
}
