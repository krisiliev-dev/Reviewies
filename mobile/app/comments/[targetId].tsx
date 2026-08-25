import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
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
  type Comment,
} from '@reviewies/core/social/comments';
import { radius, theme } from '../../src/ui/theme';

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

  async function submit() {
    setError(undefined);
    try {
      await postComment(targetId, draft);
      setDraft('');
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
          <Text style={styles.blurb}>
            Comments need an account. Sync is not configured on this build.
          </Text>
        ) : !watched ? (
          // The database enforces this; the screen only explains it.
          <View style={styles.card}>
            <Text style={styles.cardHeading}>Hidden until you watch it</Text>
            <Text style={styles.blurb}>
              Comments on this episode stay sealed until you have seen it. Nothing here
              can spoil you, because the server will not send them.
            </Text>
          </View>
        ) : (
          <>
            <View
              style={styles.chips}
              accessibilityRole="radiogroup"
              accessibilityLabel="How much effort a comment has to show"
            >
              {EFFORT_LEVELS.map((level) => (
                <Pressable
                  key={level.label}
                  onPress={() => setEffort(level.minLength)}
                  style={[styles.chip, effort === level.minLength && styles.chipOn]}
                  accessibilityRole="radio"
                  accessibilityState={{
                    selected: effort === level.minLength,
                    checked: effort === level.minLength,
                  }}
                  accessibilityLabel={`Show ${level.label.toLowerCase()} comments`}
                >
                  <Text
                    style={[styles.chipText, effort === level.minLength && styles.chipTextOn]}
                  >
                    {level.label}
                  </Text>
                </Pressable>
              ))}
              {hidden > 0 && <Text style={styles.hidden}>{hidden} hidden</Text>}
            </View>

            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="What did you think?"
              placeholderTextColor={theme.muted}
              multiline
              style={styles.input}
            />
            <Pressable
              style={[styles.primary, !draft.trim() && styles.disabled]}
              onPress={submit}
              disabled={!draft.trim()}
              accessibilityRole="button"
              accessibilityState={{ disabled: !draft.trim() }}
            >
              <Text style={styles.primaryText}>Post</Text>
            </Pressable>
            {error && <Text style={styles.error}>{error}</Text>}

            {loading && <ActivityIndicator color={theme.accent} />}

            {!loading && visible.length === 0 && (
              <Text style={styles.blurb}>
                {comments.length > 0
                  ? 'Everything is filtered out at this level.'
                  : gated
                    ? 'Nothing here yet.'
                    : 'Be the first to say something.'}
              </Text>
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
                      onPress={() => void deleteComment(comment.id).then(load)}
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
  commentHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentWho: { flex: 1, minWidth: 0 },
  // 24px is the WCAG 2.5.8 minimum, and it is a CSS pixel count rather than a font
  // size, so it must not be expressed in anything that scales with text.
  deleteComment: { minHeight: 24, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  deleteCommentText: { color: theme.muted, fontSize: 13, textDecorationLine: 'underline' },
  content: { padding: 16, gap: 10, backgroundColor: theme.ink, flexGrow: 1, paddingBottom: 40 },
  episode: { color: theme.muted, fontSize: 14 },
  blurb: { color: theme.muted, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: theme.surface, borderRadius: radius.xl, padding: 16, gap: 8 },
  cardHeading: { color: theme.text, fontSize: 16, fontWeight: '700' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chip: {
    backgroundColor: theme.surface2,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipOn: { backgroundColor: theme.accent },
  chipText: { color: theme.muted, fontSize: 12 },
  chipTextOn: { color: theme.ink, fontWeight: '600' },
  hidden: { color: theme.muted, fontSize: 11 },

  input: {
    backgroundColor: theme.surface,
    borderRadius: radius.lg,
    padding: 14,
    color: theme.text,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  primary: {
    alignSelf: 'flex-start',
    backgroundColor: theme.accent,
    borderRadius: radius.md,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  primaryText: { color: theme.ink, fontWeight: '700', fontSize: 14 },
  disabled: { opacity: 0.4 },
  error: { color: theme.accent, fontSize: 13 },

  comment: { backgroundColor: theme.surface, borderRadius: radius.lg, padding: 12, gap: 6 },
  handle: { color: theme.muted, fontSize: 11 },
  body: { color: theme.text, fontSize: 14, lineHeight: 20 },
  image: { width: '100%', height: 180, borderRadius: radius.md },
});
