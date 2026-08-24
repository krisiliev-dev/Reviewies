import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';

/**
 * Supabase auth, kept deliberately optional.
 *
 * Reviewies works fully signed-out — the local database is the source of truth, and
 * an account only adds sync and the shared layer. Nothing in the core loop may
 * depend on this module resolving.
 *
 * Only the publishable/anon key is used. It is safe in a client bundle because
 * row-level security decides what it can reach; the secret key bypasses RLS and must
 * never appear here.
 */

let client: SupabaseClient | undefined;

export function getClient(): SupabaseClient | undefined {
  if (client) return client;

  const url = import.meta.env?.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) return undefined;

  // Guard against the secret key being pasted in by mistake — it would work, and
  // would silently disable every row-level security policy for this client.
  if (key.startsWith('sb_secret_') || key.includes('service_role')) {
    throw new Error(
      'VITE_SUPABASE_ANON_KEY looks like a secret key. Use the publishable/anon key — ' +
        'the secret key bypasses row-level security and must never ship to a browser.',
    );
  }

  client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: authStorageKey(),
    },
  });
  return client;
}

/**
 * Where the session is kept.
 *
 * One key in the browser, but one *per worker* under test. Live suites run in
 * parallel against the same project, and a shared key means whichever file signs in
 * last silently signs the others out — a flake that looks like a policy failure and
 * is not.
 */
export function authStorageKey(base = 'reviewies-auth'): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const worker = env?.VITEST_WORKER_ID;
  return worker ? `${base}-test-${worker}` : base;
}

export const syncConfigured = (): boolean => {
  try {
    return getClient() !== undefined;
  } catch {
    return false;
  }
};

export async function getSession(): Promise<Session | null> {
  const c = getClient();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session;
}

export function onAuthChange(fn: (session: Session | null) => void): () => void {
  const c = getClient();
  if (!c) return () => {};
  const { data } = c.auth.onAuthStateChange((_event, session) => fn(session));
  return () => data.subscription.unsubscribe();
}

export async function signUp(email: string, password: string): Promise<void> {
  const c = getClient();
  if (!c) throw new Error('Sync is not configured');
  const { error } = await c.auth.signUp({ email, password });
  if (error) throw error;
}

export async function signIn(email: string, password: string): Promise<void> {
  const c = getClient();
  if (!c) throw new Error('Sync is not configured');
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await getClient()?.auth.signOut();
}

/**
 * Ensure a profile row exists for the signed-in user.
 *
 * Auth creates the user; the profile carries the handle other people see. A handle
 * is derived from the email as a starting point and can be changed later.
 */
export async function ensureProfile(): Promise<void> {
  const c = getClient();
  const session = await getSession();
  if (!c || !session) return;

  const { data } = await c.from('profiles').select('id').eq('id', session.user.id).maybeSingle();
  if (data) return;

  const base = (session.user.email ?? 'user').split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '');
  // The handle is unique; a short suffix avoids collisions without a round trip.
  const handle = `${base.slice(0, 24) || 'user'}_${session.user.id.slice(0, 4)}`;

  await c.from('profiles').insert({ id: session.user.id, handle });
}
