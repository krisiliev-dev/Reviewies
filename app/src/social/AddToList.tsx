import { useEffect, useState } from 'react';
import { syncConfigured } from '@reviewies/core/sync/auth';
import { addToList, createList, fetchLists, type ListSummary } from '@reviewies/core/social/lists';
import type { MediaKind } from '@reviewies/core/domain/types';

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
    void fetchLists().then((all) => setLists(all.filter((l) => l.mine)));
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
      setNote('Could not create that list.');
      return;
    }
    await add(id, newName.trim());
    setNewName('');
  }

  return (
    <div className="mt-2">
      <button onClick={() => setOpen(!open)} className="text-xs text-muted underline">
        {open ? 'Cancel' : 'Add to list'}
      </button>

      {open && (
        <div className="mt-2 rounded-xl bg-surface-2 p-2.5">
          {lists === undefined && <p className="text-xs text-muted">Loading…</p>}
          {lists?.length === 0 && (
            <p className="mb-2 text-xs text-muted">No lists yet — make one below.</p>
          )}

          <ul className="flex flex-col gap-1">
            {lists?.map((list) => (
              <li key={list.id}>
                <button
                  onClick={() => add(list.id, list.name)}
                  className="w-full truncate rounded-lg bg-surface px-2.5 py-1.5 text-left text-sm"
                >
                  {list.name}
                </button>
              </li>
            ))}
          </ul>

          <form onSubmit={createAndAdd} className="mt-2 flex gap-1.5">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New list…"
              maxLength={120}
              className="min-w-0 flex-1 rounded-lg bg-surface px-2.5 py-1.5 text-sm outline-none placeholder:text-muted"
            />
            <button
              type="submit"
              disabled={!newName.trim()}
              className="rounded-lg bg-accent px-3 text-sm font-medium text-ink disabled:opacity-40"
            >
              Add
            </button>
          </form>
        </div>
      )}

      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}
