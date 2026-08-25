import { getClient, getSession } from '../sync/auth';
import type { MediaKind } from '../domain/types';

/**
 * User lists, mixing film and television freely.
 *
 * Server-backed rather than local-first, unlike watch history: a list is meaningful
 * mainly when it can be shared, and visibility is enforced by row-level security
 * rather than by this module.
 */

export interface ListSummary {
  id: string;
  name: string;
  description?: string;
  isPublic: boolean;
  itemCount: number;
  mine: boolean;
}

export interface ListItem {
  titleId: string;
  kind: MediaKind;
  note?: string;
  rank: number;
}

/**
 * What came back, and whether asking worked.
 *
 * "No lists yet" and "we could not read your lists" are different sentences and this
 * returned the first for both. That is alarming on a screen showing work somebody did,
 * and it is worse than alarming in `restoreAccount`, which reads this to know what is
 * already here: a failed read looks like an empty account, and the restore makes a
 * second copy of every list.
 */
export interface ListsResult {
  lists: ListSummary[];
  /** Set when the lists could not be read. Absent means they were read and there were none. */
  failed?: string;
}

export async function fetchLists(): Promise<ListsResult> {
  const client = getClient();
  const session = await getSession();
  // Not a failure: signed out, there is nothing to ask.
  if (!client || !session) return { lists: [] };

  const { data, error } = await client
    .from('lists')
    .select('id, user_id, name, description, is_public, list_items(count)')
    .eq('deleted', false)
    .order('updated_at', { ascending: false });

  if (error) return { lists: [], failed: error.message };
  if (!data) return { lists: [] };

  const lists = data.map((row) => {
    // PostgREST returns an aggregate as a one-element array.
    const counts = row.list_items as Array<{ count: number }> | null;
    return {
      id: String(row.id),
      name: String(row.name),
      description: row.description ? String(row.description) : undefined,
      isPublic: Boolean(row.is_public),
      itemCount: counts?.[0]?.count ?? 0,
      mine: row.user_id === session.user.id,
    };
  });

  return { lists };
}

export async function createList(
  name: string,
  isPublic = false,
  description?: string,
): Promise<string | undefined> {
  const client = getClient();
  const session = await getSession();
  if (!client || !session) return undefined;

  const trimmed = name.trim();
  if (!trimmed) return undefined;

  const { data, error } = await client
    .from('lists')
    .insert({
      user_id: session.user.id,
      name: trimmed.slice(0, 120),
      is_public: isPublic,
      // The column caps at 2000 and a restore should not fail on a description the
      // person already had; truncating is the lesser loss.
      description: description ? description.slice(0, 2000) : null,
    })
    .select('id')
    .single();

  return error || !data ? undefined : String(data.id);
}

export interface ListItemsResult {
  items: ListItem[];
  /** Set when the contents could not be read. Absent means they were read and were none. */
  failed?: string;
}

/**
 * The contents of one list.
 *
 * Same distinction as `fetchLists`, and for the same reason: opening a list you built
 * and being shown an empty one is a bad way to find out the network is down. Fixing the
 * index and not its contents would have been half a fix.
 */
export async function fetchListItems(listId: string): Promise<ListItemsResult> {
  const client = getClient();
  if (!client) return { items: [] };

  const { data, error } = await client
    .from('list_items')
    .select('title_id, kind, note, rank')
    .eq('list_id', listId)
    .order('rank')
    .order('added_at');

  if (error) return { items: [], failed: error.message };
  if (!data) return { items: [] };

  return {
    items: data.map((row) => ({
      titleId: String(row.title_id),
      kind: row.kind as MediaKind,
      note: row.note ? String(row.note) : undefined,
      rank: Number(row.rank),
    })),
  };
}

export async function addToList(
  listId: string,
  titleId: string,
  kind: MediaKind,
  note?: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const client = getClient();
  if (!client) return { ok: false, reason: 'Sign in to use lists.' };

  const { error } = await client
    .from('list_items')
    .insert({ list_id: listId, title_id: titleId, kind, note });

  if (error) {
    // The unique key is what stops a title appearing twice; translate it rather
    // than showing a Postgres error.
    if (error.code === '23505') return { ok: false, reason: 'Already on that list.' };
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}

export async function removeFromList(listId: string, titleId: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  await client.from('list_items').delete().eq('list_id', listId).eq('title_id', titleId);
}

export async function setListVisibility(listId: string, isPublic: boolean): Promise<void> {
  const client = getClient();
  if (!client) return;
  await client
    .from('lists')
    .update({ is_public: isPublic, updated_at: new Date().toISOString() })
    .eq('id', listId);
}

/**
 * Summarise a list's contents for display.
 *
 * Worth showing explicitly because mixing the two is the point — a list that is half
 * films should say so rather than looking like a broken TV list.
 */
export function describeMix(items: ListItem[]): string {
  const shows = items.filter((i) => i.kind === 'show').length;
  const films = items.length - shows;
  if (items.length === 0) return 'Empty';
  if (films === 0) return `${shows} ${shows === 1 ? 'series' : 'series'}`;
  if (shows === 0) return `${films} ${films === 1 ? 'film' : 'films'}`;
  return `${shows} series · ${films} ${films === 1 ? 'film' : 'films'}`;
}
