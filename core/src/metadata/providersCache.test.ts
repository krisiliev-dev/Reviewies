import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { db } from '../data/db.ts';
import { COPY } from '../copy.ts';
import { FixtureProvider } from './fixtures.ts';
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

const ROOT = resolve(import.meta.dirname, '../../..');
const TITLE = 'tmdb:tv:1';

/*
 * And the third thing, which this function could not say and the screen therefore could
 * not either: *nothing was asked*, because there is nothing to ask about.
 *
 * A TV Time export carries names and no provider IDs, so an imported title stays
 * `local:tv:tvtime-101` until matching rewrites it — indefinitely, if the match was
 * ambiguous and the ask goes unanswered. No provider has ever heard of that ID.
 *
 * The consequence was not an empty panel. Measured in a browser on the fixture build,
 * which is a supported state (the More screen says "running on sample data"): the title
 * page of a show nothing had identified read **"Where to watch — United States — Stream
 * — Example Streaming — data provided by JustWatch"**. A confident claim about the real
 * world, in the reader's country, credited to a third party, about a show the app could
 * not name. The same bug class §6.58 is about, one state further along.
 */
describe('a title with no provider ID', () => {
  it('is not asked about at all', async () => {
    let asked = 0;
    setProvider(
      providerThat(async () => {
        asked++;
        return undefined;
      }),
    );
    const result = await getProvidersCached('local:tv:tvtime-101', 'GB');
    expect(asked, 'the provider was asked about an ID it cannot know').toBe(0);
    expect(result.unmatched).toBe(true);
    expect(result.providers, 'an answer for a title nothing identified').toBeUndefined();
    expect(result.failed, 'this is not a failure — nothing was attempted').toBeUndefined();
  });

  it('is not answered from a stale cache either', async () => {
    // A cached answer for an ID no provider knows is still an answer nobody should have
    // been given, so the check comes before the cache rather than after it.
    await db.providers.put({
      id: 'local:tv:tvtime-101',
      country: 'GB',
      flatrate: ['Example Streaming'],
      rent: [],
      buy: [],
      fetchedAt: Date.now(),
    });
    setProvider(providerThat(async () => undefined));
    const result = await getProvidersCached('local:tv:tvtime-101', 'GB');
    expect(result.unmatched).toBe(true);
    expect(result.providers).toBeUndefined();
  });

  it('is a sentence on both screens, not a silence', () => {
    /*
     * A source clause, because the module returning a flag proves the part and misses the
     * product — §6.101's plant, and §6.103's a sprint later. Both `WhereToWatch`
     * renderers have to read the flag *and* say something, and the something has to be
     * neither of the other two sentences: "nowhere to watch" and "could not check" are
     * both claims, and nothing was asked.
     */
    expect(COPY.whereToWatch.unmatched.length).toBeGreaterThan(20);
    expect(COPY.whereToWatch.unmatched).not.toBe(COPY.whereToWatch.failed);
    for (const path of ['app/src/ui/WhereToWatch.tsx', 'mobile/src/ui/WhereToWatch.tsx']) {
      const source = readFileSync(resolve(ROOT, path), 'utf8');
      expect(source, `${path} ignores the flag`).toContain('result.unmatched');
      expect(source, `${path} reads it and says nothing`).toContain(
        'COPY.whereToWatch.unmatched',
      );
      // And the other two sentences stand down, rather than appearing beside it.
      expect(source, `${path} still says "nowhere" over the top of it`).toContain(
        '!failed && !unmatched && nothing',
      );
    }
  });

  it('is not something the fixture provider will answer for either', async () => {
    /*
     * The fixture returned availability for *any* ID, which is how this was invisible: a
     * fixture that never says "no" hides every bug that depends on being told no. §6.43
     * swept for fixtures smaller than reality; this is the same shape pointing the other
     * way — one larger than reality, answering questions a real provider would not.
     */
    resetProvider();
    const known = await new FixtureProvider().getWatchProviders('tmdb:tv:1', 'GB');
    const invented = await new FixtureProvider().getWatchProviders('local:tv:tvtime-101', 'GB');
    expect(known?.flatrate.length, 'the fixture stopped answering for anything').toBeGreaterThan(0);
    expect(invented, 'the fixture invented availability for a title it has never heard of')
      .toBeUndefined();
  });

  it('still answers normally for a matched one', async () => {
    // The narrowness: this must not become "answer nothing, ever".
    setProvider(
      providerThat(async (id, country) => ({
        id,
        country,
        flatrate: ['Somewhere'],
        rent: [],
        buy: [],
        fetchedAt: Date.now(),
      })),
    );
    const result = await getProvidersCached(TITLE, 'GB');
    expect(result.unmatched).toBeUndefined();
    expect(result.providers?.flatrate).toEqual(['Somewhere']);
  });
});


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
