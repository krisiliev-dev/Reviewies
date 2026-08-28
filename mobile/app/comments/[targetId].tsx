import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { db } from '@reviewies/core/data/db';
import { watchCount } from '@reviewies/core/data/repo';
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
import { border, leadingOf, radius, theme } from '../../src/ui/theme';
import { COPY } from '@reviewies/core/copy';
import { Button } from '../../src/ui/Button';
import { Choice } from '../../src/ui/Choice';
import { text, type, leading } from '@reviewies/core/tokens';
import { Note } from '../../src/ui/Note';
import { Field } from '../../src/ui/Field';

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

  const [episode, setEpisode] = useState<{ season: number; number: number; name: string }>();

  useEffect(() => {
    void db.episodes.get(targetId).then((found) => {
      if (found) setEpisode({ season: found.season, number: found.number, name: found.name });
    });
  }, [targetId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const seen = (await watchCount(targetId)) > 0;
      setWatched(seen);
      const result = await fetchComments(targetId, seen);
      setComments(result.comments);
      setGated(result.gated);
    } finally {
      setLoading(false);
    }
  }, [targetId]);

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
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post that');
    }
  }

  const visible = filterByEffort(comments, effort);
  const hidden = comments.length - visible.length;

  return (
    <>
      <Stack.Screen options={{ title: episode ? `S${episode.season}E${episode.number}` : 'Talk' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {episode && <Text style={styles.episode}>{episode.name}</Text>}

        {!syncConfigured() ? (
          <Note>
            Comments need an account. Sync is not configured on this build.
          </Note>
        ) : !watched ? (
          // The database enforces this; the screen only explains it.
          <View style={styles.card}>
            <Text style={styles.cardHeading}>Hidden until you watch it</Text>
            <Note>
              Comments on this episode stay sealed until you have seen it. Nothing here
              can spoil you, because the server will not send them.
            </Note>
          </View>
        ) : (
          <>
            <View style={styles.chips}>
              <Choice
                name="How much effort a comment has to show"
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

            <Field
              multiline
              label={COPY.fields.comment}
              value={draft}
              onChange={setDraft}
              placeholder="What did you think?"
            />
            {image && (
              <View style={styles.attached}>
                <Image source={{ uri: image }} style={styles.attachedImage} resizeMode="cover" />
                <Pressable
                  onPress={() => setImage(undefined)}
                  accessibilityRole="button"
                  accessibilityLabel="Remove the attached screenshot"
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
            {error && <Text style={styles.error}>{error}</Text>}

            {loading && <ActivityIndicator color={theme.workingFill} />}

            {!loading && visible.length === 0 && (
              <Note>
                {comments.length > 0
                  ? 'Everything is filtered out at this level.'
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
                      accessibilityLabel="Delete your comment"
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
  content: { padding: 16, gap: 12, backgroundColor: theme.ground, flexGrow: 1, paddingBottom: 48 },
  episode: { color: theme.inkSecondary, fontSize: text.s14, fontFamily: type.family.body.name },
  card: { backgroundColor: theme.groundRaised, borderRadius: radius.plate, padding: 16, gap: 8 },
  cardHeading: { color: theme.ink, fontSize: text.s16, fontFamily: type.family.title.name },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  hidden: { color: theme.inkSecondary, fontSize: text.s14, fontFamily: type.family.title.name },

  error: { color: theme.trouble, fontSize: text.s14, fontFamily: type.family.body.name },

  comment: { backgroundColor: theme.groundRaised, borderRadius: radius.plate, padding: 12, gap: 6 },
  handle: { color: theme.inkSecondary, fontSize: text.s12, fontFamily: type.family.body.name },
  body: { color: theme.ink, fontSize: text.s14, lineHeight: leadingOf(text.s14, leading.l143), fontFamily: type.family.prose.name },
  image: { width: '100%', height: 180, borderRadius: radius.plate },
});
