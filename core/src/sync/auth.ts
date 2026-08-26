import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import { getConfig } from '../config.ts';

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

/**
 * Where the auth library keeps the session.
 *
 * supabase-js reaches for `localStorage` by default, which does not exist on a phone —
 * without this the session is lost the moment the app closes, and the user is signed
 * out every launch. React Native supplies AsyncStorage; the web supplies nothing and
 * gets the default.
 *
 * Async on purpose: it is supabase-js's own interface, and AsyncStorage is async.
 */
export interface AuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

let authStorage: AuthStorage | undefined;

export function setAuthStorage(storage: AuthStorage): void {
  if (client) {
    throw new Error('setAuthStorage() must be called before the Supabase client is created.');
  }
  authStorage = storage;
}

export function getClient(): SupabaseClient | undefined {
  if (client) return client;

  const { supabaseUrl: url, supabaseAnonKey: key } = getConfig();
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
      // Only meaningful in a browser, where an OAuth redirect comes back in the URL.
      detectSessionInUrl: !authStorage,
      storageKey: authStorageKey(),
      ...(authStorage ? { storage: authStorage } : {}),
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
  // Throws like its siblings rather than returning quietly: a sign-out that failed used
  // to leave somebody signed in while the screen said otherwise. §6.57.
  const { error } = (await getClient()?.auth.signOut()) ?? { error: undefined };
  if (error) throw error;
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

  const { error } = await c.from('profiles').insert({ id: session.user.id, handle });
  // Throwing rather than returning: this runs on the way into an account, and an
  // account with no profile row is one nobody else can find or follow.
  if (error) throw error;
}
