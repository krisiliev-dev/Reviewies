import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db.ts';
import {
  acceptMatch,
  runMatching,
  chooseConfident,
  normaliseName,
  proposeMatch,
  scoreCandidate,
  similarity,
  unmatchedTitles,
} from './reconcile.ts';
import { importRescueCsv } from './tvtimeRescue.ts';
import { DEFAULT_LOOKUP } from './reconcile.ts';
import { getEpisodesCached } from '../metadata/index.ts';
import type { MatchCandidate } from './reconcile.ts';

/**
 * Matching an imported history to the provider.
 *
 * The asymmetry these tests are built around: an unmatched row is visibly unfinished
 * and costs nothing, while a wrong match silently moves somebody's history onto the
 * wrong show and there is no way for them to notice. Every threshold here exists to
 * make the second case impossible to reach without being asked.
 */
const candidate = (over: Partial<MatchCandidate>): MatchCandidate => ({
  id: 'tmdb:tv:1',
  kind: 'show',
  name: 'The Long Dark',
  score: 1,
  ...over,
});

beforeEach(async () => {
  await Promise.all([
    db.watches.clear(),
    db.ratings.clear(),
    db.library.clear(),
    db.watchlist.clear(),
    db.titles.clear(),
    db.episodes.clear(),
    // Cleared like the rest: without it the queue carries rows in from the test before,
    // which is how the first version of these assertions counted six watches.
    db.outbox.clear(),
  ]);
});

describe('names', () => {
  it('sees past case, punctuation and a leading article', () => {
    expect(normaliseName('The Long Dark')).toBe('long dark');
    expect(normaliseName("It's Always Sunny")).toBe('its always sunny');
    // TV Time wrote the year into some titles; TMDB does not.
    expect(normaliseName('Doctor Who (2005)')).toBe('doctor who');
  });

  it('scores an exact name as a match and an unrelated one as not', () => {
    expect(similarity('long dark', 'long dark')).toBe(1);
    expect(similarity('long dark', 'kitchen nightshift')).toBeLessThan(0.2);
  });
});

describe('scoring', () => {
  const want = { name: 'The Long Dark', kind: 'show' as const, year: 2021 };

  it('will not match across kinds', () => {
    expect(scoreCandidate(want, candidate({ kind: 'film' }))).toBe(0);
  });

  it('rewards an agreeing year and punishes a disagreeing one', () => {
    const same = scoreCandidate(want, candidate({ year: 2021 }));
    const off = scoreCandidate(want, candidate({ year: 2009 }));
    expect(same).toBeGreaterThan(off);
    // Remakes and reboots share their names exactly, which is the case most likely to
    // go wrong, so a disagreeing year has to be evidence against rather than neutral.
    expect(off).toBeLessThan(0.75);
  });

  it('does not need a year, because most exports have none', () => {
    expect(scoreCandidate({ name: 'The Long Dark', kind: 'show' }, candidate({}))).toBe(1);
  });
});

describe('deciding whether to ask', () => {
  it('acts alone on one clear answer', () => {
    expect(chooseConfident([candidate({ score: 1 })])?.id).toBe('tmdb:tv:1');
  });

  it('refuses a weak best guess', () => {
    expect(chooseConfident([candidate({ score: 0.8 })])).toBeUndefined();
  });

  it('refuses two strong ones', () => {
    // The dangerous case is not a weak match. It is a remake, a spin-off, or a show
    // with a regional twin — two results that both look right.
    const both = [
      candidate({ id: 'tmdb:tv:1', score: 1 }),
      candidate({ id: 'tmdb:tv:2', score: 0.97 }),
    ];
    expect(chooseConfident(both)).toBeUndefined();
  });

  it('takes nothing from nothing', () => {
    expect(chooseConfident([])).toBeUndefined();
  });
});

describe('accepting a match', () => {
  const EPISODES_HEADER =
    'show,season,number,name,seen,seen_date,times_watched,air_date,show_id,episode_id';

  /**
   * A stand-in for the provider search.
   *
   * Injected rather than mocked at the module level because `provider` is resolved once
   * at load from the config, and this repository's test environment has a real token in
   * it — without this the suite would make live TMDB calls and assert on whatever the
   * internet said today.
   */
  const finds = async () => [
    { id: 'tmdb:tv:1', kind: 'show' as const, name: 'The Long Dark', year: 2021 },
  ];

  /** The provider's own episode list, stubbed for the same reason. */
  const lookup = {
    title: async () => undefined,
    episodes: async () =>
      [1, 2, 3].map((number) => ({
        id: `tmdb:ep:${number}`,
        seriesId: 'tmdb:tv:1',
        season: 1,
        number,
        name: `Episode ${number}`,
        fetchedAt: Date.now(),
      })),
  };

  async function importAndMatch(csv: string) {
    await importRescueCsv(csv);
    const [title] = await unmatchedTitles();
    const proposal = await proposeMatch(title, finds);
    const target = proposal.confident?.id;
    expect(target).toBeTruthy();
    return { localId: title.id, target: target!, report: await acceptMatch(title.id, target!, lookup) };
  }

  it('moves the watches onto the provider\'s own episodes', async () => {
    const csv =
      `${EPISODES_HEADER}\n` +
      'The Long Dark,1,1,Pilot,True,2026-01-05,1,2026-01-01,900,4001\n' +
      'The Long Dark,1,2,Thaw,True,2026-01-06,1,2026-01-02,900,4002';

    const { localId, target, report } = await importAndMatch(csv);

    expect(report.watches).toBe(2);
    expect(report.orphanedWatches).toBe(0);

    const watches = await db.watches.toArray();
    expect(watches).toHaveLength(2);
    // Nothing may still point at the placeholder: a watch left behind is history that
    // has silently stopped counting towards the show it belongs to.
    expect(watches.every((w) => w.seriesId === target)).toBe(true);
    expect(watches.every((w) => !w.targetId.startsWith(localId))).toBe(true);
  });

  it('keeps a watch it cannot place rather than dropping it', async () => {
    // Specials, disagreeing numbering, and anime whose seasons TMDB flattens all land
    // here. Losing the record silently would be the worst outcome available.
    const csv =
      `${EPISODES_HEADER}\n` +
      'The Long Dark,1,1,Pilot,True,2026-01-05,1,2026-01-01,900,4001\n' +
      'The Long Dark,44,99,Lost,True,2026-01-06,1,2026-01-02,900,4099';

    const { report } = await importAndMatch(csv);

    expect(report.watches).toBe(1);
    expect(report.orphanedWatches).toBe(1);
    expect(await db.watches.count()).toBe(2);
  });

  it('moves the library row and leaves nothing local behind', async () => {
    const csv = `${EPISODES_HEADER}\nThe Long Dark,1,1,Pilot,True,2026-01-05,1,2026-01-01,900,4001`;
    const { target } = await importAndMatch(csv);

    const library = await db.library.toArray();
    expect(library.map((row) => row.titleId)).toEqual([target]);
    // Still 'watching': what somebody chose, or what the import inferred, is not
    // something a match is entitled to change.
    expect(library[0].status).toBe('watching');
    expect(await unmatchedTitles()).toEqual([]);
  });

  it('remembers where it went, so a re-import is not asked about again', async () => {
    const csv = `${EPISODES_HEADER}\nThe Long Dark,1,1,Pilot,True,2026-01-05,1,2026-01-01,900,4001`;
    const { localId, target } = await importAndMatch(csv);

    expect((await db.titles.get(localId))?.matchedTo).toBe(target);
  });

  it('does not overwrite a rating made against the real show', async () => {
    const csv = `${EPISODES_HEADER}\nThe Long Dark,1,1,Pilot,True,2026-01-05,1,2026-01-01,900,4001`;
    await importRescueCsv(csv);
    const [title] = await unmatchedTitles();
    const target = (await proposeMatch(title, finds)).confident!.id;

    await db.ratings.put({ targetId: title.id, value: 2, ratedAt: 1 });
    await db.ratings.put({ targetId: target, value: 5, ratedAt: 2 });

    await acceptMatch(title.id, target, lookup);

    // The one made against the matched show was made with the real thing in front of
    // them; the imported one is a guess about which show it belonged to.
    expect((await db.ratings.get(target))?.value).toBe(5);
    expect(await db.ratings.get(title.id)).toBeUndefined();
  });
});

describe('working through a library', () => {
  const HEADER =
    'show,season,number,name,seen,seen_date,times_watched,air_date,show_id,episode_id';

  const lookup = {
    title: async () => undefined,
    episodes: async () => [
      {
        id: 'tmdb:ep:1',
        seriesId: 'tmdb:tv:1',
        season: 1,
        number: 1,
        name: 'Episode 1',
        fetchedAt: Date.now(),
      },
    ],
  };

  async function importShows(...names: string[]) {
    const rows = names.map(
      (name, i) => `${name},1,1,Pilot,True,2026-01-05,1,2026-01-01,${900 + i},${4000 + i}`,
    );
    await importRescueCsv([HEADER, ...rows].join('\n'));
  }

  it('matches what it is sure of and collects the rest to ask about', async () => {
    await importShows('The Long Dark', 'Twin Shows');

    const progress = await runMatching({
      pace: 0,
      lookup,
      search: async (query) =>
        query.startsWith('The Long')
          ? [{ id: 'tmdb:tv:1', kind: 'show', name: 'The Long Dark' }]
          : // Two that both look right — a remake, a spin-off, a regional twin. This is
            // the case a wrong guess would ruin, so it has to become a question.
            [
              { id: 'tmdb:tv:2', kind: 'show', name: 'Twin Shows' },
              { id: 'tmdb:tv:3', kind: 'show', name: 'Twin Show' },
            ],
    });

    expect(progress.matched).toBe(1);
    expect(progress.asks.map((a) => a.name)).toEqual(['Twin Shows']);
    expect(progress.done).toBe(2);
  });

  it('picks up where it stopped, without keeping a bookmark', async () => {
    await importShows('The Long Dark', 'Twin Shows');

    // What is left is derived from the database each time, so closing the app mid-run
    // loses nothing but the searches in flight.
    const first = await runMatching({
      limit: 1,
      pace: 0,
      lookup,
      search: async () => [{ id: 'tmdb:tv:1', kind: 'show', name: 'The Long Dark' }],
    });
    expect(first.matched + first.asks.length).toBe(1);

    const rest = await runMatching({
      pace: 0,
      lookup,
      search: async () => [{ id: 'tmdb:tv:9', kind: 'show', name: 'Twin Shows' }],
    });
    expect(rest.done).toBe(1);
    expect(await unmatchedTitles()).toEqual([]);
  });

  it('does not let one unanswerable title end the run', async () => {
    await importShows('The Long Dark', 'Twin Shows');
    let asked = 0;

    const progress = await runMatching({
      pace: 0,
      lookup,
      search: async (query) => {
        asked++;
        if (query.startsWith('The Long')) throw new Error('provider said no');
        return [{ id: 'tmdb:tv:2', kind: 'show', name: 'Twin Shows' }];
      },
    });

    expect(asked).toBe(2);
    expect(progress.matched).toBe(1);
    // The one that failed is exactly as unmatched as it was, and the next run retries.
    expect((await unmatchedTitles()).map((t) => t.name)).toEqual(['The Long Dark']);
  });

  it('stops when asked to', async () => {
    await importShows('The Long Dark', 'Twin Shows');
    const controller = new AbortController();

    const progress = await runMatching({
      pace: 0,
      lookup,
      signal: controller.signal,
      search: async () => {
        controller.abort();
        return [{ id: 'tmdb:tv:1', kind: 'show', name: 'The Long Dark' }];
      },
    });

    expect(progress.done).toBe(1);
  });

  it('paces itself between searches, and not before the first', async () => {
    await importShows('The Long Dark', 'Twin Shows');
    const waits: number[] = [];

    await runMatching({
      pace: 350,
      lookup,
      sleep: async (ms) => {
        waits.push(ms);
      },
      search: async () => [],
    });

    // A provider will rate-limit a burst of two hundred, and the honest response is to
    // go slower rather than lose the tail of somebody's library.
    expect(waits).toEqual([350]);
  });
});

describe('a migration on an account', () => {
  const HEADER =
    'show,season,number,name,seen,seen_date,times_watched,air_date,show_id,episode_id';

  const finds = async () => [
    { id: 'tmdb:tv:1', kind: 'show' as const, name: 'The Long Dark', year: 2021 },
  ];
  const lookup = {
    title: async () => undefined,
    episodes: async () => [
      {
        id: 'tmdb:ep:1',
        seriesId: 'tmdb:tv:1',
        season: 1,
        number: 1,
        name: 'Pilot',
        fetchedAt: Date.now(),
      },
    ],
  };

  const queued = async () => (await db.outbox.toArray()).map((row) => ({
    table: row.table,
    pk: row.pk,
    deleted: row.deleted,
  }));

  it('queues an imported history for upload', async () => {
    await importRescueCsv(
      `${HEADER}\nThe Long Dark,1,1,Pilot,True,2026-01-05,1,2026-01-01,900,4001`,
    );

    const rows = await queued();
    // Every other write in this app goes through markWatched or rate, which queue. An
    // import wrote straight to the tables, so a rescued history lived on one device and
    // reached no other — and nothing said so.
    expect(rows.filter((r) => r.table === 'watches')).toHaveLength(1);
    expect(rows.filter((r) => r.table === 'library')).toHaveLength(1);

    // Titles and episodes are a TTL'd cache of somebody else's data under TMDB's terms.
    // Replicating them is not ours to do.
    expect(rows.some((r) => r.table === 'titles' || r.table === 'episodes')).toBe(false);
  });

  it('retires the old IDs on the server as well as here', async () => {
    await importRescueCsv(
      `${HEADER}\nThe Long Dark,1,1,Pilot,True,2026-01-05,1,2026-01-01,900,4001`,
    );
    const [title] = await unmatchedTitles();
    await db.outbox.clear();

    const target = (await proposeMatch(title, finds)).confident!.id;
    await acceptMatch(title.id, target, lookup);

    const rows = await queued();
    // Without the tombstone the server keeps the row under the ID this just retired,
    // and the next pull resurrects a history split across two sets of them.
    expect(rows.filter((r) => r.table === 'watches' && r.deleted)).toHaveLength(1);
    expect(rows.filter((r) => r.table === 'watches' && !r.deleted)).toHaveLength(1);
    expect(rows.filter((r) => r.table === 'library' && r.deleted)).toHaveLength(1);
    expect(rows.filter((r) => r.table === 'library' && !r.deleted)).toHaveLength(1);
  });

  it('survives the round trip through the sync engine', async () => {
    await importRescueCsv(
      `${HEADER}\nThe Long Dark,1,1,Pilot,True,2026-01-05,1,2026-01-01,900,4001`,
    );
    const [title] = await unmatchedTitles();
    const target = (await proposeMatch(title, finds)).confident!.id;
    await acceptMatch(title.id, target, lookup);

    // What a server would end up holding: apply the queue in order and see what is
    // left. Asserting on outbox rows alone would not catch an ordering that deletes the
    // new row after writing it.
    const server = new Map<string, unknown>();
    for (const row of await db.outbox.orderBy('updatedAt').toArray()) {
      if (row.deleted) server.delete(`${row.table}:${row.pk}`);
      else server.set(`${row.table}:${row.pk}`, row.row);
    }

    const watches = [...server.keys()].filter((key) => key.startsWith('watches:'));
    expect(watches).toHaveLength(1);
    expect(watches[0]).toContain('tmdb:ep:1');
    expect([...server.keys()].filter((key) => key.startsWith('library:'))).toEqual([
      'library:tmdb:tv:1',
    ]);
  });
});

describe('anime, whose seasons TMDB flattens', () => {
  const HEADER =
    'show,season,number,name,seen,seen_date,times_watched,air_date,show_id,episode_id';

  it('remaps against the corrected listing, not the provider\'s raw one', () => {
    // Not a detail. TMDB reports some anime as one hundred-episode season;
    // getEpisodesCached re-cuts those with AniList and provider.getEpisodes does not.
    // An imported anime history counts seasons the way a fan does — season 2, episode 1
    // — so remapping against the flattened listing would place nothing and orphan the
    // whole history in one go.
    expect(DEFAULT_LOOKUP.episodes).toBe(getEpisodesCached);
  });

  it('places a season-two watch when the listing has seasons', async () => {
    await importRescueCsv(
      `${HEADER}\nFrieren,2,3,Aussterben,True,2026-01-05,1,2026-01-01,700,7003`,
    );
    const [title] = await unmatchedTitles();

    const report = await acceptMatch(title.id, 'tmdb:tv:209867', {
      title: async () => undefined,
      episodes: async () => [
        {
          id: 'tmdb:ep:1',
          seriesId: 'tmdb:tv:209867',
          season: 2,
          number: 3,
          name: 'Aussterben',
          fetchedAt: Date.now(),
        },
      ],
    });

    expect(report.watches).toBe(1);
    expect(report.orphanedWatches).toBe(0);
  });
});

describe('what needs matching', () => {
  it('is what an import left behind', async () => {
    const csv =
      'show,season,number,name,seen,seen_date,times_watched,air_date,show_id,episode_id\n' +
      'The Long Dark,1,1,Pilot,True,2026-01-05,1,2026-01-01,900,4001';
    await importRescueCsv(csv);

    const pending = await unmatchedTitles();
    expect(pending.map((t) => t.name)).toEqual(['The Long Dark']);
  });

  it('answers from its own record once matched, rather than asking again', async () => {
    await db.titles.put({
      id: 'local:tv:tvtime-900',
      kind: 'show',
      name: 'The Long Dark',
      fetchedAt: 0,
      matchedTo: 'tmdb:tv:1',
    });

    // A re-import writes the local rows again. Asking somebody the same question twice
    // about the same show is how a migration stops being worth finishing.
    const proposal = await proposeMatch((await db.titles.get('local:tv:tvtime-900'))!, async () => {
      throw new Error('should not have asked');
    });
    expect(proposal.confident?.id).toBe('tmdb:tv:1');
  });
});
