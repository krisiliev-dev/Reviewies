import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
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
import { radius, theme } from '../src/ui/theme';
import { COPY } from '@reviewies/core/copy';

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
          <Text style={styles.blurb}>
            {syncConfigured()
              ? COPY.people.signInToFollow('Account')
              : COPY.people.withoutAccount}
          </Text>
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

        <View style={styles.card}>
          <Text style={styles.cardHeading}>You</Text>
          {handle === undefined ? (
            <>
              <Text style={styles.blurb}>{me ? `@${me.handle}` : 'Loading…'}</Text>
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
              <TextInput
                value={handle}
                onChangeText={setHandle}
                placeholder="Handle"
                placeholderTextColor={theme.muted}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
              <View style={styles.row}>
                <Pressable
                  onPress={saveHandle}
                  style={styles.primary}
                  accessibilityRole="button"
                  accessibilityLabel="Save your handle"
                >
                  <Text style={styles.primaryText}>Save</Text>
                </Pressable>
                <Pressable
                  onPress={() => setHandle(undefined)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel changing your handle"
                >
                  <Text style={styles.link}>Cancel</Text>
                </Pressable>
              </View>
            </>
          )}
          {note && <Text style={styles.error}>{note}</Text>}
        </View>

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
      <Text style={styles.sectionHeading}>Find people</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Handle or name"
        placeholderTextColor={theme.muted}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
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
        <Text style={styles.blurb}>Nobody by that name.</Text>
      )}

      {results.map((person) => {
        const already = following.some((f) => f.id === person.id);
        const isBlocked = blocked.some((b) => b.id === person.id);
        return (
          <View key={person.id} style={styles.person}>
            <PersonName person={person} />
            <Pressable
              onPress={async () => {
                setActionFailed(false);
                const result = already ? await unfollow(person.id) : await follow(person.id);
                if (!result.ok) {
                  setActionFailed(true);
                  return;
                }
                onChanged();
              }}
              disabled={isBlocked}
              style={[styles.small, already ? styles.smallMuted : styles.smallOn, isBlocked && styles.disabled]}
              accessibilityRole="button"
              accessibilityState={{ disabled: isBlocked, selected: already }}
              // A search result is a row of identical words. Which person "Follow"
              // belongs to is only visible, never spoken.
              accessibilityLabel={`${already ? 'Unfollow' : 'Follow'} @${person.handle}`}
            >
              <Text style={already ? styles.smallMutedText : styles.smallOnText}>
                {already ? 'Following' : 'Follow'}
              </Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                setActionFailed(false);
                const blockResult = await blockPerson(person.id);
                if (!blockResult.ok) {
                  setActionFailed(true);
                  return;
                }
                onChanged();
              }}
              style={[styles.small, styles.smallMuted]}
              accessibilityRole="button"
              accessibilityLabel={`Block @${person.handle}`}
            >
              <Text style={styles.smallMutedText}>Block</Text>
            </Pressable>
          </View>
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
      <Text style={styles.sectionHeading}>
        {heading}
        {people.length > 0 ? ` ${people.length}` : ''}
      </Text>
      {people.length === 0 && empty ? <Text style={styles.blurb}>{empty}</Text> : null}
      {failed && (
        <Text style={styles.failed} accessibilityLiveRegion="polite">
          {COPY.people.followFailed}
        </Text>
      )}
      {people.map((person) => {
        const act = action(person);
        return (
          <View key={person.id} style={styles.person}>
            <PersonName person={person} />
            {act && (
              <Pressable
                onPress={async () => {
                  setFailed(false);
                  const result = await act.run();
                  if (!result.ok) {
                    setFailed(true);
                    return;
                  }
                  onChanged();
                }}
                style={[styles.small, styles.smallMuted]}
                accessibilityRole="button"
                accessibilityLabel={`${act.label} @${person.handle}`}
              >
                <Text style={styles.smallMutedText}>{act.label}</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

function PersonName({ person }: { person: Person }) {
  return (
    <View style={styles.personBody}>
      <Text numberOfLines={1} style={styles.personName}>
        {person.displayName ?? `@${person.handle}`}
      </Text>
      {person.displayName && <Text style={styles.personHandle}>@{person.handle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  searchFailed: { color: theme.accent, fontSize: 14, lineHeight: 20 },
  content: { padding: 16, gap: 20, backgroundColor: theme.ink, flexGrow: 1, paddingBottom: 48 },
  centre: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: theme.ink },
  blurb: { color: theme.muted, fontSize: 14, lineHeight: 20 },
  failed: { color: theme.accent, fontSize: 13, lineHeight: 19 },
  link: { color: theme.muted, fontSize: 13, textDecorationLine: 'underline' },
  error: { color: theme.accent, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  card: { backgroundColor: theme.surface, borderRadius: radius.xl, padding: 16, gap: 12 },
  cardHeading: { color: theme.text, fontSize: 16, fontWeight: '700' },
  section: { gap: 8 },
  sectionHeading: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: theme.surface2,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: theme.text,
    fontSize: 15,
  },
  primary: {
    backgroundColor: theme.accent,
    borderRadius: radius.md,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  primaryText: { color: theme.ink, fontWeight: '700', fontSize: 14 },

  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.surface,
    borderRadius: radius.lg,
    padding: 12,
  },
  personBody: { flex: 1, minWidth: 0 },
  personName: { color: theme.text, fontSize: 14 },
  personHandle: { color: theme.muted, fontSize: 11 },
  small: { borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  smallOn: { backgroundColor: theme.accent },
  smallOnText: { color: theme.ink, fontSize: 12, fontWeight: '600' },
  smallMuted: { backgroundColor: theme.surface2 },
  smallMutedText: { color: theme.muted, fontSize: 12 },
  disabled: { opacity: 0.4 },
});
