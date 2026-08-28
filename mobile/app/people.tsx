import { Block } from '../src/ui/Block';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import { getSession, onAuthChange, syncConfigured } from '@reviewies/core/sync/auth';
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
import { leadingOf, theme } from '../src/ui/theme';
import { SCREEN } from '@reviewies/core/ui/screen';
import { text, type, leading } from '@reviewies/core/tokens';
import { COPY } from '@reviewies/core/copy';
import { Button } from '../src/ui/Button';
import { Row as BaseRow } from '../src/ui/Row';
import { Section } from '../src/ui/Section';
import { Note } from '../src/ui/Note';
import { Field } from '../src/ui/Field';

/**
 * Your handle, who you follow, and who you have blocked.
 *
 * Two consequences of the row-level security policies are visible here and are worth
 * stating rather than leaving to be discovered:
 *
 *  - `follows_select` only exposes rows you are part of, so a public follower count is
 *    not queryable and none is shown. That is a privacy property, not an omission —
 *    and doc 8 found a documented ring of fake accounts inflating exactly that number
 *    on a competitor.
 *  - Blocking is symmetric, so it also hides you from them.
 */
export default function PeopleScreen() {
  const [session, setSession] = useState<Session | null>();
  const [me, setMe] = useState<Person>();
  const [following, setFollowing] = useState<Person[]>([]);
  const [followers, setFollowers] = useState<Person[]>([]);
  const [blocked, setBlocked] = useState<Person[]>([]);
  const [handle, setHandle] = useState<string>();
  const [note, setNote] = useState<string>();

  useEffect(() => {
    void getSession().then(setSession);
    return onAuthChange(setSession);
  }, []);

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

  if (!syncConfigured() || !session) {
    return (
      <>
        <Stack.Screen options={{ title: 'People' }} />
        <View style={styles.centre}>
          <Note>
            {syncConfigured()
              ? COPY.people.signInToFollow('Account')
              : COPY.people.withoutAccount}
          </Note>
        </View>
      </>
    );
  }

  async function saveHandle() {
    if (handle === undefined) return;
    const result = await updateProfile({ handle });
    setNote(result.ok ? undefined : result.reason);
    if (result.ok) {
      setHandle(undefined);
      await load();
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'People' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {listsFailed && (
          <Text style={styles.failed} accessibilityLiveRegion="polite">
            {COPY.people.listFailed}
          </Text>
        )}

        <Block heading="You">
          {handle === undefined ? (
            <>
              <Note>{me ? `@${me.handle}` : 'Loading…'}</Note>
              <Pressable
                onPress={() => setHandle(me?.handle ?? '')}
                disabled={!me}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityState={{ disabled: !me }}
              >
                <Text style={styles.link}>Change your handle</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Field
            label={COPY.fields.handle}
            value={handle}
            onChange={setHandle}
            placeholder="Handle"
            autoCapitalize="none"
            autoCorrect={false}
          />
              <View style={styles.row}>
                <Button onPress={saveHandle} tone="primary" label="Save" name="Save your handle" />
                <Button
                  onPress={() => setHandle(undefined)}
                  tone="quiet"
                  size="inline"
                  label="Cancel"
                  name="Cancel changing your handle"
                />
              </View>
            </>
          )}
          {note && <Text style={styles.error}>{note}</Text>}
        </Block>

        <FindPeople following={following} blocked={blocked} onChanged={load} />

        <PersonList
          heading="Following"
          people={following}
          empty="Nobody yet. Search above to find someone."
          action={(p) => ({ label: 'Unfollow', run: () => unfollow(p.id) })}
          onChanged={load}
        />
        {/* Only ever visible to you; see the note at the top of this file. */}
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
      </ScrollView>
    </>
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
    // Debounced, like title search: a request per keystroke against a shared database
    // is rude to everyone else using it.
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
    <View style={styles.section}>
      <Section>Find people</Section>
      <Field
          label={COPY.fields.findPeople}
          value={query}
          onChange={setQuery}
          placeholder="Handle or name"
          autoCapitalize="none"
          autoCorrect={false}
        />
      {/* See the web's copy: "Nobody by that name" was said for both no match and no
          answer, and somebody would conclude a friend is not here and stop looking. */}
      {actionFailed && (
        <Text style={styles.searchFailed} accessibilityLiveRegion="polite">
          {COPY.people.followFailed}
        </Text>
      )}
      {searchFailed && (
        <Text style={styles.searchFailed} accessibilityLiveRegion="polite">
          Could not search right now ({searchFailed}). This says nothing about whether they
          are here.
        </Text>
      )}
      {!searchFailed && searched && results.length === 0 && (
        <Note>Nobody by that name.</Note>
      )}

      {results.map((person) => {
        const already = following.some((f) => f.id === person.id);
        const isBlocked = blocked.some((b) => b.id === person.id);
        return (
          <BaseRow
            key={person.id}
            title={person.displayName ?? `@${person.handle}`}
            meta={person.displayName ? `@${person.handle}` : undefined}
            // No poster and nowhere to go: this product has no profile screen, so a
            // person row is words and its actions. `open` is left off rather than given
            // a no-op, which the contract makes a compile error.
            density="index"
            trailing={
              <Button
                size="inline"
                tone={already ? 'secondary' : 'primary'}
                label={already ? 'Following' : 'Follow'}
                // A search result is a row of identical words. Which person "Follow"
                // belongs to is only visible, never spoken.
                name={`${already ? 'Unfollow' : 'Follow'} @${person.handle}`}
                // Was `styles.disabled`, an opacity, which the component bans and says
                // why: a faded control reads as broken rather than as unavailable.
                disabled={isBlocked}
                onPress={async () => {
                  setActionFailed(false);
                  const result = already ? await unfollow(person.id) : await follow(person.id);
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
                name={`Block @${person.handle}`}
                onPress={async () => {
                  setActionFailed(false);
                  const blockResult = await blockPerson(person.id);
                  if (!blockResult.ok) {
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
    </View>
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
    <View style={styles.section}>
      <Section>
        {heading}
        {people.length > 0 ? ` ${people.length}` : ''}
      </Section>
      {people.length === 0 && empty ? <Note>{empty}</Note> : null}
      {failed && (
        <Text style={styles.failed} accessibilityLiveRegion="polite">
          {COPY.people.followFailed}
        </Text>
      )}
      {people.map((person) => {
        const act = action(person);
        return (
          <BaseRow
            key={person.id}
            title={person.displayName ?? `@${person.handle}`}
            meta={person.displayName ? `@${person.handle}` : undefined}
            density="index"
            trailing={
              act ? (
                <Button
                  size="inline"
                  tone="secondary"
                  label={act.label}
                  name={`${act.label} @${person.handle}`}
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
    </View>
  );
}

/*
 * `PersonName` was here, and is not: it was the row's words and the row owns those now —
 * the display name as the title, the handle as the meta line, which is what it did by
 * hand in two places. Left behind, it would be a second way to spell a person's name.
 */

const styles = StyleSheet.create({
  searchFailed: { color: theme.trouble, fontSize: text.s14, lineHeight: leadingOf(text.s14, leading.l143), fontFamily: type.family.body.name },
  content: { padding: SCREEN.edge, gap: 20, backgroundColor: theme.ground, flexGrow: 1, paddingBottom: 48 },
  /*
   * Top-aligned, and `SCREEN.edge` rather than a fourth screen edge of its own. This
   * used to be `flex: 1, padding: 24, justifyContent: 'center'` — a message floating at
   * 55% of an otherwise blank screen under a title pinned to the top. See `EMPTY_ALIGN`.
   */
  centre: { flex: 1, padding: SCREEN.edge, backgroundColor: theme.ground },
  failed: { color: theme.trouble, fontSize: text.s14, lineHeight: leadingOf(text.s14, leading.l143), fontFamily: type.family.body.name },
  link: { color: theme.inkSecondary, fontSize: text.s14, textDecorationLine: 'underline', fontFamily: type.family.title.name },
  error: { color: theme.trouble, fontSize: text.s14, fontFamily: type.family.body.name },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  section: { gap: 8 },

});
