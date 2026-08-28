import { Block } from '../ui/Block';
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
import { Row as BaseRow } from '../ui/Row';
import { Button } from '../ui/Button';
import { Section } from '../ui/Section';
import { Note } from '../ui/Note';
import { Field } from '../ui/Field';
import { Masthead } from '../ui/Masthead';

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
      <div className="p-s16">
        <Masthead level="page" className="px-1">People</Masthead>
        <Note className="px-1">{COPY.people.withoutAccount}</Note>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-4">
        <Masthead level="page" className="px-1">People</Masthead>
        {/* The destination is the one word that differs by platform, and it has to be
            what the navigation calls it: "Your data" here, "Account" on the phone. */}
        <Note className="px-1">{COPY.people.signInToFollow('Your data')}</Note>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <Masthead level="page" className="px-1">People</Masthead>

      {listsFailed && (
        <p className="px-1 text-s14 text-trouble" role="status">
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
    <Block heading="You">

      {!editing ? (
        <>
          <Note>
            {me ? `@${me.handle}` : 'Loading…'}
            {me?.displayName ? ` · ${me.displayName}` : ''}
          </Note>
          <button
            onClick={() => {
              setHandle(me?.handle ?? '');
              setDisplayName(me?.displayName ?? '');
            }}
            disabled={!me}
            className="tap mt-2 text-s12 text-ink-secondary underline disabled:opacity-40"
          >
            Change how you appear
          </button>
        </>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          <Field
            label={COPY.fields.handle}
            value={handle}
            onChange={setHandle}
            placeholder="Handle"
            autoFocus
          />
          <Field
            label={COPY.fields.displayName}
            value={displayName ?? ''}
            onChange={setDisplayName}
            placeholder="Display name (optional)"
            maxLength={60}
          />
          <div className="flex gap-2">
            <Button tone="primary" label="Save" name="Save how you appear" onPress={save} />
            <Button
              onPress={() => {
                setHandle(undefined);
                setDisplayName(undefined);
                setNote(undefined);
              }}
              label="Cancel"
              name="Cancel changing how you appear"
            />
          </div>
        </div>
      )}

      {note && <Note className="mt-2">{note}</Note>}
    </Block>
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
      <Section className="px-1">Find people</Section>
      <Field
        label={COPY.fields.findPeople}
        value={query}
        onChange={setQuery}
        placeholder="Handle or name"
      />

      {/* "Nobody by that name" was said for both no match and no answer, and somebody
          would conclude a friend is not here and stop looking. */}
      {actionFailed && (
        <p className="px-1 text-s14 text-trouble" role="status">
          {COPY.people.followFailed}
        </p>
      )}
      {searchFailed && (
        <p className="px-1 text-s14 text-trouble" role="status">
          Could not search right now ({searchFailed}). This says nothing about whether
          they are here.
        </p>
      )}
      {!searchFailed && searched && results.length === 0 && (
        <Note className="px-1">Nobody by that name.</Note>
      )}

      <ul className="flex flex-col gap-1.5">
        {results.map((p) => {
          const already = following.some((f) => f.id === p.id);
          const isBlocked = blocked.some((b) => b.id === p.id);
          return (
            <BaseRow
              key={p.id}
              title={p.displayName ?? `@${p.handle}`}
              meta={p.displayName ? `@${p.handle}` : undefined}
              // No poster and nowhere to go: this product has no profile screen, so a
              // person row is words and its actions. `open` is left off rather than given
              // a no-op, which the contract makes a compile error.
              density="index"
              trailing={
                <Button
                  size="inline"
                  tone={already ? 'secondary' : 'primary'}
                  label={already ? 'Following' : 'Follow'}
                  name={`${already ? 'Unfollow' : 'Follow'} @${p.handle}`}
                  // Was `disabled:opacity-40`, which the component bans and says why: a
                  // faded control reads as broken rather than as unavailable.
                  disabled={isBlocked}
                  onPress={async () => {
                    setActionFailed(false);
                    const result = already ? await unfollow(p.id) : await follow(p.id);
                    if (!result.ok) {
                      setActionFailed(true);
                      return;
                    }
                    onChanged();
                  }}
                />
              }
              under={
                /* Underneath rather than beside Follow. Blocking somebody is the one
                   action on this screen you cannot take back with the same tap, and it
                   sat a thumb's width from the one people come here to press. */
                <Button
                  size="inline"
                  tone="destructive"
                  label="Block"
                  name={`Block @${p.handle}`}
                  onPress={async () => {
                    setActionFailed(false);
                    const result = await blockPerson(p.id);
                    if (!result.ok) {
                      setActionFailed(true);
                      return;
                    }
                    onChanged();
                  }}
                />
              }
            />
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
      <Section className="px-1">
        {heading}
        {people.length > 0 && <span className="ml-1.5 normal-case">{people.length}</span>}
      </Section>

      {people.length === 0 && empty && <Note className="px-1">{empty}</Note>}
      {failed && (
        <p className="px-1 text-s14 text-trouble" role="status">
          {COPY.people.followFailed}
        </p>
      )}

      <ul className="flex flex-col gap-1.5">
        {people.map((p) => {
          const act = action(p);
          return (
            <BaseRow
              key={p.id}
              title={p.displayName ?? `@${p.handle}`}
              meta={p.displayName ? `@${p.handle}` : undefined}
              density="index"
              trailing={
                act ? (
                  <Button
                    size="inline"
                    tone="secondary"
                    label={act.label}
                    name={`${act.label} @${p.handle}`}
                    onPress={async () => {
                      setFailed(false);
                      const result = await act.run();
                      if (!result.ok) {
                        setFailed(true);
                        return;
                      }
                      onChanged();
                    }}
                  />
                ) : undefined
              }
            />
          );
        })}
      </ul>
    </section>
  );
}

/*
 * `PersonName` was here, and is not: it was the row's words and the row owns those now —
 * the display name as the title, the handle as the meta line, which is what it did by
 * hand in two places. Left behind, it would be a second way to spell a person's name.
 */
