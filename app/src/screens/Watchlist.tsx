import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../data/db';
import { removeFromWatchlist, setWatchlistNote } from '@reviewies/core/data/repo';
import { Poster } from '../ui/Poster';

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

  if (items === undefined) return <p className="p-6 text-muted">Loading…</p>;

  if (items.length === 0) {
    return (
      <div className="p-6">
        <h1 className="mb-2 text-2xl font-semibold">Watchlist</h1>
        <p className="text-muted">Nothing saved yet.</p>
        <Link
          to="/search"
          className="mt-5 inline-block rounded-full bg-accent px-5 py-2.5 font-medium text-ink"
        >
          Find something
        </Link>
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
    <li className="flex items-start gap-3 rounded-2xl bg-surface p-2.5">
      <Link
        to={`/title/${encodeURIComponent(titleId)}`}
        aria-label={`Open ${name}`}
        className="shrink-0"
      >
        <Poster url={posterUrl} name={name} className="h-24 w-16 rounded-lg" />
      </Link>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{name}</p>
        {year && <p className="text-xs text-muted">{year}</p>}

        {editing ? (
          <div className="mt-2 flex gap-1.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Why is this here?"
              className="min-w-0 flex-1 rounded-lg bg-surface-2 px-2.5 py-1.5 text-sm outline-none placeholder:text-muted"
              autoFocus
            />
            <button
              onClick={save}
              aria-label={`Save note for ${name}`}
              className="rounded-lg bg-accent px-3 text-sm font-medium text-ink"
            >
              Save
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            // Every row says "Add a note…". Which row is a visual fact only.
            aria-label={note ? `Edit note for ${name}` : `Add a note for ${name}`}
            className="mt-1.5 block text-left text-sm text-muted italic"
          >
            {/* "The amount of things I have in my wishlist that i have ZERO memory for
                why they're there" — r/Letterboxd. */}
            {note || 'Add a note…'}
          </button>
        )}
      </div>

      <button
        onClick={() => removeFromWatchlist(titleId)}
        className="shrink-0 px-2 py-1 text-xs text-muted"
        aria-label={`Remove ${name} from watchlist`}
      >
        Remove
      </button>
    </li>
  );
}
