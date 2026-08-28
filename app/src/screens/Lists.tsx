import { useCallback, useEffect, useState } from 'react';
import { syncConfigured } from '@reviewies/core/sync/auth';
import { db } from '../data/db';
import { Row as BaseRow } from '../ui/Row';
import { Button } from '../ui/Button';
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
        <h1 className="mb-2 text-s24 font-display font-semibold">Lists</h1>
        <p className="text-ink-secondary">{COPY.lists.needsAccount}</p>
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
        <h1 className="mb-2 text-s24 font-display font-semibold">Lists</h1>
        <p className="text-ink-secondary">{COPY.lists.signInToMake('Your data')}</p>
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
      <h1 className="mb-1 px-1 text-s24 font-display font-semibold">Lists</h1>
      <p className="mb-4 px-1 text-sm text-ink-secondary">Films and series together, in one list.</p>

      <form onSubmit={create} className="mb-5 flex gap-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New list name"
          maxLength={120}
          className="min-w-0 flex-1 rounded-none bg-ground-raised px-3 py-3 outline-none placeholder:text-ink-secondary"
        />
        {/* The disabled treatment used to be spelled here, with the reason beside it:
            `disabled:opacity-40` on an accent fill gave a maroon block with unreadable
            dark red lettering, which read as broken rather than as waiting. The component
            owns that now and `button.test.ts` holds it to it. */}
        <Button submit tone="primary" label="Create" name="Create this list" disabled={!name.trim()} />
      </form>

      {createFailed && (
        <p className="mb-3 px-1 text-trouble" role="status">
          {COPY.lists.createFailed}
        </p>
      )}

      {lists === undefined && <p className="px-1 text-ink-secondary">Loading…</p>}
      {/* "No lists yet" was shown for both having none and failing to ask, which is a
          strange thing to tell somebody about work they did. */}
      {failed && (
        <p className="px-1 text-trouble" role="status">
          Could not load your lists ({failed}). They are still there — try again.
        </p>
      )}
      {!failed && lists?.length === 0 && <p className="px-1 text-ink-secondary">{COPY.lists.empty}</p>}

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
  // Widened with the name, because the web showed the raw `titleId` — a machine string
  // on the one screen whose entire content is titles somebody chose by hand. The phone
  // has resolved it against the local titles table since it was written; this is the
  // parity gap the migration walked past before noticing it.
  const [items, setItems] = useState<Array<ListItem & { name?: string }>>();
  const [itemsFailed, setItemsFailed] = useState<string>();
  const [changeFailed, setChangeFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    // `failed` was dropped here, so a list whose items could not be fetched rendered as
    // "Nothing on this list yet" — the screen telling somebody their own work is gone
    // because a request came back empty-handed. §6.57.
    void fetchListItems(list.id).then(async (r) => {
      setItemsFailed(r.failed);
      setItems(
        await Promise.all(
          r.items.map(async (item) => ({
            ...item,
            name: (await db.titles.get(item.titleId))?.name,
          })),
        ),
      );
    });
  }, [open, list.id]);

  return (
    <li className="rounded-plate bg-ground-raised p-3">
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${open ? 'Collapse' : 'Expand'} ${list.name}`}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">{list.name}</span>
          <span className="text-xs text-ink-secondary">
            {items ? describeMix(items) : `${list.itemCount} items`}
            {list.isPublic ? ' · public' : ' · private'}
            {!list.mine && ' · shared with you'}
          </span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-ink-secondary">
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
              className="mb-2 text-xs text-trouble"
            >
              {list.isPublic ? 'Make private' : 'Publish'}
            </button>
          )}

          {changeFailed && (
            <p className="mb-2 text-sm text-trouble" role="status">
              {COPY.lists.changeFailed}
            </p>
          )}
          {itemsFailed && (
            <p className="text-sm text-trouble" role="status">
              {COPY.lists.itemsFailed}
            </p>
          )}
          {!itemsFailed && items?.length === 0 && (
            <p className="text-sm text-ink-secondary">{COPY.lists.listEmpty}</p>
          )}

          <ul className="flex flex-col">
            {items?.map((item) => (
              <BaseRow
                key={item.titleId}
                title={item.name ?? item.titleId}
                // No poster on a list item, so the shorter of the two heights.
                density="index"
                tag={item.kind === 'show' ? 'SERIES' : 'FILM'}
                open={{
                  // The list's name, because a screen that has three lists open at once
                  // otherwise announces the same title three times with nothing to tell
                  // the copies apart — which is the collision §6.96 measures.
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
                    />
                  ) : undefined
                }
              />
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
