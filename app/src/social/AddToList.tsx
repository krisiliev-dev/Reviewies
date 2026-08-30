import { useEffect, useState } from 'react';
import { syncConfigured } from '@reviewies/core/sync/auth';
import { addToList, createList, fetchLists, type ListSummary } from '@reviewies/core/social/lists';
import type { MediaKind } from '@reviewies/core/domain/types';
import { Button } from '../ui/Button';
import { Note } from '../ui/Note';
import { Field } from '../ui/Field';
import { COPY } from '@reviewies/core/copy';

/**
 * Add a title to a list from wherever you happen to be looking at it.
 *
 * Lists shipped before this did, which meant they could be created but never filled —
 * the sort of gap that makes a feature look finished while being useless.
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

  async function createAndAdd(e: React.FormEvent) {
    e.preventDefault();
    const id = await createList(newName);
    if (!id) {
      setNote(COPY.lists.createFailed);
      return;
    }
    await add(id, newName.trim());
    setNewName('');
  }

  return (
    <div className="mt-2">
      {/* `Button`, `size="inline"`. The comment below was right about the idiom and the
          screen drew it by hand anyway — the same pill `Button` has drawn since sprint 7.
          A pill, like every other secondary action on a row. It was an underlined text
          link sitting among pills, which is a third control idiom on a screen that
          already has two — §6.61 counted them rather than felt them. The rule the app
          follows now: filled accent for the one action a row exists for, a ghost pill
          for the others, and underlined text only for a rare aside that opens something
          else ("Use a different poster", "Catch up"). §6.131. */}
      <Button
        size="inline"
        onPress={() => setOpen(!open)}
        label={open ? 'Cancel' : COPY.controls.addToList}
        name={open ? 'Cancel adding to a list' : COPY.controls.addToList}
      />

      {open && (
        <div className="mt-2 rounded-plate border border-stroke-signal p-3">
          {lists === undefined && <Note level="footnote">{COPY.waiting.loading}</Note>}
          {lists?.length === 0 && (
            <Note level="footnote" className="mb-2">{COPY.lists.emptyInPicker}</Note>
          )}

          <ul className="flex flex-col gap-1">
            {lists?.map((list) => (
              <li key={list.id}>
                <Button
                  size="inline"
                  onPress={() => add(list.id, list.name)}
                  label={list.name}
                  name={`Add to ${list.name}`}
                  className="w-full truncate"
                />
              </li>
            ))}
          </ul>

          <form onSubmit={createAndAdd} className="mt-2 flex gap-1.5">
            <Field
              size="row"
              label={COPY.fields.listName}
              value={newName}
              onChange={setNewName}
              placeholder={COPY.fields.newListPlaceholder}
              maxLength={120}
              className="min-w-0 flex-1"
            />
            <Button
              submit
              tone="primary"
              label="Add"
              name={COPY.controls.makeListAndAdd}
              disabled={!newName.trim()}
            />
          </form>
        </div>
      )}

      {note && <Note level="footnote" className="mt-1">{note}</Note>}
    </div>
  );
}
