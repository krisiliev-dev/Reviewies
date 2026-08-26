import { getClient, getSession } from '../sync/auth.ts';

/**
 * Episode comments.
 *
 * The reason this feature exists: Reddit was emphatic that comments, not tracking,
 * were what people actually valued about TV Time. "I could've used any other
 * tracking app, but I stayed with TVTime because I enjoyed reading the comments."
 *
 * Spoiler safety is not implemented here. It is a row-level security policy in the
 * database: a comment on an episode is only selectable once you have watched that
 * episode. This module cannot leak a plot twist even if it tries, which is the point
 * of putting the rule in the database rather than in application code.
 */

export interface Comment {
  id: string;
  userId: string;
  handle?: string;
  body: string;
  imageUrl?: string;
  createdAt: number;
  mine: boolean;
}

export interface CommentsResult {
  comments: Comment[];
  /**
   * True when nothing came back because the episode is unwatched, rather than
   * because nobody has commented. The UI must distinguish these — "no comments yet"
   * and "hidden until you watch it" mean very different things.
   */
  gated: boolean;
}

export async function fetchComments(targetId: string, hasWatched: boolean): Promise<CommentsResult> {
  const client = getClient();
  const session = await getSession();
  if (!client || !session) return { comments: [], gated: false };

  const { data, error } = await client
    .from('comments')
    .select('id, user_id, body, image_url, created_at, profiles(handle)')
    .eq('target_id', targetId)
    .eq('deleted', false)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error || !data) return { comments: [], gated: !hasWatched };

  const comments: Comment[] = data.map((row) => {
    const profile = row.profiles as { handle?: string } | { handle?: string }[] | null;
    const handle = Array.isArray(profile) ? profile[0]?.handle : profile?.handle;
    return {
      id: String(row.id),
      userId: String(row.user_id),
      handle,
      body: String(row.body),
      imageUrl: row.image_url ? String(row.image_url) : undefined,
      createdAt: Date.parse(String(row.created_at)) || Date.now(),
      mine: row.user_id === session.user.id,
    };
  });

  return { comments, gated: comments.length === 0 && !hasWatched };
}

/**
 * What actually gets stored as the comment's text.
 *
 * A screenshot on its own is a complete comment — that is most of what people posted
 * on TV Time — but `comments.body` is `not null` with a length check, so a wordless
 * picture would be rejected by the database. Standing in a placeholder keeps the
 * constraint honest without making the user type something they did not mean.
 */
export function commentBody(body: string, imageUrl?: string): string {
  const trimmed = body.trim();
  if (trimmed) return trimmed;
  return imageUrl ? '📷' : '';
}

/** Matches the bucket's allow list in migration 0009. */
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * One image, described in a way both platforms can produce.
 *
 * The browser has a `File`, which carries its own type and size. React Native has no
 * `File` at all: its `FormData` takes `{ uri, name, type }` and its runtime turns that
 * into the multipart part, with the type and the size known only to whoever picked the
 * image. So neither the part nor its metadata can be derived from the other, and the
 * caller supplies both.
 */
export interface ImageUpload {
  /** Whatever `FormData.append` should be given — a `File`, or RN's `{uri, name, type}`. */
  part: unknown;
  type: string;
  size: number;
}

/**
 * Upload a screenshot for a comment.
 *
 * Doc 8 §4: screenshots were core to TV Time's comment culture and are the thing
 * people name most often as missing from its successors.
 *
 * This goes through the `upload-comment-image` edge function rather than straight to
 * storage. Not a preference — `storage.objects` on this project is owned by a role we
 * cannot become, so the policies that would confine a browser write to the user's own
 * folder cannot be created (migration 0009 explains it). The function runs with the
 * service role, establishes the user from their JWT, and derives the path itself.
 *
 * Size and type are still checked here so a mistake costs a sentence rather than a
 * slow upload followed by a rejection. The function checks them again, because a
 * client-side check is a courtesy and not a control.
 *
 * It took a `File` until the phone needed it, which is why the phone could show other
 * people's screenshots and never post one.
 */
export async function uploadCommentImage(
  image: ImageUpload,
): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  const client = getClient();
  const session = await getSession();
  if (!client || !session) return { ok: false, reason: 'Sign in to attach an image.' };

  if (!IMAGE_TYPES.includes(image.type)) {
    return { ok: false, reason: 'Images only — JPEG, PNG, WebP or GIF.' };
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return { ok: false, reason: 'That image is over 5 MB.' };
  }
  // The function rejects an empty file, and a picker that hands back a zero-byte asset
  // is a thing that happens. Saying so here costs nothing.
  if (image.size === 0) return { ok: false, reason: 'That file is empty.' };

  const body = new FormData();
  body.append('file', image.part as Blob);

  const { data, error } = await client.functions.invoke('upload-comment-image', { body });

  if (error) {
    // The function answers with a sentence; surface that rather than "non-2xx".
    const said = await readFunctionError(error);
    return { ok: false, reason: said ?? 'Could not upload that image.' };
  }
  const url = (data as { url?: string } | null)?.url;
  return url ? { ok: true, url } : { ok: false, reason: 'Upload returned no URL.' };
}

/** supabase-js hides the response body on a non-2xx; dig the message back out. */
async function readFunctionError(error: unknown): Promise<string | undefined> {
  const response = (error as { context?: Response }).context;
  if (!(response instanceof Response)) return undefined;
  try {
    const body = (await response.json()) as { error?: string };
    return body.error;
  } catch {
    return undefined;
  }
}

export async function postComment(
  targetId: string,
  body: string,
  imageUrl?: string,
): Promise<void> {
  const client = getClient();
  const session = await getSession();
  if (!client || !session) throw new Error('Sign in to comment');

  const text = commentBody(body, imageUrl);
  if (!text) throw new Error('Say something first');
  if (text.length > 4000) throw new Error('That is longer than the 4000 character limit');

  const { error } = await client.from('comments').insert({
    id: crypto.randomUUID(),
    user_id: session.user.id,
    target_id: targetId,
    body: text,
    image_url: imageUrl,
  });

  if (error) {
    // The database refuses comments on unwatched episodes. Translate the raw
    // policy violation into something a person can act on.
    if (error.code === '42501') throw new Error('Mark this episode watched before commenting');
    throw new Error(error.message);
  }
}

export async function deleteComment(
  id: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const client = getClient();
  if (!client) return { ok: false, reason: 'Sign in to delete a comment.' };

  // Soft delete: the row stays so counts do not break, and RLS hides it.
  const { error } = await client
    .from('comments')
    .update({ deleted: true, updated_at: new Date().toISOString() })
    .eq('id', id);

  // Reported rather than swallowed: a delete that failed used to look exactly like one
  // that worked — the comment vanished from the screen and came back on the next load,
  // which for something somebody wanted taken down is the worst way to be wrong. §6.57.
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/**
 * Filter out low-effort one-liners.
 *
 * The single most corroborated unmet need in the research — raised independently on
 * Hacker News and r/Letterboxd, and shipped by nobody:
 *
 *   "Can I get a way to filter out short one-liner reviews? Please?"
 *
 * Your own comments are never hidden, and neither is anything with an image, since a
 * screenshot with a short caption is exactly the kind of post people liked.
 */
export function filterByEffort(comments: Comment[], minLength: number): Comment[] {
  if (minLength <= 0) return comments;
  return comments.filter((c) => c.mine || c.imageUrl || c.body.trim().length >= minLength);
}

export const EFFORT_LEVELS = [
  { label: 'Everything', minLength: 0 },
  { label: 'Skip one-liners', minLength: 80 },
  { label: 'Proper reviews', minLength: 280 },
] as const;
