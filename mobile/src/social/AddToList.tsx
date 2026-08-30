import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { syncConfigured } from '@reviewies/core/sync/auth';
import { addToList, createList, fetchLists, type ListSummary } from '@reviewies/core/social/lists';
import type { MediaKind } from '@reviewies/core/domain/types';
import { REACH, radius, theme, tap } from '../ui/theme';
import { Button } from '../ui/Button';
import { LABEL_LINES } from '@reviewies/core/ui/button';
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
      setNote(COPY.lists.createFailed);
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
        hitSlop={REACH.inline}
        style={tap}
        accessibilityRole="button"
        aria-expanded={open}
      >
        <Text style={styles.toggle}>{open ? 'Cancel' : COPY.controls.addToList}</Text>
      </Pressable>

      {open && (
        <View style={styles.panel}>
          {lists === undefined && <Note level="footnote">{COPY.waiting.loading}</Note>}
          {lists?.length === 0 && (
            <Note level="footnote">{COPY.lists.emptyInPicker}</Note>
          )}

          {/* `Button`, `size="inline"`, the same as the web's twin. Both were hand-drawn
              plates in the raised fill — which §6.122 established is the *card* fill, so
              each one pressed to the colour it was already painted and nothing happened.
              §6.131. */}
          {lists?.map((list) => (
            /* One line, the same as the web's twin — this is a name somebody typed and
               `Field` lets it run to a hundred and twenty characters. Unclamped it wrapped
               and the pill grew to fit, which is a picker whose rows are different heights
               for a reason nobody chose. §6.180. */
            <Button
              key={list.id}
              size="inline"
              onPress={() => add(list.id, list.name)}
              label={list.name}
              name={`Add to ${list.name}`}
              lines={LABEL_LINES}
            />
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
              name={COPY.controls.makeListAndAdd}
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
  newRow: { flexDirection: 'row', gap: 6, alignItems: 'stretch' },
});
