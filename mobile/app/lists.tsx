import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Chevron } from '../src/ui/Mark';
import { disclosure } from '@reviewies/core/ui/mark';
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
import { REACH, leadingOf, theme } from '../src/ui/theme';
import { SCREEN } from '@reviewies/core/ui/screen';
import { COPY } from '@reviewies/core/copy';
import { Button } from '../src/ui/Button';
import { Row as BaseRow } from '../src/ui/Row';
import { text, type, leading } from '@reviewies/core/tokens';
import { Note } from '../src/ui/Note';
import { Field } from '../src/ui/Field';

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
        <Stack.Screen options={{ title: COPY.screens.lists }} />
        <View style={styles.centre}>
          <Note>{COPY.lists.needsAccount}</Note>
        </View>
      </>
    );
  }

  // Signed out on a build that has sync: the create box below cannot work, because
  // `createList` returns undefined without a session. §6.56.
  if (session === null) {
    return (
      <>
        <Stack.Screen options={{ title: COPY.screens.lists }} />
        <View style={styles.centre}>
          <Note>{COPY.lists.signInToMake('Account')}</Note>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: COPY.screens.lists }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.newRow}>
          <Field
          label={COPY.fields.listName}
          value={name}
          onChange={setName}
          placeholder={COPY.fields.newListPlaceholder}
          maxLength={120}
          style={styles.grow}
        />
          <Button
            onPress={create}
            disabled={!name.trim() || busy}
            tone="primary"
            label="Add"
            name={COPY.controls.createList}
          />
        </View>

        {createFailed && (
          <Text style={styles.listsFailed} accessibilityLiveRegion="polite">
            {COPY.lists.createFailed}
          </Text>
        )}

        {lists === undefined && <ActivityIndicator color={theme.workingMark} />}
        {/* See the web's copy of this: "No lists yet" was shown for both having none
            and failing to ask. */}
        {failed && (
          <Text style={styles.listsFailed} accessibilityLiveRegion="polite">
            Could not load your lists ({failed}). They are still there — try again.
          </Text>
        )}
        {!failed && lists?.length === 0 && (
          <Note>{COPY.lists.empty}</Note>
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
    /*
     * A `Row`, not a card. `docs/design/direction.md` asks for full-bleed rows on
     * hairlines and this screen was the last list in the app still drawn as inset raised
     * boxes — visible for the first time in `18-lists-in.png`, because until §6.126 this
     * screen photographed a sign-in gate.
     *
     * `Row` already draws exactly this shape: its rule is on the block rather than the
     * row's own line, so the expanded items sit inside the same ruled band instead of
     * getting a rule of their own. That is what `under` is for, and it was written for
     * this case before this case reached it.
     */
    <BaseRow
      title={list.name}
      meta={`${list.itemCount} ${list.itemCount === 1 ? 'title' : 'titles'}${
        list.isPublic ? ' · public' : ' · private'
      }${list.mine ? '' : ' · someone else’s'}`}
      density="index"
      open={{
        name: `${expanded ? 'Collapse' : 'Expand'} ${list.name}`,
        // `run` and no `to`, so both platforms announce a button: this opens the list in
        // place rather than going anywhere.
        run: onToggle,
      }}
      /* One chevron, rotated, and `disclosure` owns which way: this ran right/down while
         the web ran down/up — two conventions for one control. §6.144. No size, because
         `CHEVRON_SIZE` owns that: this one was drawing at 20 against the web's 16. */
      trailing={<Chevron points={disclosure(expanded)} color={theme.inkSecondary} />}
      under={
        expanded ? (
          <View style={styles.cardItems}>
          {items === undefined && !itemsFailed && <ActivityIndicator color={theme.workingMark} />}
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
            <Note>{COPY.lists.listEmpty}</Note>
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
              tag={item.kind === 'show' ? COPY.kinds.show : COPY.kinds.film}
              open={{
                // The list's name, because a screen with three lists open at once
                // otherwise announces the same title three times with nothing to tell
                // the copies apart — the collision §6.96 measures.
                name: `Open ${item.name ?? item.titleId}, on ${list.name}`,
                to: `/title/${encodeURIComponent(item.titleId)}`,
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
              hitSlop={REACH.inline}
              accessibilityRole="button"
              accessibilityLabel={`Make ${list.name} ${list.isPublic ? 'private' : 'public'}`}
            >
              <Text style={styles.remove}>
                {list.isPublic ? COPY.controls.makePrivate : COPY.controls.makePublic}
              </Text>
            </Pressable>
          )}
          </View>
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  /** A field that shares its row with a button. Layout, which the call site owns. */
  grow: { flex: 1, minWidth: 0 },
  listsFailed: { color: theme.trouble, fontSize: text.s14, lineHeight: leadingOf(text.s14, leading.l143), fontFamily: type.family.body.name },
  content: { padding: SCREEN.edge, gap: 12, backgroundColor: theme.ground, flexGrow: 1 },
  /*
   * Top-aligned, and `SCREEN.edge` rather than a fourth screen edge of its own. This
   * used to be `flex: 1, padding: 24, justifyContent: 'center'` — a message floating at
   * 55% of an otherwise blank screen under a title pinned to the top. See `EMPTY_ALIGN`.
   */
  centre: { flex: 1, padding: SCREEN.edge, backgroundColor: theme.ground },

  newRow: { flexDirection: 'row', gap: 8 },

  /* No inset and no fill: `Row` owns the band now, and `under` sits inside it. */
  cardItems: { gap: 8 },
  mix: { color: theme.inkSecondary, fontSize: text.s12, fontFamily: type.family.body.name },
  remove: { color: theme.inkSecondary, fontSize: text.s12, textDecorationLine: 'underline', fontFamily: type.family.title.name },
});
