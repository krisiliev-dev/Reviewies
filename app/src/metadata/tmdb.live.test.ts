import { describe, expect, it } from 'vitest';
import { TmdbProvider } from './tmdb';

/**
 * Live TMDB checks. Skipped automatically when no token is configured, so CI and
 * contributors without credentials are unaffected.
 *
 * These exist to test the assumption the whole product rests on: that TMDB actually
 * covers the niche and non-English television people care about, and that its episode
 * data is usable. Everything else can be mocked; this cannot.
 *
 *   npx vitest run src/metadata/tmdb.live.test.ts
 */

const token = import.meta.env?.VITE_TMDB_TOKEN as string | undefined;
const describeLive = token ? describe : describe.skip;

describeLive('TMDB coverage (live)', () => {
  const tmdb = new TmdbProvider(token!);

  it('finds mainstream television', async () => {
    const results = await tmdb.search('Breaking Bad');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toMatch(/Breaking Bad/i);
    expect(results[0].id).toMatch(/^tmdb:tv:\d+$/);
  }, 20_000);

  // The "no matter how niche" requirement, tested against deliberately obscure and
  // non-English titles rather than safe mainstream ones.
  it.each([
    ['Detectorists', 'British comedy, modest audience'],
    ['Kaamelott', 'French, rarely in English-language databases'],
    ['Dark', 'German'],
    ['The Bureau', 'French espionage'],
    ['Nathan for You', 'niche US comedy'],
  ])('finds %s (%s)', async (query) => {
    const results = await tmdb.search(query);
    expect(results.length).toBeGreaterThan(0);
  }, 20_000);

  it('returns episodes keyed by stable TMDB episode IDs', async () => {
    // Detectorists: small British series, three short seasons.
    const [show] = await tmdb.search('Detectorists');
    const episodes = await tmdb.getEpisodes(show.id);

    expect(episodes.length).toBeGreaterThan(10);
    // Progress is stored against these IDs, so they must be per-episode and stable
    // rather than derived from season/episode position.
    expect(episodes[0].id).toMatch(/^tmdb:ep:\d+$/);
    expect(new Set(episodes.map((e) => e.id)).size).toBe(episodes.length);
    expect(episodes[0].airDate).toBeTruthy();
    expect(episodes.some((e) => (e.runtimeMin ?? 0) > 0)).toBe(true);
  }, 60_000);

  it('reports watch providers for a country', async () => {
    const [show] = await tmdb.search('Breaking Bad');
    const providers = await tmdb.getWatchProviders(show.id, 'GB');
    // Availability varies by territory and over time, so assert the shape rather
    // than any particular service.
    expect(providers).toBeDefined();
    expect(Array.isArray(providers?.flatrate)).toBe(true);
  }, 20_000);

  it('finds anime', async () => {
    const results = await tmdb.search('Frieren');
    expect(results.length).toBeGreaterThan(0);
  }, 20_000);

  it('keeps a long-running anime split into seasons rather than one flat block', async () => {
    // One Piece, the 1999 anime. Earlier research assumed TMDB would flatten shows
    // like this into a single hundred-episode season; it does not — TMDB splits it
    // by story arc across 20+ seasons, which is more useful than absolute numbering.
    const title = await tmdb.getTitle('tmdb:tv:37854');
    expect(title?.seasonCount).toBeGreaterThan(15);
  }, 30_000);

  it('fetches specials as season 0 so they exist but can be excluded from Up Next', async () => {
    // Detectorists has a Christmas special. Iterating TMDB's reported season list
    // rather than 1..N is what picks these up.
    const episodes = await tmdb.getEpisodes('tmdb:tv:61828');
    const specials = episodes.filter((e) => e.season === 0);
    expect(specials.length).toBeGreaterThan(0);
    expect(episodes.some((e) => e.season === 1)).toBe(true);
  }, 60_000);
});
