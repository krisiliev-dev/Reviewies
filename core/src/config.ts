/**
 * Credentials and endpoints, injected by the app.
 *
 * These used to be read straight from `import.meta.env`, which is a Vite invention.
 * Metro does not provide it, so a core that reaches for it cannot run on a phone at
 * all — the same class of problem as reaching for `localStorage`.
 *
 * Every value is optional, and everything that uses them degrades rather than throws:
 * no TMDB token means the fixture provider, no Supabase means the app runs local-only.
 * That is what makes the app launchable with nothing configured, which is how it
 * should be for someone who just wants to track what they watch.
 */
export interface Config {
  tmdbToken?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  vapidPublicKey?: string;
  bridgeRelay?: string;
  bridgeToken?: string;
}

let current: Config = {};

export function setConfig(config: Config): void {
  // Empty strings are how an unfilled variable arrives; treat them as absent so a
  // blank line in a .env does not read as "configured".
  current = Object.fromEntries(
    Object.entries(config).filter(([, value]) => typeof value === 'string' && value.trim()),
  );
}

export function getConfig(): Readonly<Config> {
  return current;
}
