import { getClient, getSession } from '../sync/auth.ts';
import { fetchFollowing } from './people.ts';

/**
 * The half of your data that does not live on the device.
 *
 * The export screen says "Everything, in full, with no account and no upsell. It is
 * yours." That was true of the local tables and quietly false of everything else: your
 * lists, the people you follow and every comment you have written exist only on the
 * server, and a complete export that leaves out the lists somebody spent a year
 * building is not the thing the sentence promises.
 *
 * This is the project's founding complaint, so it matters more here than most places:
 * TV Time deleted twenty-six million watch histories, and the reason this app exists is
 * that getting your data out should never depend on the goodwill of whoever holds it.
 *
 * Signed out, there is nothing to fetch and the export is complete without this. That is
 * why the field is optional rather than empty: an export with `account` absent means
 * "there was no account", and one with empty lists means "there were no lists".
 */

export interface ExportedList {
  name: string;
  description?: string;
  isPublic: boolean;
  createdAt: string;
  items: Array<{ titleId: string; kind: string; note?: string; addedAt: string }>;
}

export interface ExportedComment {
  targetId: string;
  body: string;
  imageUrl?: string;
  createdAt: string;
}

export interface AccountExport {
  handle?: string;
  lists: ExportedList[];
  /** Handles, not IDs: an ID is meaningless outside the database that minted it. */
  following: string[];
  comments: ExportedComment[];
}

/**
 * Read everything of yours the server holds.
 *
 * Returns undefined when there is no account rather than an empty bundle, and lets a
 * failure surface rather than swallowing it: an export that silently omitted your lists
 * because one request failed would be worse than one that refused to finish.
 */
export async function fetchAccountExport(): Promise<AccountExport | undefined> {
  const client = getClient();
  const session = await getSession();
  if (!client || !session) return undefined;

  const me = session.user.id;

  const [profile, lists, following, comments] = await Promise.all([
    client.from('profiles').select('handle').eq('id', me).maybeSingle(),
    client
      .from('lists')
      .select('id, name, description, is_public, created_at')
      .eq('user_id', me)
      .eq('deleted', false),
    // Through the same call the People screen uses. The follows join needs its foreign
    // key named explicitly because two of them point at profiles, and having one place
    // that knows that is worth more than saving a round trip here.
    fetchFollowing(),
    client
      .from('comments')
      .select('target_id, body, image_url, created_at')
      .eq('user_id', me)
      .eq('deleted', false),
  ]);

  const rows = (lists.data ?? []) as Array<{
    id: string;
    name: string;
    description: string | null;
    is_public: boolean;
    created_at: string;
  }>;

  const exported: ExportedList[] = [];
  for (const list of rows) {
    const { data } = await client
      .from('list_items')
      .select('title_id, kind, note, added_at')
      .eq('list_id', list.id)
      .order('rank')
      .order('added_at');

    exported.push({
      name: list.name,
      description: list.description ?? undefined,
      isPublic: list.is_public,
      createdAt: list.created_at,
      items: ((data ?? []) as Array<Record<string, string | null>>).map((item) => ({
        titleId: String(item.title_id),
        kind: String(item.kind),
        note: item.note ?? undefined,
        addedAt: String(item.added_at),
      })),
    });
  }

  return {
    handle: (profile.data as { handle?: string } | null)?.handle,
    lists: exported,
    following: following.people.map((person) => person.handle).filter(Boolean),
    comments: ((comments.data ?? []) as Array<Record<string, string | null>>).map((row) => ({
      targetId: String(row.target_id),
      body: String(row.body),
      imageUrl: row.image_url ?? undefined,
      createdAt: String(row.created_at),
    })),
  };
}
