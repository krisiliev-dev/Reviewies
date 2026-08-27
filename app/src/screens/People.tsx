import { useCallback, useEffect, useState } from 'react';
import { syncConfigured } from '@reviewies/core/sync/auth';
import { useSync } from '../sync/useSync';
import {
  blockPerson,
  fetchBlocked,
  fetchFollowers,
  fetchFollowing,
  fetchMyProfile,
  follow,
  searchPeople,
  unblockPerson,
  unfollow,
  updateProfile,
  type Person,
} from '@reviewies/core/social/people';
import { COPY } from '@reviewies/core/copy';

/**
 * Your profile, who you follow, and who you have blocked.
 *
 * Deliberately not a tab. The tab bar already carries eight destinations and
 * "simplicity" was the single loudest demand in the research; people-management is
 * something you do twice a year, not on every visit, so it lives one level down.
 */
export function People() {
  const { session } = useSync();
  const [me, setMe] = useState<Person>();
  const [following, setFollowing] = useState<Person[]>([]);
  const [followers, setFollowers] = useState<Person[]>([]);
  const [blocked, setBlocked] = useState<Person[]>([]);

  const [listsFailed, setListsFailed] = useState(false);

  const load = useCallback(async () => {
    const [profile, out, back, hidden] = await Promise.all([
      fetchMyProfile(),
      fetchFollowing(),
      fetchFollowers(),
      fetchBlocked(),
    ]);
    setMe(profile);
    setFollowing(out.people);
    setFollowers(back.people);
    setBlocked(hidden.people);
    // "Nobody yet" is a claim about somebody's own social graph. It may not be made
    // because a request failed. §6.59.
    setListsFailed(!!(out.failed || back.failed || hidden.failed));
  }, []);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  if (!syncConfigured()) {
    return (
      <div className="p-4">
        <h1 className="mb-3 px-1 text-2xl font-semibold">People</h1>
        <p className="px-1 text-sm text-ink-secondary">{COPY.people.withoutAccount}</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-4">
        <h1 className="mb-3 px-1 text-2xl font-semibold">People</h1>
        {/* The destination is the one word that differs by platform, and it has to be
            what the navigation calls it: "Your data" here, "Account" on the phone. */}
        <p className="px-1 text-sm text-ink-secondary">{COPY.people.signInToFollow('Your data')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <h1 className="px-1 text-2xl font-semibold">People</h1>

      {listsFailed && (
        <p className="px-1 text-sm text-trouble" role="status">
          {COPY.people.listFailed}
        </p>
      )}

      <ProfileEditor me={me} onSaved={load} />
      <FindPeople following={following} blocked={blocked} onChanged={load} />

      <PersonList
        heading="Following"
        people={following}
        empty="Nobody yet. Search above to find someone."
        action={(p) => ({ label: 'Unfollow', run: () => unfollow(p.id) })}
        onChanged={load}
      />

      {/* Only ever visible to you: the follow policy exposes edges you are part of and
          nothing else, which is also why no follower count appears anywhere. */}
      <PersonList
        heading="Followers"
        people={followers}
        empty="Nobody yet."
        action={(p) =>
          following.some((f) => f.id === p.id)
            ? undefined
            : { label: 'Follow back', run: () => follow(p.id) }
        }
        onChanged={load}
      />

      {blocked.length > 0 && (
        <PersonList
          heading="Blocked"
          people={blocked}
          empty=""
          action={(p) => ({ label: 'Unblock', run: () => unblockPerson(p.id) })}
          onChanged={load}
        />
      )}
    </div>
  );
}

function ProfileEditor({ me, onSaved }: { me?: Person; onSaved: () => void }) {
  const [handle, setHandle] = useState<string>();
  const [displayName, setDisplayName] = useState<string>();
  const [note, setNote] = useState<string>();

  const editing = handle !== undefined;

  async function save() {
    const result = await updateProfile({ handle, displayName });
    if (!result.ok) {
      setNote(result.reason);
      return;
    }
    setNote(undefined);
    setHandle(undefined);
    setDisplayName(undefined);
    onSaved();
  }

  return (
    <section className="rounded-plate bg-ground-raised p-4">
      <h2 className="mb-1 font-semibold">You</h2>

      {!editing ? (
        <>
          <p className="text-sm text-ink-secondary">
            {me ? `@${me.handle}` : 'Loading…'}
            {me?.displayName ? ` · ${me.displayName}` : ''}
          </p>
          <button
            onClick={() => {
              setHandle(me?.handle ?? '');
              setDisplayName(me?.displayName ?? '');
            }}
            disabled={!me}
            className="tap mt-2 text-xs text-ink-secondary underline disabled:opacity-40"
          >
            Change how you appear
          </button>
        </>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="Handle"
            className="rounded-none bg-ground-well px-3 py-3 outline-none placeholder:text-ink-secondary"
            autoFocus
          />
          <input
            value={displayName ?? ''}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Display name (optional)"
            maxLength={60}
            className="rounded-none border border-stroke-signal px-3 py-3 outline-none placeholder:text-ink-secondary"
          />
          <div className="flex gap-2">
            <button
              onClick={save}
              aria-label="Save how you appear"
              className="rounded-pill bg-action-fill px-4 py-2 font-medium text-action-label"
            >
              Save
            </button>
            <button
              onClick={() => {
                setHandle(undefined);
                setDisplayName(undefined);
                setNote(undefined);
              }}
              className="rounded-pill border border-stroke-signal px-4 py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {note && <p className="mt-2 text-sm text-ink-secondary">{note}</p>}
    </section>
  );
}

function FindPeople({
  following,
  blocked,
  onChanged,
}: {
  following: Person[];
  blocked: Person[];
  onChanged: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  const [searched, setSearched] = useState(false);
  const [searchFailed, setSearchFailed] = useState<string>();
  /** A follow, unfollow or block the server refused, rather than a button that shrugs. */
  const [actionFailed, setActionFailed] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    let cancelled = false;
    // Debounced, like title search: a request per keystroke against a shared
    // database is rude to everyone else using it.
    const timer = setTimeout(async () => {
      const found = await searchPeople(query);
      if (!cancelled) {
        setResults(found.people);
        setSearchFailed(found.failed);
        setSearched(true);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-sm font-semibold tracking-wide text-ink-secondary uppercase">Find people</h2>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Handle or name"
        className="w-full rounded-none bg-ground-raised px-4 py-3 outline-none placeholder:text-ink-secondary"
      />

      {/* "Nobody by that name" was said for both no match and no answer, and somebody
          would conclude a friend is not here and stop looking. */}
      {actionFailed && (
        <p className="px-1 text-sm text-trouble" role="status">
          {COPY.people.followFailed}
        </p>
      )}
      {searchFailed && (
        <p className="px-1 text-sm text-trouble" role="status">
          Could not search right now ({searchFailed}). This says nothing about whether
          they are here.
        </p>
      )}
      {!searchFailed && searched && results.length === 0 && (
        <p className="px-1 text-sm text-ink-secondary">Nobody by that name.</p>
      )}

      <ul className="flex flex-col gap-1.5">
        {results.map((p) => {
          const already = following.some((f) => f.id === p.id);
          const isBlocked = blocked.some((b) => b.id === p.id);
          return (
            <li key={p.id} className="flex items-center gap-2 rounded-plate bg-ground-raised px-3 py-3">
              <PersonName person={p} />
              <button
                onClick={async () => {
                  setActionFailed(false);
                  const result = already ? await unfollow(p.id) : await follow(p.id);
                  if (!result.ok) {
                    setActionFailed(true);
                    return;
                  }
                  onChanged();
                }}
                disabled={isBlocked}
                aria-label={`${already ? 'Unfollow' : 'Follow'} @${p.handle}`}
                className={`shrink-0 rounded-pill px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
                  already ? 'border border-stroke-signal text-ink-secondary' : 'bg-action-fill text-action-label'
                }`}
              >
                {already ? 'Following' : 'Follow'}
              </button>
              <button
                onClick={async () => {
                  setActionFailed(false);
                  const result = await blockPerson(p.id);
                  if (!result.ok) {
                    setActionFailed(true);
                    return;
                  }
                  onChanged();
                }}
                aria-label={`Block @${p.handle}`}
                className="shrink-0 rounded-pill border border-stroke-signal px-3 py-1.5 text-xs text-ink-secondary"
              >
                Block
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PersonList({
  heading,
  people,
  empty,
  action,
  onChanged,
}: {
  heading: string;
  people: Person[];
  empty: string;
  // A result, not `void`: three of the four follow-and-block writes used to return
  // nothing at all, so this list drew the new state whether or not the server had
  // agreed. §6.57.
  action: (p: Person) => { label: string; run: () => Promise<{ ok: boolean }> } | undefined;
  onChanged: () => void;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-sm font-semibold tracking-wide text-ink-secondary uppercase">
        {heading}
        {people.length > 0 && <span className="ml-1.5 normal-case">{people.length}</span>}
      </h2>

      {people.length === 0 && empty && <p className="px-1 text-sm text-ink-secondary">{empty}</p>}
      {failed && (
        <p className="px-1 text-sm text-trouble" role="status">
          {COPY.people.followFailed}
        </p>
      )}

      <ul className="flex flex-col gap-1.5">
        {people.map((p) => {
          const act = action(p);
          return (
            <li key={p.id} className="flex items-center gap-2 rounded-plate bg-ground-raised px-3 py-3">
              <PersonName person={p} />
              {act && (
                <button
                  onClick={async () => {
                    setFailed(false);
                    const result = await act.run();
                    if (!result.ok) {
                      setFailed(true);
                      return;
                    }
                    onChanged();
                  }}
                  aria-label={`${act.label} @${p.handle}`}
                  className="shrink-0 rounded-pill border border-stroke-signal px-3 py-1.5 text-xs text-ink-secondary"
                >
                  {act.label}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PersonName({ person }: { person: Person }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm">{person.displayName ?? `@${person.handle}`}</p>
      {person.displayName && <p className="truncate text-xs text-ink-secondary">@{person.handle}</p>}
    </div>
  );
}
