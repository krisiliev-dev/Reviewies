import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExpoConfig } from 'expo/config';

/**
 * The three keys the phone needs at build time.
 *
 * `mobile/src/platform.ts` reads `tmdbToken`, `supabaseUrl` and `supabaseAnonKey` from
 * `Constants.expoConfig.extra`, and said in a comment that they were "populated from
 * the environment at build time". They were not. `app.json` is a static file with three
 * empty strings in it and nothing has ever interpolated them — Expo only substitutes
 * environment variables through a JS config like this one.
 *
 * So every native build ever made would have shipped with no provider token and no
 * backend: Search and Discover silently on fixtures, sync unconfigured, and no screen
 * saying why. Nobody caught it because nobody has ever made a native build — it is the
 * §6.68 shape exactly, a value read from a place it can never arrive.
 *
 * The web resolves the same three through `import.meta.env` in `app/src/data/platform.ts`.
 * The `VITE_` names are accepted here as well as the `EXPO_PUBLIC_` ones so a single
 * `.env` at the root serves both, which is what a person actually has.
 */
/**
 * The `.env` this repository actually has is at the root, next to the workspaces, and
 * serves the web build too. Expo only reads one from the project directory, so without
 * this a build run from `mobile/` finds nothing and ships the empty configuration all
 * over again — the same failure this file exists to fix, one directory up.
 *
 * Anything already set in the environment wins — including a deliberately empty
 * value, which means "not configured" — so CI and `EXPO_PUBLIC_*` overrides are
 * unaffected.
 */
const HERE = import.meta.dirname ?? __dirname;

/**
 * Read rather than `import`: a JSON import needs a `type: json` attribute once this
 * file pulls in anything from `node:`, and the attribute syntax is not accepted by
 * every loader that reads an Expo config. Reading it is portable and needs no shim.
 */
const base = JSON.parse(readFileSync(join(HERE, 'app.json'), 'utf8')) as {
  expo: ExpoConfig & { extra?: Record<string, unknown> };
};

function loadRootEnv(): void {
  const file = join(HERE, '..', '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, raw] = match;
    // Presence, not truthiness: somebody who exports `VITE_TMDB_TOKEN=` means "no
    // token", and a file quietly overriding that is a setting that does not stick.
    if (key in process.env) continue;
    process.env[key] = raw.trim().replace(/^['"]|['"]$/g, '');
  }
}

loadRootEnv();

const env = (...names: string[]): string | undefined => {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
};

/**
 * Everything here reaches the device in plain text, the same way the web bundle does.
 * The Supabase *anon* key is designed for that and RLS is what protects the data; a
 * `sb_secret_` key must never appear, and the check below refuses to build if one does.
 */
const supabaseAnonKey = env('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
if (supabaseAnonKey?.startsWith('sb_secret_')) {
  throw new Error(
    'A service key is in the anon slot. It would ship inside the app bundle and grant ' +
      'every reader full access to the database. Use the anon/publishable key.',
  );
}

/**
 * A free Apple ID cannot sign the push entitlement that `expo-notifications` causes
 * prebuild to write. See `plugins/withPersonalTeamSigning.js`; this is opt-in so the
 * paid build keeps push.
 */
const personalTeam = process.env.REVIEWIES_PERSONAL_TEAM === '1';

const config: ExpoConfig = {
  ...base.expo,
  plugins: [
    ...(base.expo.plugins ?? []),
    ...(personalTeam ? ['./plugins/withPersonalTeamSigning.js'] : []),
  ],
  extra: {
    ...base.expo.extra,
    tmdbToken: env('EXPO_PUBLIC_TMDB_TOKEN', 'VITE_TMDB_TOKEN'),
    // Unset in every build but the design harness's snapshot pass. §6.151.
    tmdbBase: env('EXPO_PUBLIC_TMDB_BASE', 'VITE_TMDB_BASE'),
    tmdbImage: env('EXPO_PUBLIC_TMDB_IMAGE', 'VITE_TMDB_IMAGE'),
    supabaseUrl: env('EXPO_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL'),
    supabaseAnonKey,
  },
};

export default config;
