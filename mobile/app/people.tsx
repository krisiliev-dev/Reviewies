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

  const load = useCallback(async () => {
    const [profile, out, back, hidden] = await Promise.all([
      fetchMyProfile(),
      fetchFollowing(),
      fetchFollowers(),
      fetchBlocked(),
    ]);
    setMe(profile);
    setFollowing(out);
    setFollowers(back);
    setBlocked(hidden);
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
              ? 'Sign in on the Account screen to follow people. Your history stays on this device either way.'
              : 'Following needs sync configured. Everything else works without it.'}
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
              : { label: 'Follow back', run: () => void follow(p.id) }
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
        setResults(found);
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
      {searched && results.length === 0 && <Text style={styles.blurb}>Nobody by that name.</Text>}

      {results.map((person) => {
        const already = following.some((f) => f.id === person.id);
        const isBlocked = blocked.some((b) => b.id === person.id);
        return (
          <View key={person.id} style={styles.person}>
            <PersonName person={person} />
            <Pressable
              onPress={async () => {
                if (already) await unfollow(person.id);
                else await follow(person.id);
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
                await blockPerson(person.id);
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
  action: (p: Person) => { label: string; run: () => void | Promise<void> } | undefined;
  onChanged: () => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>
        {heading}
        {people.length > 0 ? ` ${people.length}` : ''}
      </Text>
      {people.length === 0 && empty ? <Text style={styles.blurb}>{empty}</Text> : null}
      {people.map((person) => {
        const act = action(person);
        return (
          <View key={person.id} style={styles.person}>
            <PersonName person={person} />
            {act && (
              <Pressable
                onPress={async () => {
                  await act.run();
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
  content: { padding: 16, gap: 18, backgroundColor: theme.ink, flexGrow: 1, paddingBottom: 40 },
  centre: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: theme.ink },
  blurb: { color: theme.muted, fontSize: 14, lineHeight: 20 },
  link: { color: theme.muted, fontSize: 13, textDecorationLine: 'underline' },
  error: { color: theme.accent, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  card: { backgroundColor: theme.surface, borderRadius: radius.xl, padding: 16, gap: 10 },
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.text,
    fontSize: 15,
  },
  primary: {
    backgroundColor: theme.accent,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingVertical: 10,
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
  small: { borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 7 },
  smallOn: { backgroundColor: theme.accent },
  smallOnText: { color: theme.ink, fontSize: 12, fontWeight: '600' },
  smallMuted: { backgroundColor: theme.surface2 },
  smallMutedText: { color: theme.muted, fontSize: 12 },
  disabled: { opacity: 0.4 },
});
