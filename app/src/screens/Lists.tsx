import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { syncConfigured } from '@reviewies/core/sync/auth';
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

/**
 * Lists, mixing film and television freely — the thing r/Simkl called a "severe
 * unmet need" and that neither Letterboxd nor Simkl can do comfortably.
 */
export function Lists() {
  const [lists, setLists] = useState<ListSummary[]>();
  const [name, setName] = useState('');
  const [openId, setOpenId] = useState<string>();

  const load = useCallback(async () => setLists(await fetchLists()), []);
  useEffect(() => {
    void load();
  }, [load]);

  if (!syncConfigured()) {
    return (
      <div className="p-6">
        <h1 className="mb-2 text-2xl font-semibold">Lists</h1>
        <p className="text-muted">Lists need an account. Sync is not configured on this build.</p>
      </div>
    );
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await createList(name);
    setName('');
    await load();
  }

  return (
    <div className="p-4">
      <h1 className="mb-1 px-1 text-2xl font-semibold">Lists</h1>
      <p className="mb-4 px-1 text-sm text-muted">Films and series together, in one list.</p>

      <form onSubmit={create} className="mb-5 flex gap-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New list name"
          maxLength={120}
          className="min-w-0 flex-1 rounded-xl bg-surface px-3 py-2.5 outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="rounded-xl bg-accent px-4 font-medium text-ink disabled:opacity-40"
        >
          Create
        </button>
      </form>

      {lists === undefined && <p className="px-1 text-muted">Loading…</p>}
      {lists?.length === 0 && <p className="px-1 text-muted">No lists yet.</p>}

      <ul className="flex flex-col gap-2">
        {lists?.map((list) => (
          <ListCard
            key={list.id}
            list={list}
            open={openId === list.id}
            onToggle={() => setOpenId(openId === list.id ? undefined : list.id)}
            onChanged={load}
          />
        ))}
      </ul>
    </div>
  );
}

function ListCard({
  list,
  open,
  onToggle,
  onChanged,
}: {
  list: ListSummary;
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<ListItem[]>();

  useEffect(() => {
    if (!open) return;
    void fetchListItems(list.id).then(setItems);
  }, [open, list.id]);

  return (
    <li className="rounded-2xl bg-surface p-3">
      <button onClick={onToggle} className="flex w-full items-start justify-between gap-3 text-left">
        <span className="min-w-0">
          <span className="block truncate font-medium">{list.name}</span>
          <span className="text-xs text-muted">
            {items ? describeMix(items) : `${list.itemCount} items`}
            {list.isPublic ? ' · public' : ' · private'}
            {!list.mine && ' · shared with you'}
          </span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-muted">
          {open ? '▴' : '▾'}
        </span>
      </button>

      {open && (
        <div className="mt-3">
          {list.mine && (
            <button
              onClick={async () => {
                await setListVisibility(list.id, !list.isPublic);
                onChanged();
              }}
              className="mb-2 text-xs text-accent"
            >
              {list.isPublic ? 'Make private' : 'Publish'}
            </button>
          )}

          {items?.length === 0 && <p className="text-sm text-muted">Nothing on this list yet.</p>}

          <ul className="flex flex-col gap-1">
            {items?.map((item) => (
              <li key={item.titleId} className="flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-2">
                <Link
                  to={`/title/${encodeURIComponent(item.titleId)}`}
                  className="min-w-0 flex-1 truncate text-sm"
                >
                  {item.titleId}
                </Link>
                <span className="shrink-0 text-[10px] text-muted uppercase">
                  {item.kind === 'show' ? 'Series' : 'Film'}
                </span>
                {list.mine && (
                  <button
                    onClick={async () => {
                      await removeFromList(list.id, item.titleId);
                      setItems(await fetchListItems(list.id));
                      onChanged();
                    }}
                    className="shrink-0 px-1 text-xs text-muted"
                    aria-label={`Remove from ${list.name}`}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
