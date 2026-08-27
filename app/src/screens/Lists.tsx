import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { syncConfigured } from '@reviewies/core/sync/auth';
import { useSync } from '../sync/useSync';
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
import { COPY } from '@reviewies/core/copy';

/**
 * Lists, mixing film and television freely — the thing r/Simkl called a "severe
 * unmet need" and that neither Letterboxd nor Simkl can do comfortably.
 */
export function Lists() {
  const [lists, setLists] = useState<ListSummary[]>();
  const [name, setName] = useState('');
  const [openId, setOpenId] = useState<string>();
  const [failed, setFailed] = useState<string>();
  const [createFailed, setCreateFailed] = useState(false);

  const { session } = useSync();

  const load = useCallback(async () => {
    const result = await fetchLists();
    setLists(result.lists);
    setFailed(result.failed);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (!syncConfigured()) {
    return (
      <div className="p-6">
        <h1 className="mb-2 text-2xl font-semibold">Lists</h1>
        <p className="text-muted">{COPY.lists.needsAccount}</p>
      </div>
    );
  }

  /**
   * Signed out, on a build that has sync.
   *
   * This screen used to gate on the build alone, so somebody signed out met "No lists
   * yet. Make one above" over a Create box whose button did nothing at all — `createList`
   * returns undefined without a session. People has had both gates since it shipped.
   */
  if (!session) {
    return (
      <div className="p-6">
        <h1 className="mb-2 text-2xl font-semibold">Lists</h1>
        <p className="text-muted">{COPY.lists.signInToMake('Your data')}</p>
      </div>
    );
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreateFailed(false);
    const id = await createList(name);
    // A create that did not happen used to clear the box and reload an unchanged list,
    // which reads as an app that forgot rather than a write that failed.
    if (!id) {
      setCreateFailed(true);
      return;
    }
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
          className="min-w-0 flex-1 rounded-xl bg-surface px-3 py-3 outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          // `disabled:opacity-40` on an accent fill gave a maroon block with unreadable
          // dark red lettering — it read as broken rather than as waiting. Disabled
          // controls are exempt from the contrast rules, which is a reason they are
          // allowed to be quiet and not a reason to make them illegible.
          className="rounded-xl bg-accent px-4 font-medium text-ink disabled:bg-surface-2 disabled:text-muted"
        >
          Create
        </button>
      </form>

      {createFailed && (
        <p className="mb-3 px-1 text-accent" role="status">
          {COPY.lists.createFailed}
        </p>
      )}

      {lists === undefined && <p className="px-1 text-muted">Loading…</p>}
      {/* "No lists yet" was shown for both having none and failing to ask, which is a
          strange thing to tell somebody about work they did. */}
      {failed && (
        <p className="px-1 text-accent" role="status">
          Could not load your lists ({failed}). They are still there — try again.
        </p>
      )}
      {!failed && lists?.length === 0 && <p className="px-1 text-muted">{COPY.lists.empty}</p>}

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
  const [itemsFailed, setItemsFailed] = useState<string>();
  const [changeFailed, setChangeFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    // `failed` was dropped here, so a list whose items could not be fetched rendered as
    // "Nothing on this list yet" — the screen telling somebody their own work is gone
    // because a request came back empty-handed. §6.57.
    void fetchListItems(list.id).then((r) => {
      setItems(r.items);
      setItemsFailed(r.failed);
    });
  }, [open, list.id]);

  return (
    <li className="rounded-2xl bg-surface p-3">
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${open ? 'Collapse' : 'Expand'} ${list.name}`}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
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
                setChangeFailed(false);
                const result = await setListVisibility(list.id, !list.isPublic);
                if (!result.ok) {
                  setChangeFailed(true);
                  return;
                }
                onChanged();
              }}
              aria-label={`Make ${list.name} ${list.isPublic ? 'private' : 'public'}`}
              className="mb-2 text-xs text-accent"
            >
              {list.isPublic ? 'Make private' : 'Publish'}
            </button>
          )}

          {changeFailed && (
            <p className="mb-2 text-sm text-accent" role="status">
              {COPY.lists.changeFailed}
            </p>
          )}
          {itemsFailed && (
            <p className="text-sm text-accent" role="status">
              {COPY.lists.itemsFailed}
            </p>
          )}
          {!itemsFailed && items?.length === 0 && (
            <p className="text-sm text-muted">{COPY.lists.listEmpty}</p>
          )}

          <ul className="flex flex-col gap-1">
            {items?.map((item) => (
              <li key={item.titleId} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2">
                <Link
                  to={`/title/${encodeURIComponent(item.titleId)}`}
                  className="min-w-0 flex-1 truncate text-sm"
                >
                  {item.titleId}
                </Link>
                <span className="shrink-0 text-[0.625rem] text-muted uppercase">
                  {item.kind === 'show' ? 'Series' : 'Film'}
                </span>
                {list.mine && (
                  <button
                    onClick={async () => {
                      setChangeFailed(false);
                      // The row used to disappear whether or not the server agreed, and
                      // come back on the next load.
                      const result = await removeFromList(list.id, item.titleId);
                      if (!result.ok) {
                        setChangeFailed(true);
                        return;
                      }
                      const reloaded = await fetchListItems(list.id);
                      setItems(reloaded.items);
                      setItemsFailed(reloaded.failed);
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
