import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { getSession, syncConfigured } from '@reviewies/core/sync/auth';
import {
  createList,
  describeMix,
  fetchListItems,
  fetchLists,
  removeFromList,
  setListVisibility,
  type ListItem,
  type ListSummary,
} from '@reviewies/core/social/lists';
import { db } from '@reviewies/core/data/db';
import { radius, theme } from '../src/ui/theme';
import { COPY } from '@reviewies/core/copy';

/**
 * Lists, mixing film and television freely.
 *
 * *"Mixed Lists Remain a Severe Unmet Need"* — r/Simkl. A natural win here because the
 * app was unified from the start, whereas Letterboxd is bolting TV onto a film product
 * and Simkl keeps the two apart.
 */
export default function ListsScreen() {
  const [lists, setLists] = useState<ListSummary[]>();
  const [name, setName] = useState('');
  const [open, setOpen] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string>();
  const [createFailed, setCreateFailed] = useState(false);
  /** undefined while it is being asked, null when there is nobody signed in. */
  const [session, setSession] = useState<unknown>();

  const load = useCallback(async () => {
    const result = await fetchLists();
    setLists(result.lists);
    setFailed(result.failed);
  }, []);

  useEffect(() => {
    if (!syncConfigured()) {
      setLists([]);
      setSession(null);
      return;
    }
    void getSession().then((result) => setSession(result ?? null));
    void load();
  }, [load]);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setCreateFailed(false);
    try {
      // A create that did not happen used to clear the box and reload an unchanged
      // list, which reads as an app that forgot rather than a write that failed.
      const id = await createList(name);
      if (!id) {
        setCreateFailed(true);
        return;
      }
      setName('');
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!syncConfigured()) {
    return (
      <>
        <Stack.Screen options={{ title: 'Lists' }} />
        <View style={styles.centre}>
          <Text style={styles.blurb}>{COPY.lists.needsAccount}</Text>
        </View>
      </>
    );
  }

  // Signed out on a build that has sync: the create box below cannot work, because
  // `createList` returns undefined without a session. §6.56.
  if (session === null) {
    return (
      <>
        <Stack.Screen options={{ title: 'Lists' }} />
        <View style={styles.centre}>
          <Text style={styles.blurb}>{COPY.lists.signInToMake('Account screen')}</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Lists' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.newRow}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="New list…"
            placeholderTextColor={theme.muted}
            maxLength={120}
            style={styles.input}
          />
          <Pressable
            onPress={create}
            disabled={!name.trim() || busy}
            style={[styles.primary, (!name.trim() || busy) && styles.disabled]}
            accessibilityRole="button"
            accessibilityLabel="Create this list"
            accessibilityState={{ disabled: !name.trim() || busy }}
          >
            <Text style={styles.primaryText}>Add</Text>
          </Pressable>
        </View>

        {createFailed && (
          <Text style={styles.listsFailed} accessibilityLiveRegion="polite">
            {COPY.lists.createFailed}
          </Text>
        )}

        {lists === undefined && <ActivityIndicator color={theme.accent} />}
        {/* See the web's copy of this: "No lists yet" was shown for both having none
            and failing to ask. */}
        {failed && (
          <Text style={styles.listsFailed} accessibilityLiveRegion="polite">
            Could not load your lists ({failed}). They are still there — try again.
          </Text>
        )}
        {!failed && lists?.length === 0 && (
          <Text style={styles.blurb}>{COPY.lists.empty}</Text>
        )}

        {lists?.map((list) => (
          <ListCard
            key={list.id}
            list={list}
            expanded={open === list.id}
            onToggle={() => setOpen(open === list.id ? undefined : list.id)}
            onChanged={load}
          />
        ))}
      </ScrollView>
    </>
  );
}

function ListCard({
  list,
  expanded,
  onToggle,
  onChanged,
}: {
  list: ListSummary;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Array<ListItem & { name?: string }>>();

  useEffect(() => {
    if (!expanded) return;
    void fetchListItems(list.id).then(async (result) => {
      setItems(
        await Promise.all(
          result.items.map(async (item) => ({
            ...item,
            name: (await db.titles.get(item.titleId))?.name,
          })),
        ),
      );
    });
  }, [expanded, list.id]);

  return (
    <View style={styles.card}>
      <Pressable
        onPress={onToggle}
        style={styles.cardHead}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} ${list.name}`}
      >
        <View style={styles.cardBody}>
          <Text style={styles.cardName}>{list.name}</Text>
          <Text style={styles.cardMeta}>
            {list.itemCount} {list.itemCount === 1 ? 'title' : 'titles'}
            {list.isPublic ? ' · public' : ' · private'}
            {list.mine ? '' : ' · someone else’s'}
          </Text>
        </View>
        <Text style={styles.chevron}>{expanded ? '⌄' : '›'}</Text>
      </Pressable>

      {expanded && (
        <View style={styles.cardItems}>
          {items === undefined && <ActivityIndicator color={theme.accent} />}
          {items?.length === 0 && <Text style={styles.blurb}>{COPY.lists.listEmpty}</Text>}
          {/* Saying the mix out loud is the point — a list that is half films should
              say so rather than looking like a broken TV list. */}
          {items && items.length > 0 && <Text style={styles.mix}>{describeMix(items)}</Text>}

          {items?.map((item) => (
            <View key={item.titleId} style={styles.item}>
              {/* Openable. Every other list of titles in the app takes you to the
                  title; here the name was plain text, so the one screen whose entire
                  content is titles somebody chose was the one screen you could not
                  get out of — you had to remember the name and search for it. */}
              <Pressable
                onPress={() => router.push(`/title/${encodeURIComponent(item.titleId)}`)}
                style={styles.itemOpen}
                hitSlop={6}
                accessibilityRole="link"
                accessibilityLabel={`Open ${item.name ?? item.titleId}`}
              >
                <Text numberOfLines={1} style={styles.itemName}>
                  {item.name ?? item.titleId}
                </Text>
              </Pressable>
              {list.mine && (
                <Pressable
                  onPress={async () => {
                    await removeFromList(list.id, item.titleId);
                    onChanged();
                    setItems(items.filter((i) => i.titleId !== item.titleId));
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.name ?? item.titleId} from ${list.name}`}
                >
                  <Text style={styles.remove}>Remove</Text>
                </Pressable>
              )}
            </View>
          ))}

          {list.mine && (
            <Pressable
              onPress={async () => {
                await setListVisibility(list.id, !list.isPublic);
                onChanged();
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Make ${list.name} ${list.isPublic ? 'private' : 'public'}`}
            >
              <Text style={styles.remove}>
                {list.isPublic ? 'Make private' : 'Make public'}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  listsFailed: { color: theme.accent, fontSize: 14, lineHeight: 20 },
  content: { padding: 16, gap: 10, backgroundColor: theme.ink, flexGrow: 1 },
  centre: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: theme.ink },
  blurb: { color: theme.muted, fontSize: 14, lineHeight: 20 },

  newRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: theme.surface,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.text,
    fontSize: 15,
  },
  primary: {
    backgroundColor: theme.accent,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  primaryText: { color: theme.ink, fontWeight: '700', fontSize: 14 },
  disabled: { opacity: 0.4 },

  card: { backgroundColor: theme.surface, borderRadius: radius.xl, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  cardBody: { flex: 1 },
  cardName: { color: theme.text, fontSize: 16, fontWeight: '600' },
  cardMeta: { color: theme.muted, fontSize: 12 },
  chevron: { color: theme.muted, fontSize: 20 },
  cardItems: { paddingHorizontal: 14, paddingBottom: 14, gap: 8 },
  mix: { color: theme.muted, fontSize: 11 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // minHeight, not padding: the row is inside a scroll view where a taller target is
  // free, and WCAG 2.5.8 wants 24px whether or not the name is one line.
  itemOpen: { flex: 1, minHeight: 24, justifyContent: 'center' },
  itemName: { color: theme.text, fontSize: 14 },
  remove: { color: theme.muted, fontSize: 12, textDecorationLine: 'underline' },
});
