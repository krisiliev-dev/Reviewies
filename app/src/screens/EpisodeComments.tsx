import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../data/db';
import { watchCount } from '@reviewies/core/data/repo';
import { syncConfigured } from '@reviewies/core/sync/auth';
import {
  EFFORT_LEVELS,
  IMAGE_TYPES,
  fetchComments,
  filterByEffort,
  postComment,
  uploadCommentImage,
  type Comment,
} from '@reviewies/core/social/comments';

export function EpisodeComments() {
  const { targetId = '' } = useParams();
  const navigate = useNavigate();

  const [comments, setComments] = useState<Comment[]>([]);
  const [gated, setGated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [effort, setEffort] = useState(0);
  const [draft, setDraft] = useState('');
  const [image, setImage] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();

  const episode = useLiveQuery(() => db.episodes.get(targetId), [targetId]);
  const series = useLiveQuery(
    async () => (episode?.seriesId ? db.titles.get(episode.seriesId) : undefined),
    [episode?.seriesId],
  );
  const watched = useLiveQuery(async () => (await watchCount(targetId)) > 0, [targetId], false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchComments(targetId, watched);
      setComments(result.comments);
      setGated(result.gated);
    } finally {
      setLoading(false);
    }
  }, [targetId, watched]);

  useEffect(() => {
    void load();
  }, [load]);

  async function attach(file: File) {
    setError(undefined);
    setUploading(true);
    const result = await uploadCommentImage(file);
    setUploading(false);
    if (result.ok) setImage(result.url);
    else setError(result.reason);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    try {
      await postComment(targetId, draft, image);
      setDraft('');
      setImage(undefined);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post that');
    }
  }

  const visible = filterByEffort(comments, effort);
  const hidden = comments.length - visible.length;

  return (
    <div className="p-4">
      <button onClick={() => navigate(-1)} className="mb-3 text-sm text-muted">
        Back
      </button>

      <h1 className="text-xl font-semibold">{series?.name ?? 'Comments'}</h1>
      {episode && (
        <p className="text-sm text-muted">
          S{episode.season}E{episode.number} · {episode.name}
        </p>
      )}

      {!syncConfigured() ? (
        <p className="mt-6 text-sm text-muted">
          Comments need an account. Sync is not configured on this build.
        </p>
      ) : !watched ? (
        // The gate is enforced by the database; this only explains it.
        <div className="mt-6 rounded-2xl bg-surface p-4">
          <p className="font-medium">Hidden until you watch it</p>
          <p className="mt-1 text-sm text-muted">
            Comments on this episode stay sealed until you have seen it. Nothing here can
            spoil you, because the server will not send them.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            {EFFORT_LEVELS.map((level) => (
              <button
                key={level.label}
                onClick={() => setEffort(level.minLength)}
                className={`rounded-full px-3 py-1.5 text-xs ${
                  effort === level.minLength ? 'bg-accent text-ink' : 'bg-surface-2 text-muted'
                }`}
              >
                {level.label}
              </button>
            ))}
            {hidden > 0 && <span className="text-xs text-muted">{hidden} hidden</span>}
          </div>

          <form onSubmit={submit} className="mt-4 flex flex-col gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              // Pasting a screenshot straight in is the actual flow — people
              // screenshot the scene and paste it, they do not go via a file picker.
              onPaste={(e) => {
                const file = [...e.clipboardData.files][0];
                if (file) void attach(file);
              }}
              placeholder="What did you think?"
              rows={3}
              className="w-full resize-y rounded-xl bg-surface px-3 py-2.5 text-base outline-none placeholder:text-muted"
            />

            {image && (
              <div className="flex items-center gap-2">
                <img src={image} alt="" className="h-16 w-16 rounded-lg object-cover" />
                <button
                  type="button"
                  onClick={() => setImage(undefined)}
                  className="text-xs text-muted underline"
                >
                  Remove
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={(!draft.trim() && !image) || uploading}
                className="rounded-xl bg-accent px-4 py-2 font-medium text-ink disabled:opacity-40"
              >
                Post
              </button>

              {/* Screenshots were core to TV Time's comment culture and are named
                  most often as the thing successors dropped. */}
              <label className="cursor-pointer rounded-xl bg-surface-2 px-4 py-2 text-sm text-muted">
                {uploading ? 'Uploading…' : image ? 'Replace image' : 'Add a screenshot'}
                <input
                  type="file"
                  accept={IMAGE_TYPES.join(',')}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void attach(file);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            {error && <p className="text-sm text-accent">{error}</p>}
          </form>

          {loading && <p className="mt-4 text-sm text-muted">Loading…</p>}

          {!loading && visible.length === 0 && (
            <p className="mt-6 text-sm text-muted">
              {comments.length > 0
                ? 'Everything is filtered out at this level.'
                : gated
                  ? // Marked watched locally, but the server has not received that yet,
                    // so its spoiler gate is still closed. Say so rather than claiming
                    // the episode has no comments.
                    'Your watch has not synced yet, so comments are still sealed. Try again in a moment.'
                  : 'Nothing here yet. Be the first.'}
            </p>
          )}

          <ul className="mt-4 flex flex-col gap-2">
            {visible.map((c) => (
              <li key={c.id} className="rounded-2xl bg-surface p-3">
                <p className="text-xs text-muted">
                  {c.handle ?? 'someone'} · {new Date(c.createdAt).toLocaleDateString()}
                  {c.mine && ' · you'}
                </p>
                <p className="mt-1 text-sm whitespace-pre-wrap">{c.body}</p>
                {c.imageUrl && (
                  <img
                    src={c.imageUrl}
                    alt=""
                    loading="lazy"
                    className="mt-2 max-h-72 rounded-lg object-contain"
                  />
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
