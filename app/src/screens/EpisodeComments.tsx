import { useCallback, useEffect, useState } from 'react';
import { Choice } from '../ui/Choice';
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
  deleteComment,
  type Comment,
} from '@reviewies/core/social/comments';
import { COPY } from '@reviewies/core/copy';
import { COMPOSE, COMPOSE_OPEN } from '@reviewies/core/ui/compose';
import { Button } from '../ui/Button';
import { Note } from '../ui/Note';
import { Field } from '../ui/Field';
import { Masthead } from '../ui/Masthead';
import { episodeCode, episodeName } from '@reviewies/core/ui/episode';

export function EpisodeComments() {
  const { targetId = '' } = useParams();
  const navigate = useNavigate();

  const [comments, setComments] = useState<Comment[]>([]);
  const [gated, setGated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [effort, setEffort] = useState(0);
  // Revealed, not resident: `core/src/ui/compose.ts` and §6.129.
  const [writing, setWriting] = useState(COMPOSE_OPEN);
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
    // A browser File is both the multipart part and its own metadata; the phone has to
    // supply the two separately, which is why core takes them apart.
    const result = await uploadCommentImage({ part: file, type: file.type, size: file.size });
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
      // Posted, so the form has done its job and the conversation gets the space back.
      setWriting(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : COPY.comments.postFailed);
    }
  }

  const visible = filterByEffort(comments, effort);
  const hidden = comments.length - visible.length;

  return (
    <div className="p-s16">
      {/* `tap`, like every other back control in the app. It was 31x20 — under the 24px
          floor WCAG 2.5.8 sets — for as long as this screen has existed, and no check
          had ever measured it because no suite had ever stopped here. §6.40. */}
      <button
        onClick={() => navigate(-1)}
        aria-label="Back to the title"
        className="tap mb-3 text-s14 text-ink-secondary"
      >
        Back
      </button>

      <Masthead level="sub">{series?.name ?? 'Comments'}</Masthead>
      {episode && (
        <Note>
          {[episodeCode(episode.season, episode.number), episodeName(episode.name, episode.number)]
            .filter(Boolean)
            .join(' · ')}
        </Note>
      )}

      {!syncConfigured() ? (
        <Note className="mt-6">{COPY.comments.needsAccount}</Note>
      ) : !watched ? (
        // The gate is enforced by the database; this only explains it. The words are
        // `copy.ts`'s because the phone said them too, letter for letter. §6.175.
        <div className="mt-6 rounded-plate bg-ground-raised p-4">
          <p className="text-s14 font-title font-semibold">{COPY.comments.unwatchedHeading}</p>
          <Note className="mt-1">{COPY.comments.unwatched}</Note>
        </div>
      ) : (
        <>
          {!writing ? (
            <div className="mt-4">
              <Button
                onPress={() => setWriting(true)}
                tone="secondary"
                label={COMPOSE.open}
                name={COMPOSE.open}
              />
            </div>
          ) : (
            <form onSubmit={submit} className="mt-4 flex flex-col gap-2">
              <Field
                multiline
                label={COPY.fields.comment}
                value={draft}
                onChange={setDraft}
                // Pasting a screenshot straight in is the actual flow — people
                // screenshot the scene and paste it, they do not go via a file picker.
                onPaste={(e) => {
                  const file = [...e.clipboardData.files][0];
                  if (file) void attach(file);
                }}
                placeholder={COPY.fields.commentPlaceholder}
              />

              {image && (
                <div className="flex items-center gap-2">
                  <img src={image} alt="" className="h-16 w-16 rounded-plate object-cover" />
                  <button
                    type="button"
                    onClick={() => setImage(undefined)}
                    aria-label="Remove the attached screenshot"
                    className="tap text-s12 text-ink-secondary underline"
                  >
                    Remove
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  submit
                  disabled={(!draft.trim() && !image) || uploading}
                  tone="primary"
                  label="Post"
                  name="Post"
                />

                {/* Screenshots were core to TV Time's comment culture and are named
                    most often as the thing successors dropped. */}
                <label className="cursor-pointer rounded-pill border border-stroke-signal px-4 py-2 text-s14 text-ink-secondary">
                  {uploading ? 'Uploading…' : image ? 'Replace image' : COPY.comments.attach}
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

                <Button
                  onPress={() => {
                    setWriting(false);
                    setDraft('');
                    setImage(undefined);
                    setError(undefined);
                  }}
                  tone="quiet"
                  label={COMPOSE.cancel}
                  name={COMPOSE.cancel}
                />
              </div>
              {error && <p className="text-s14 text-trouble">{error}</p>}
            </form>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Choice
              name="How much effort a comment has to show"
              options={EFFORT_LEVELS.map((level) => ({
                key: level.minLength,
                label: level.label,
                // Was the whole `aria-label`; as a hint it becomes the second half of the
                // announced name, which is what `announce()` is for.
                hint: `show ${level.label.toLowerCase()} comments`,
              }))}
              value={effort}
              onChange={(next) => setEffort(Number(next))}
            />
            {hidden > 0 && <Note level="footnote" as="span">{hidden} hidden</Note>}
          </div>

          {loading && <Note className="mt-4">Loading…</Note>}

          {!loading && visible.length === 0 && (
            <Note className="mt-6">
              {comments.length > 0
                ? COPY.comments.allFiltered
                : gated
                  ? COPY.comments.sealed
                  : COPY.comments.empty}
            </Note>
          )}

          <ul className="mt-4 flex flex-col gap-2">
            {visible.map((c) => (
              <li key={c.id} className="-mx-s16 border-b border-b-stroke-hairline px-s16 py-s12">
                <Note level="footnote" className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    {c.handle ?? 'someone'} · {new Date(c.createdAt).toLocaleDateString()}
                    {c.mine && ' · you'}
                  </span>
                  {/* Posting something you regret and having no way to take it back is
                      the sort of thing that stops people posting at all. The core has
                      had `deleteComment` since comments existed and neither platform
                      called it. */}
                  {c.mine && (
                    <Button
                      size="inline"
                      tone="quiet"
                      onPress={async () => {
                        const result = await deleteComment(c.id);
                        if (!result.ok) {
                          setError(result.reason);
                          return;
                        }
                        await load();
                      }}
                      label="Delete"
                      name="Delete your comment"
                      className="shrink-0"
                    />
                  )}
                </Note>
                <p className="mt-1 text-s14 whitespace-pre-wrap">{c.body}</p>
                {c.imageUrl && (
                  <img
                    src={c.imageUrl}
                    alt=""
                    loading="lazy"
                    className="mt-2 max-h-72 rounded-plate object-contain"
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
