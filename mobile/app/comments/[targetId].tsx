import { Block } from '../../src/ui/Block';
import { ROW } from '@reviewies/core/ui/row';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { db } from '@reviewies/core/data/db';
import { watchCount, watchPending } from '@reviewies/core/data/repo';
import { useLive } from '../../src/useLive';
import { syncConfigured } from '@reviewies/core/sync/auth';
import {
  deleteComment,
  EFFORT_LEVELS,
  fetchComments,
  filterByEffort,
  postComment,
  uploadCommentImage,
  type Comment,
} from '@reviewies/core/social/comments';
import { pickCommentImage } from '../../src/comments/pickImage';
import { leadingOf, radius, theme, space} from '../../src/ui/theme';
import { SCREEN } from '@reviewies/core/ui/screen';
import { COMPOSE, COMPOSE_OPEN } from '@reviewies/core/ui/compose';
import { COPY } from '@reviewies/core/copy';
import { Button } from '../../src/ui/Button';
import { Choice } from '../../src/ui/Choice';
import { text, type, leading } from '@reviewies/core/tokens';
import { Note } from '../../src/ui/Note';
import { Field } from '../../src/ui/Field';
import { episodeCode, episodeName } from '@reviewies/core/ui/episode';

/**
 * Episode comments, sealed until you have watched the episode.
 *
 * The gate is a row-level security policy, not code in this file: the server will not
 * send a comment on an episode you have not watched. That matters because it means no
 * forgotten code path here can leak a plot twist — this screen only explains the rule.
 *
 * Comments, not tracking, were what people actually valued about TV Time. Doc 8 found
 * people ranking its successors purely by how many comments an episode had.
 */
export default function CommentsScreen() {
  const { targetId: raw } = useLocalSearchParams<{ targetId: string }>();
  const targetId = decodeURIComponent(raw ?? '');

  const [comments, setComments] = useState<Comment[]>([]);
  const [gated, setGated] = useState(false);
  const [watched, setWatched] = useState(false);
  const [loading, setLoading] = useState(true);
  const [effort, setEffort] = useState(0);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string>();
  const [image, setImage] = useState<string>();
  const [uploading, setUploading] = useState(false);
  // Revealed, not resident: `core/src/ui/compose.ts` and §6.129.
  const [writing, setWriting] = useState(COMPOSE_OPEN);

  const [episode, setEpisode] = useState<{ season: number; number: number; name: string }>();

  useEffect(() => {
    void db.episodes.get(targetId).then((found) => {
      if (found) setEpisode({ season: found.season, number: found.number, name: found.name });
    });
  }, [targetId]);

  /*
   * Live, and that is the point rather than an implementation detail: this goes false the
   * instant the queue drains, and the effect below re-asks. Without it the sealed sentence
   * would be right when the screen opened and then stay after the write had landed — a
   * "try again in a moment" that never stops asking. The web reads it through
   * `useLiveQuery` for the same reason. §6.177.
   */
  const pending = useLive(() => watchPending(targetId), [targetId]) ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const seen = (await watchCount(targetId)) > 0;
      setWatched(seen);
      const result = await fetchComments(targetId, seen, pending);
      setComments(result.comments);
      setGated(result.gated);
    } finally {
      setLoading(false);
    }
  }, [targetId, pending]);

  useEffect(() => {
    void load();
  }, [load]);

  async function attach() {
    setError(undefined);
    const picked = await pickCommentImage();
    // A cancelled picker says nothing at all; a rejected one says why.
    if (!picked.ok) {
      if (picked.reason) setError(picked.reason);
      return;
    }

    setUploading(true);
    const result = await uploadCommentImage(picked.image);
    setUploading(false);
    if (result.ok) setImage(result.url);
    else setError(result.reason);
  }

  async function submit() {
    setError(undefined);
    try {
      await postComment(targetId, draft, image);
      setDraft('');
      setImage(undefined);
      // Posted, so the form has done its job and the conversation gets the space back.
      setWriting(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : COPY.comments.postFailed);
    }
  }

  const visible = filterByEffort(comments, effort);
  const hidden = comments.length - visible.length;

  return (
    <>
      <Stack.Screen
        options={{ title: episode ? episodeCode(episode.season, episode.number) : 'Talk' }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {episode && episodeName(episode.name, episode.number) && (
          <Text style={styles.episode}>{episodeName(episode.name, episode.number)}</Text>
        )}

        {!syncConfigured() ? (
          <Note>{COPY.comments.needsAccount}</Note>
        ) : !watched ? (
          // The database enforces this; the screen only explains it — in `copy.ts`'s
          // words, because the web said the same sentence letter for letter. §6.175.
          <Block heading={COPY.comments.unwatchedHeading}>
            <Note>{COPY.comments.unwatched}</Note>
          </Block>
        ) : (
          <>
            {!writing ? (
              <Button
                onPress={() => setWriting(true)}
                tone="secondary"
                label={COMPOSE.open}
                name={COMPOSE.open}
              />
            ) : (
              <>
                <Field
                  multiline
                  label={COPY.fields.comment}
                  value={draft}
                  onChange={setDraft}
                  placeholder={COPY.fields.commentPlaceholder}
                />
                {image && (
                  <View style={styles.attached}>
                    <Image source={{ uri: image }} style={styles.attachedImage} resizeMode="cover" />
                    <Pressable
                      onPress={() => setImage(undefined)}
                      accessibilityRole="button"
                      accessibilityLabel={COPY.controls.removeScreenshot}
                      hitSlop={8}
                      style={styles.removeAttached}
                    >
                      <Text style={styles.deleteCommentText}>Remove</Text>
                    </Pressable>
                  </View>
                )}

                <Button
                  onPress={attach}
                  busy={uploading}
                  disabled={uploading}
                  tone="secondary"
                  label={uploading ? 'Uploading…' : image ? 'Replace screenshot' : COPY.comments.attach}
                  name={image ? 'Replace the attached screenshot' : COPY.comments.attach}
                />

                {/* An image on its own is a post: core turns an empty body into 📷, the
                    same as the web. */}
                <Button
                  onPress={submit}
                  disabled={(!draft.trim() && !image) || uploading}
                  tone="primary"
                  label="Post"
                  name="Post"
                />
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
                {/* The failure belongs to the form: an upload that was rejected or a post
                    the server refused. It folds away with it. */}
                {error && <Text style={styles.error}>{error}</Text>}
              </>
            )}
            <View style={styles.chips}>
              <Choice
                name={COPY.comments.effortLabel}
                options={EFFORT_LEVELS.map((level) => ({
                  key: level.minLength,
                  label: level.label,
                  // Was the whole label; as a hint it becomes the second half of the
                  // announced name, which is what `announce()` is for.
                  hint: `show ${level.label.toLowerCase()} comments`,
                }))}
                value={effort}
                onChange={(next) => setEffort(Number(next))}
              />
              {hidden > 0 && <Text style={styles.hidden}>{hidden} hidden</Text>}
            </View>

            {loading && <ActivityIndicator color={theme.workingMark} />}

            {!loading && visible.length === 0 && (
              <Note>
                {comments.length > 0
                  ? COPY.comments.allFiltered
                  : gated
                    ? COPY.comments.sealed
                    : COPY.comments.empty}
              </Note>
            )}

            {visible.map((comment) => (
              <View key={comment.id} style={styles.comment}>
                <View style={styles.commentHead}>
                  <Text style={[styles.handle, styles.commentWho]}>
                    {comment.handle ?? 'someone'}
                    {comment.mine ? ' · you' : ''}
                  </Text>
                  {/* Same reason as the web: the core has been able to do this since
                      comments existed and nothing offered it. */}
                  {comment.mine && (
                    <Pressable
                      onPress={async () => {
                        const result = await deleteComment(comment.id);
                        if (!result.ok) {
                          setError(result.reason);
                          return;
                        }
                        await load();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={COPY.controls.deleteComment}
                      hitSlop={8}
                      style={styles.deleteComment}
                    >
                      <Text style={styles.deleteCommentText}>Delete</Text>
                    </Pressable>
                  )}
                </View>
                <Text style={styles.body}>{comment.body}</Text>
                {comment.imageUrl && (
                  <Image
                    source={{ uri: comment.imageUrl }}
                    style={styles.image}
                    resizeMode="cover"
                  />
                )}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  attached: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  attachedImage: { width: 72, height: 72, borderRadius: radius.plate, backgroundColor: theme.groundWell },
  removeAttached: { minHeight: 24, minWidth: 44, justifyContent: 'center' },
  commentHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentWho: { flex: 1, minWidth: 0 },
  // 24px is the WCAG 2.5.8 minimum, and it is a CSS pixel count rather than a font
  // size, so it must not be expressed in anything that scales with text.
  deleteComment: { minHeight: 24, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  deleteCommentText: { color: theme.inkSecondary, fontSize: text.s14, textDecorationLine: 'underline', fontFamily: type.family.title.name },
  content: { padding: SCREEN.edge, gap: 12, backgroundColor: theme.ground, flexGrow: 1, paddingBottom: 48 },
  episode: { color: theme.inkSecondary, fontSize: text.s14, fontFamily: type.family.body.name },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  hidden: { color: theme.inkSecondary, fontSize: text.s14, fontFamily: type.family.title.name },

  error: { color: theme.trouble, fontSize: text.s14, fontFamily: type.family.body.name },

  /*
   * A ruled entry, not a card. A comment is one of a list of comments — `SURFACE`'s rule is
   * that a card is a summary or a form, one object taken in whole, and a list of things
   * gets rules. It bleeds to the edge for the same reason every other list on this screen
   * does (§6.121); only the words stay in the column.
   */
  comment: {
    borderBottomWidth: ROW.rule,
    borderBottomColor: theme[ROW.colour],
    marginHorizontal: SCREEN.bleed,
    paddingHorizontal: SCREEN.edge,
    paddingVertical: space.s12,
    gap: space.s6,
  },
  handle: { color: theme.inkSecondary, fontSize: text.s12, fontFamily: type.family.body.name },
  body: { color: theme.ink, fontSize: text.s14, lineHeight: leadingOf(text.s14, leading.l143), fontFamily: type.family.prose.name },
  image: { width: '100%', height: 180, borderRadius: radius.plate },
});
