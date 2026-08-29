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
  /**
   * Where the metadata provider sends its requests, and where it looks for artwork.
   *
   * Both default to TMDB's own hosts and exist for one reason: the design harness. Its
   * browser has no outbound network at all — `example.com` fails the same way TMDB does —
   * so the *only* way to judge the design against real titles, real episode names, real
   * overviews and real artwork is to fetch them with node, keep them, and serve them from
   * localhost. Every screenshot this project has ever taken is of invented data: five
   * titles of two or three short words, `Episode N` for every name, one-sentence
   * overviews, and **no artwork at all** — the fixture provider supplies no `posterUrl`,
   * so every poster in the design record is the two-letter fallback. §6.151.
   *
   * A pointer at a different host is not a test seam bolted on: it is the same
   * substitution `setProvider` makes one layer up, at the layer where the *data* is
   * real and only the address is not.
   */
  tmdbBase?: string;
  tmdbImage?: string;
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
