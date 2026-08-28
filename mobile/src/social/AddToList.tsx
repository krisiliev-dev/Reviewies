import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { syncConfigured } from '@reviewies/core/sync/auth';
import { addToList, createList, fetchLists, type ListSummary } from '@reviewies/core/social/lists';
import type { MediaKind } from '@reviewies/core/domain/types';
import { radius, theme, tap } from '../ui/theme';
import { Button } from '../ui/Button';
import { text, type } from '@reviewies/core/tokens';
import { Note } from '../ui/Note';
import { Field } from '../ui/Field';
import { COPY } from '@reviewies/core/copy';

/**
 * Add a title to a list from wherever you happen to be looking at it.
 *
 * Lists shipped before this did, which meant they could be created but never filled —
 * the sort of gap that makes a feature look finished while being useless. On the phone
 * the gap outlived the web's fix by several weeks, because parity was checked screen by
 * screen and this is a control inside a screen that existed.
 */
export function AddToList({ titleId, kind }: { titleId: string; kind: MediaKind }) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<ListSummary[]>();
  const [note, setNote] = useState<string>();
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (!open) return;
    // Only your own lists can be added to.
    void fetchLists().then((all) => setLists(all.lists.filter((l) => l.mine)));
  }, [open]);

  if (!syncConfigured()) return null;

  async function add(listId: string, listName: string) {
    const result = await addToList(listId, titleId, kind);
    setNote(result.ok ? `Added to ${listName}.` : result.reason);
    if (result.ok) setOpen(false);
  }

  async function createAndAdd() {
    const name = newName.trim();
    if (!name) return;
    const id = await createList(name);
    if (!id) {
      setNote('Could not create that list.');
      return;
    }
    await add(id, name);
    setNewName('');
  }

  return (
    <View style={styles.block}>
      {/*
        `tap`, not `hitSlop` alone. This is a line of `text.s12` and it measured **47x16**
        against the 24-point floor of WCAG 2.5.8 — the same defect §6.60 fixed for "Caught
        up further?", "Remove" and "Use a different poster", missed here because the
        control only exists when there is an account and no suite has ever arranged one.

        `hitSlop` stays on top of it: it is real on a device and invisible to layout, so it
        cannot be the thing that makes a target measurable. `theme.ts` says so where `tap`
        is defined.
      */}
      <Pressable
        onPress={() => setOpen(!open)}
        hitSlop={8}
        style={tap}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.toggle}>{open ? 'Cancel' : 'Add to list'}</Text>
      </Pressable>

      {open && (
        <View style={styles.panel}>
          {lists === undefined && <Note level="footnote">Loading…</Note>}
          {lists?.length === 0 && (
            <Note level="footnote">No lists yet — make one below.</Note>
          )}

          {lists?.map((list) => (
            <Pressable
              key={list.id}
              onPress={() => add(list.id, list.name)}
              style={styles.listRow}
              accessibilityRole="button"
              accessibilityLabel={`Add to ${list.name}`}
            >
              <Text numberOfLines={1} style={styles.listName}>
                {list.name}
              </Text>
            </Pressable>
          ))}

          <View style={styles.newRow}>
            <Field
              size="row"
              label={COPY.fields.listName}
              value={newName}
              onChange={setNewName}
              placeholder={COPY.fields.newListPlaceholder}
              maxLength={120}
              onSubmitEditing={createAndAdd}
              style={styles.grow}
            />
            <Button
              onPress={createAndAdd}
              disabled={!newName.trim()}
              tone="primary"
              size="inline"
              label="Add"
              name="Make this list and add the title to it"
            />
          </View>
        </View>
      )}

      {note && <Note level="footnote">{note}</Note>}
    </View>
  );
}

const styles = StyleSheet.create({
  /** A field that shares its row with a button. Layout, which the call site owns. */
  grow: { flex: 1, minWidth: 0 },
  block: { marginTop: 8, gap: 6 },
  toggle: { color: theme.inkSecondary, fontSize: text.s12, textDecorationLine: 'underline', fontFamily: type.family.title.name },
  panel: {
    padding: 12,
    borderRadius: radius.plate,
    backgroundColor: theme.groundWell,
    gap: 6,
  },
  listRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.plate,
    backgroundColor: theme.groundRaised,
  },
  listName: { color: theme.ink, fontSize: text.s14, fontFamily: type.family.title.name },
  newRow: { flexDirection: 'row', gap: 6, alignItems: 'stretch' },
});
