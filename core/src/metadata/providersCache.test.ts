import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db.ts';
import { getProvidersCached, resetProvider, setProvider } from './index.ts';
import type { MetadataProvider } from './provider.ts';

/**
 * Where-to-watch, and the difference between "nowhere" and "I could not ask".
 *
 * §6.58 changed this function's whole shape for that reason: it used to return
 * `CachedProviders | undefined` and swallow the error, so a network failure and a title
 * genuinely on no service came back identical, and the screen said *"Not on any service
 * in United States that we can see"* — a statement about the world made from a network
 * error. It is the named bug class of this repository.
 *
 * §6.68 then measured coverage and found the fix had **never been executed by a test**.
 * The browser suite reaches it, through a built bundle, where the distinction it exists
 * to make is the one thing that cannot be arranged. So these run it directly.
 */

const TITLE = 'tmdb:tv:1';
const DAY = 86_400_000;

function providerThat(
  getWatchProviders: MetadataProvider['getWatchProviders'],
): MetadataProvider {
  const no = () => {
    throw new Error('not part of this test');
  };
  return {
    name: 'test',
    search: no as never,
    getTitle: no as never,
    getEpisodes: no as never,
    getRecommendations: no as never,
    getTrending: no as never,
    getWatchProviders,
  };
}

beforeEach(async () => {
  await db.providers.clear();
  // The choice is remembered on purpose (§6.47), so a case that leaves a fake behind
  // would silently decide the next one.
  resetProvider();
});

describe('asking where a title is streaming', () => {
  it('serves a fresh cached answer without asking again', async () => {
    await db.providers.put({
      id: TITLE,
      country: 'GB',
      flatrate: ['iPlayer'],
      rent: [],
      buy: [],
      fetchedAt: Date.now(),
    });
    setProvider(
      providerThat(() => {
        throw new Error('should not have been asked');
      }),
    );

    const result = await getProvidersCached(TITLE, 'GB');
    expect(result.providers?.flatrate?.[0]).toBe('iPlayer');
    expect(result.failed).toBeUndefined();
  });

  it('treats another country’s cached answer as a miss', async () => {
    // Keyed by title alone, so serving the US row to somebody in Britain would be
    // actively misleading rather than merely stale.
    await db.providers.put({
      id: TITLE,
      country: 'US',
      flatrate: ['Hulu'],
      rent: [],
      buy: [],
      fetchedAt: Date.now(),
    });
    let asked: string | undefined;
    setProvider(
      providerThat(async (_id, country) => {
        asked = country;
        return {
          id: TITLE,
          country,
          flatrate: ['iPlayer'],
          rent: [],
          buy: [],
          fetchedAt: Date.now(),
        };
      }),
    );

    const result = await getProvidersCached(TITLE, 'GB');
    expect(asked).toBe('GB');
    expect(result.providers?.flatrate?.[0]).toBe('iPlayer');
  });

  it('says "nowhere" as an answer, with nothing cached and no failure', async () => {
    setProvider(providerThat(async () => undefined));
    const result = await getProvidersCached(TITLE, 'GB');
    expect(result.providers).toBeUndefined();
    expect(result.failed).toBeUndefined();
  });

  it('says "I could not ask" as something else entirely', async () => {
    // The whole point. Both come back with no providers; only one of them is a claim
    // about the world.
    setProvider(
      providerThat(async () => {
        throw new Error('Failed to fetch');
      }),
    );
    const result = await getProvidersCached(TITLE, 'GB');
    expect(result.providers).toBeUndefined();
    expect(result.failed).toBe('Failed to fetch');
  });

  it('offers the stale answer it has *and* says the asking failed', async () => {
    // Both halves: something to look at, and the honesty that it might be out of date.
    await db.providers.put({
      id: TITLE,
      country: 'GB',
      flatrate: ['iPlayer'],
      rent: [],
      buy: [],
      fetchedAt: Date.now() - 400 * DAY,
    });
    setProvider(
      providerThat(async () => {
        throw new Error('offline');
      }),
    );

    const result = await getProvidersCached(TITLE, 'GB');
    expect(result.providers?.flatrate?.[0]).toBe('iPlayer');
    expect(result.failed).toBe('offline');
  });

  it('does not offer another country’s stale answer when the asking fails', async () => {
    await db.providers.put({
      id: TITLE,
      country: 'US',
      flatrate: ['Hulu'],
      rent: [],
      buy: [],
      fetchedAt: Date.now() - 400 * DAY,
    });
    setProvider(
      providerThat(async () => {
        throw new Error('offline');
      }),
    );

    const result = await getProvidersCached(TITLE, 'GB');
    expect(result.providers).toBeUndefined();
    expect(result.failed).toBe('offline');
  });

  it('has something to say even when the error does not', async () => {
    setProvider(
      providerThat(async () => {
        throw 'a string, not an Error';
      }),
    );
    expect((await getProvidersCached(TITLE, 'GB')).failed).toBe('Could not ask.');
  });

  it('caches a fresh answer so the next ask is free', async () => {
    let calls = 0;
    setProvider(
      providerThat(async (_id, country) => {
        calls++;
        return {
          id: TITLE,
          country,
          flatrate: ['iPlayer'],
          rent: [],
          buy: [],
          fetchedAt: Date.now(),
        };
      }),
    );

    await getProvidersCached(TITLE, 'GB');
    await getProvidersCached(TITLE, 'GB');
    expect(calls).toBe(1);
  });
});
