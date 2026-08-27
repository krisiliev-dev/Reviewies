import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { COPY } from '@reviewies/core/copy';
import { db } from '../data/db';
import { removeFromWatchlist, setWatchlistNote } from '@reviewies/core/data/repo';
import { Poster } from '../ui/Poster';
import { Row as BaseRow } from '../ui/Row';
import { Button } from '../ui/Button';

/**
 * Uncapped, deliberately. Trakt limiting free watchlists and doubling its price is
 * one of the things that pushed people to look for alternatives in the first place.
 */
export function Watchlist() {
  const items = useLiveQuery(
    async () => {
      const list = await db.watchlist.orderBy('addedAt').reverse().toArray();
      const titles = new Map((await db.titles.toArray()).map((t) => [t.id, t]));
      return list.map((item) => ({ item, title: titles.get(item.titleId) }));
    },
    [],
    undefined,
  );

  if (items === undefined) return <p className="p-6 text-ink-secondary">Loading…</p>;

  if (items.length === 0) {
    return (
      <div className="p-6">
        <h1 className="mb-2 text-2xl font-semibold">Watchlist</h1>
        <p className="text-ink-secondary">{COPY.watchlist.empty}</p>
        <Button
          to="/search"
          tone="primary"
          size="page"
          label="Find something"
          name="Find something"
          className="mt-5"
        />
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="mb-4 px-1 text-2xl font-semibold">Watchlist</h1>
      <ul className="flex flex-col gap-2">
        {items.map(({ item, title }) => (
          <Row
            key={item.titleId}
            titleId={item.titleId}
            name={title?.name ?? item.titleId}
            posterUrl={title?.posterUrl}
            year={title?.year}
            note={item.note}
          />
        ))}
      </ul>
    </div>
  );
}

function Row({
  titleId,
  name,
  posterUrl,
  year,
  note,
}: {
  titleId: string;
  name: string;
  posterUrl?: string;
  year?: number;
  note?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note ?? '');

  async function save() {
    await setWatchlistNote(titleId, draft.trim());
    setEditing(false);
  }

  return (
    <BaseRow
      title={name}
      meta={year ? String(year) : undefined}
      open={{ name: `Open ${name}`, to: `/title/${encodeURIComponent(titleId)}` }}
      lead={<Poster url={posterUrl} name={name} className="h-16 w-11 shrink-0 rounded-plate" />}
      trailing={
        <button
          onClick={() => removeFromWatchlist(titleId)}
          className="shrink-0 px-2 py-1 text-xs text-ink-secondary"
          aria-label={`Remove ${name} from watchlist`}
        >
          Remove
        </button>
      }
      under={
        editing ? (
          <div className="flex gap-1.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={COPY.watchlist.notePlaceholder}
              className="min-w-0 flex-1 rounded-none border border-stroke-signal px-3 py-1.5 text-sm outline-none placeholder:text-ink-secondary"
              autoFocus
            />
            <button
              onClick={save}
              aria-label={`Save note for ${name}`}
              className="rounded-pill bg-action-fill px-3 text-sm font-medium text-action-label"
            >
              Save
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            // Every row says "Add a note…". Which row is a visual fact only.
            aria-label={note ? `Edit note for ${name}` : `Add a note for ${name}`}
            className="tap text-left text-sm text-ink-secondary italic"
          >
            {/* "The amount of things I have in my wishlist that i have ZERO memory for
                why they're there" — r/Letterboxd. */}
            {note || 'Add a note…'}
          </button>
        )
      }
    />
  );
}
