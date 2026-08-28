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
import { Button } from '../src/ui/Button';
import { Row as BaseRow } from '../src/ui/Row';

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
          <Text style={styles.blurb}>{COPY.lists.signInToMake('Account')}</Text>
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
            placeholderTextColor={theme.inkSecondary}
            maxLength={120}
            style={styles.input}
          />
          <Button
            onPress={create}
            disabled={!name.trim() || busy}
            tone="primary"
            label="Add"
            name="Create this list"
          />
        </View>

        {createFailed && (
          <Text style={styles.listsFailed} accessibilityLiveRegion="polite">
            {COPY.lists.createFailed}
          </Text>
        )}

        {lists === undefined && <ActivityIndicator color={theme.workingFill} />}
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
  const [itemsFailed, setItemsFailed] = useState<string>();
  const [changeFailed, setChangeFailed] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    // `failed` was dropped here, so a list whose items could not be fetched rendered as
    // "Nothing on this list yet" — the screen telling somebody their own work is gone
    // because a request came back empty-handed. §6.57.
    void fetchListItems(list.id).then(async (result) => {
      setItemsFailed(result.failed);
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
          {items === undefined && !itemsFailed && <ActivityIndicator color={theme.workingFill} />}
          {itemsFailed && (
            <Text style={styles.listsFailed} accessibilityLiveRegion="polite">
              {COPY.lists.itemsFailed}
            </Text>
          )}
          {changeFailed && (
            <Text style={styles.listsFailed} accessibilityLiveRegion="polite">
              {COPY.lists.changeFailed}
            </Text>
          )}
          {!itemsFailed && items?.length === 0 && (
            <Text style={styles.blurb}>{COPY.lists.listEmpty}</Text>
          )}
          {/* Saying the mix out loud is the point — a list that is half films should
              say so rather than looking like a broken TV list. */}
          {items && items.length > 0 && <Text style={styles.mix}>{describeMix(items)}</Text>}

          {/* Openable. Every other list of titles in the app takes you to the title;
              here the name was plain text, so the one screen whose entire content is
              titles somebody chose was the one screen you could not get out of — you
              had to remember the name and search for it. */}
          {items?.map((item) => (
            <BaseRow
              key={item.titleId}
              title={item.name ?? item.titleId}
              // No poster on a list item, so the shorter of the two heights.
              density="index"
              tag={item.kind === 'show' ? 'SERIES' : 'FILM'}
              open={{
                // The list's name, because a screen with three lists open at once
                // otherwise announces the same title three times with nothing to tell
                // the copies apart — the collision §6.96 measures.
                name: `Open ${item.name ?? item.titleId}, on ${list.name}`,
                run: () => router.push(`/title/${encodeURIComponent(item.titleId)}`),
              }}
              trailing={
                list.mine ? (
                  <Button
                    size="inline"
                    tone="quiet"
                    label="Remove"
                    name={`Remove ${item.name ?? item.titleId} from ${list.name}`}
                    onPress={async () => {
                      setChangeFailed(false);
                      // The row used to disappear whether or not the server agreed, and
                      // come back the next time anybody opened the list.
                      const result = await removeFromList(list.id, item.titleId);
                      if (!result.ok) {
                        setChangeFailed(true);
                        return;
                      }
                      onChanged();
                      setItems(items.filter((i) => i.titleId !== item.titleId));
                    }}
                  />
                ) : undefined
              }
            />
          ))}

          {list.mine && (
            <Pressable
              onPress={async () => {
                setChangeFailed(false);
                const result = await setListVisibility(list.id, !list.isPublic);
                if (!result.ok) {
                  setChangeFailed(true);
                  return;
                }
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
  listsFailed: { color: theme.trouble, fontSize: 14, lineHeight: 20 },
  content: { padding: 16, gap: 12, backgroundColor: theme.ground, flexGrow: 1 },
  centre: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: theme.ground },
  blurb: { color: theme.inkSecondary, fontSize: 14, lineHeight: 20 },

  newRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: theme.groundRaised,
    borderRadius: radius.none,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: theme.ink,
    fontSize: 15,
  },

  card: { backgroundColor: theme.groundRaised, borderRadius: radius.plate, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  cardBody: { flex: 1 },
  cardName: { color: theme.ink, fontSize: 16, fontWeight: '600' },
  cardMeta: { color: theme.inkSecondary, fontSize: 12 },
  chevron: { color: theme.inkSecondary, fontSize: 20 },
  cardItems: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  mix: { color: theme.inkSecondary, fontSize: 11 },
  remove: { color: theme.inkSecondary, fontSize: 12, textDecorationLine: 'underline' },
});
