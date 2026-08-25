import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { syncConfigured } from '@reviewies/core/sync/auth';
import { addToList, createList, fetchLists, type ListSummary } from '@reviewies/core/social/lists';
import type { MediaKind } from '@reviewies/core/domain/types';
import { radius, theme } from '../ui/theme';

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
      <Pressable
        onPress={() => setOpen(!open)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.toggle}>{open ? 'Cancel' : 'Add to list'}</Text>
      </Pressable>

      {open && (
        <View style={styles.panel}>
          {lists === undefined && <Text style={styles.muted}>Loading…</Text>}
          {lists?.length === 0 && (
            <Text style={styles.muted}>No lists yet — make one below.</Text>
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
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="New list…"
              placeholderTextColor={theme.muted}
              maxLength={120}
              style={styles.input}
              onSubmitEditing={createAndAdd}
              accessibilityLabel="Name for a new list"
            />
            <Pressable
              onPress={createAndAdd}
              disabled={!newName.trim()}
              style={[styles.add, !newName.trim() && styles.disabled]}
              accessibilityRole="button"
              accessibilityLabel="Make this list and add the title to it"
              accessibilityState={{ disabled: !newName.trim() }}
            >
              <Text style={styles.addText}>Add</Text>
            </Pressable>
          </View>
        </View>
      )}

      {note && <Text style={styles.note}>{note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 8, gap: 6 },
  toggle: { color: theme.muted, fontSize: 12, textDecorationLine: 'underline' },
  panel: {
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: theme.surface2,
    gap: 6,
  },
  muted: { color: theme.muted, fontSize: 12 },
  listRow: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: theme.surface,
  },
  listName: { color: theme.text, fontSize: 14 },
  newRow: { flexDirection: 'row', gap: 6, alignItems: 'stretch' },
  input: {
    flex: 1,
    minWidth: 0,
    color: theme.text,
    fontSize: 14,
    backgroundColor: theme.surface,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  add: {
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    backgroundColor: theme.accent,
  },
  addText: { color: theme.ink, fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  note: { color: theme.muted, fontSize: 12 },
});
