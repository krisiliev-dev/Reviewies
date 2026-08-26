import { useEffect, useState } from 'react';
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
import {
  ensureProfile,
  getSession,
  onAuthChange,
  signIn,
  signOut,
  signUp,
  syncConfigured,
} from '@reviewies/core/sync/auth';
import { onSyncStatus, retryRejectedWrites, syncStatus } from '@reviewies/core/sync/driver';
import { COPY } from '@reviewies/core/copy';
import { radius, theme } from '../src/ui/theme';

/**
 * Signing in, framed as optional throughout.
 *
 * The app is fully usable signed out — the local database is the source of truth, and
 * an account only adds sync and the shared layer. The copy says so rather than
 * nagging, because a tracker that withholds your own history until you register is
 * the thing this app exists in opposition to.
 */
export default function AccountScreen() {
  const [status, setStatus] = useState(syncStatus);
  const [retryNote, setRetryNote] = useState<string>();
  useEffect(() => onSyncStatus(setStatus), []);

  const [session, setSession] = useState<Session | null>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    void getSession().then(setSession);
    return onAuthChange(setSession);
  }, []);

  useEffect(() => {
    if (session) void ensureProfile();
  }, [session]);

  async function submit() {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      if (mode === 'up') {
        await signUp(email.trim(), password);
        setNotice('Check your email to confirm the account, then sign in.');
      } else {
        await signIn(email.trim(), password);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  if (!syncConfigured()) {
    return (
      <>
        <Stack.Screen options={{ title: 'Account' }} />
        <View style={styles.centre}>
          <Text style={styles.blurb}>
            Sync is not configured on this build. Everything else works — your history
            lives on this device either way.
          </Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Account' }} />
      <ScrollView contentContainerStyle={styles.content}>
        {session ? (
          <View style={styles.card}>
            <Text style={styles.cardHeading}>Signed in</Text>
            <Text style={styles.blurb}>{session.user.email}</Text>
            {/* The screen said an account adds sync while nothing on this platform ever
                pushed a row. Now it does, and it says what it is doing rather than
                leaving somebody to guess whether their history has gone anywhere. */}
            <Text style={styles.blurb}>
              {status.busy
                ? 'Syncing…'
                : status.pending > 0
                  ? `${status.pending} change${status.pending === 1 ? '' : 's'} waiting to upload.`
                  : 'Everything is uploaded.'}
              {status.lastError ? ` Last attempt failed: ${status.lastError}` : ''}
            </Text>

            {/* Writes the server refused, which this device is still holding. Separate
                from the waiting count because they mean opposite things: pending is "on
                its way", this is "not going without help". §6.71. */}
            {status.rejected > 0 && (
              <View style={styles.rejected}>
                <Text style={styles.rejectedText} accessibilityLiveRegion="polite">
                  {COPY.sync.rejected(status.rejected)}
                </Text>
                <Pressable
                  style={styles.secondary}
                  onPress={async () => setRetryNote(COPY.sync.retrying(await retryRejectedWrites()))}
                  accessibilityRole="button"
                >
                  <Text style={styles.secondaryText}>{COPY.sync.retryRejected}</Text>
                </Pressable>
                {retryNote ? <Text style={styles.blurb}>{retryNote}</Text> : null}
              </View>
            )}
            <Pressable
              style={styles.secondary}
              onPress={() => void signOut()}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>Sign out</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardHeading}>Sync across devices</Text>
            <Text style={styles.blurb}>
              Optional. Everything already works on this device — an account adds sync,
              episode comments and shared reactions.
            </Text>

            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={theme.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password (8+ characters)"
              placeholderTextColor={theme.muted}
              secureTextEntry
              style={styles.input}
            />

            <Pressable
              style={styles.primary}
              onPress={submit}
              disabled={busy}
              accessibilityRole="button"
              // While busy the label is a spinner, which has no text to read.
              accessibilityLabel={mode === 'in' ? 'Sign in' : 'Create account'}
              accessibilityState={{ disabled: busy, busy }}
            >
              {busy ? (
                <ActivityIndicator color={theme.ink} />
              ) : (
                <Text style={styles.primaryText}>
                  {mode === 'in' ? 'Sign in' : 'Create account'}
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => setMode(mode === 'in' ? 'up' : 'in')}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={styles.toggle}>
                {mode === 'in' ? 'Create an account instead' : 'I already have an account'}
              </Text>
            </Pressable>

            {error && <Text style={styles.error}>{error}</Text>}
            {notice && <Text style={styles.blurb}>{notice}</Text>}
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, backgroundColor: theme.ink, flexGrow: 1 },
  centre: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: theme.ink },
  card: { backgroundColor: theme.surface, borderRadius: radius.xl, padding: 16, gap: 12 },
  cardHeading: { color: theme.text, fontSize: 17, fontWeight: '700' },
  blurb: { color: theme.muted, fontSize: 14, lineHeight: 20 },
  rejected: { marginTop: 10, gap: 8 },
  rejectedText: { color: theme.accent, fontSize: 14, lineHeight: 20 },
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
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { color: theme.ink, fontWeight: '700', fontSize: 15 },
  secondary: {
    backgroundColor: theme.surface2,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: { color: theme.text, fontSize: 15 },
  toggle: { color: theme.muted, fontSize: 13, textDecorationLine: 'underline' },
  error: { color: theme.accent, fontSize: 13 },
});
