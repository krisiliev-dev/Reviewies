import { describe, expect, it } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * A failure that renders as absence.
 *
 * Twice this codebase has shipped the same bug in different clothes. The match-imports
 * screen went back to offering its button when a run failed, which looks identical to a
 * run that found nothing to do. And `{ data: null, error }` from supabase-js became an
 * empty array, so a broken query and an empty account are the same screen.
 *
 * The shape is always `if (error || !data) return []`. Two opposite facts — "there are
 * none" and "we could not ask" — collapse into one value, and every caller downstream
 * reads the first. The worst of them was content warnings, where "nobody has flagged
 * anything" is what somebody avoiding a trigger reads as an answer; the most expensive
 * was `fetchLists`, which `restoreAccount` uses to know what is already there, so a
 * failed read looked like an empty account and would have duplicated every list.
 *
 * So: a read whose emptiness a person or a decision depends on has to say which kind of
 * empty it is. The exemptions are the interesting part — each is somebody deciding that
 * this particular absence is safe to be silent about, written down where the next
 * person will have the same doubt.
 *
 * `fetchComments` is not in that list and is worth naming here: it already answers the
 * question, because `gated` says whether the server withheld the comments or there were
 * none. It was the shape everything else is being brought to, and it was written that
 * way from the start.
 */
const ROOT = resolve(__dirname, '../../..');

/**
 * Reads where returning nothing on failure is right, and why.
 *
 * The test is not that these are rare. It is that each one was thought about — and the
 * staleness check below is what makes that true over time: when a read is fixed, its
 * reason has to go, so the list can never fill up with excuses for code that changed.
 * Both of `searchPeople` and `findByHandle` were in here saying they were wrong and
 * unfinished, and removing them is what finishing them looked like.
 *
 * The keys are the function the parser reports, which is the innermost one containing
 * the return — not always the exported name. That is deliberate: a name guessed by a
 * person and a name found by the check drift apart, and the list stops describing the
 * code it claims to.
 */
const SILENT: Record<string, string> = {
  'watching/resume.ts:resumeFor':
    'A stored position that will not parse means there is nothing to resume, which is the same answer as never having watched it. Raising here would put an error in front of somebody for the crime of opening an episode.',

  // --- metadata: falling back to the cache is the design, not a lapse -------------
  'metadata/index.ts:getTitleCached':
    'Serves stale metadata when the network fails. Deliberate and documented at the top of the file: offline should degrade to slightly-old data, never to an error.',
  'metadata/index.ts:getEpisodesCached': 'Same fallback as the title cache.',
  // `getProvidersCached` was on this list, with the same reason as its neighbours, and
  // the reason was wrong: falling back to stale *metadata* degrades gracefully, but
  // falling back to "no providers" is not old data — it is a claim that the title is on
  // no service anywhere, made from a network error. It reports its failure now, and this
  // guard's own stale-entry check is what insisted the excuse be removed with it. §6.58.
  'metadata/anilist.ts:getSeasonChain':
    'Anime season correction is a bonus on top of what TMDB gives. Failing to reach AniList leaves the flattened listing, which is what everyone had before.',
  'metadata/animeMapping.ts:lookupAnimeIds': 'Falls back to the mapping cache, as above.',
  'metadata/animeMapping.ts:resolveFromTmdb': 'Falls back to the mapping cache, as above.',

  // --- everything else ------------------------------------------------------------
  'devices/roku.ts:parseSsdpLocations':
    'A television that does not answer and a network with none on it are the same thing to look at: an empty device list with nothing to connect to. There is no second sentence worth saying.',
  'calendar/refresh.ts:requestRefresh':
    'A background pass that runs on a timer. A provider outage should not surface as an error on a screen nobody asked to refresh; the next pass tries again.',
  'data/storage.ts:readPreference':
    'A blocked or full key/value store falls back to the default. Documented at the top of the file: this must never be able to break marking an episode watched.',
  'sync/auth.ts:authStorageKey':
    'Falls back to the default session key when the worker id cannot be read. A wrong key logs a test worker out; there is nobody to tell.',
  'social/comments.ts:readFunctionError':
    'Digs the sentence out of an edge function\'s error response. Failing to find one leaves the caller with its generic message, which is the fallback by design.',

  // Two entries stood here until §6.59 read them back.
  //
  // `fetchBlocked` said it "feeds a filter, never a screen", and failing closed was the
  // safe direction. Half true: it feeds the filter *and* the Blocked section of the
  // People screen, which quietly disappeared on a failure — saying you had unblocked
  // everybody. It reports now, and the filter still reads the empty list, which is what
  // the safety argument was actually about.
  //
  // `fetchEdge` said the distinction was "worth distinguishing eventually" and had "not
  // been wired through". That is not a reason, it is a to-do wearing a reason's clothes
  // — and this file's neighbour in `people.ts` already spelled out the consequence in a
  // comment: a wrong query "does not throw, it returns `{ data: null, error }` and every
  // caller here reads that as 'you follow nobody'." Your own social graph, reported as
  // empty because a request failed. Both now return `{ people, failed }`.
  'social/contentWarnings.ts:fetchMyWarningVotes':
    'Your own positions, used to highlight buttons. Losing them shows no highlight rather than a wrong one.',
};

function readsIn(file: string): string[] {
  const source = readFileSync(resolve(ROOT, file), 'utf8');
  const found: string[] = [];
  let current = 'top-level';
  let inCatch = false;
  let depth = 0;

  for (const line of source.split('\n')) {
    // Crude but sufficient: a catch block ends at the brace that closes it.
    if (inCatch) {
      depth += (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0);
      if (depth <= 0) inCatch = false;
    }
    if (/\bcatch\b[^{]*\{/.test(line)) {
      inCatch = true;
      depth = 1;
    }
    const declared = /^(?:export )?(?:async )?function ([A-Za-z0-9_]+)|^const ([A-Za-z0-9_]+) = (?:async )?\(/.exec(line);
    if (declared) current = declared[1] ?? declared[2];
    // Two shapes, because they are not written the same way everywhere. `social/`
    // checks supabase-js's `error` and returns; the rest catch and return. Widening
    // the glob without widening this would have matched almost nothing outside
    // `social/` and looked like a clean sweep.
    const answered =
      /if \(error[^)]*\) return (\[\]|undefined|new Map\(\)|\{ *\})/.test(line) ||
      /^\s*return (\[\]|undefined|null|false|new Map\(\)|cached)/.test(line) && inCatch;
    if (answered) found.push(`${file.replace('core/src/', '')}:${current}`);
  }
  return found;
}

describe('reads that answer a failure with emptiness', () => {
  const reads = globSync('core/src/**/*.ts', { cwd: ROOT })
    .filter((f) => !f.includes('.test.') && !f.includes('/test/'))
    .flatMap(readsIn)
    .filter((read, i, all) => all.indexOf(read) === i);

  it.each(['social/', 'metadata/', 'devices/', 'data/', 'calendar/', 'sync/'])(
    'actually reaches %s',
    (area) => {
      // Per directory, not in total. A glob widened to four more places that silently
      // matches nothing in three of them is worse than not widening it — it reads as a
      // clean sweep and is an empty one.
      expect(reads.filter((read) => read.startsWith(area)).length).toBeGreaterThan(0);
    },
  );

  it('has a written reason for every one of them', () => {
    expect(reads.filter((read) => !(read in SILENT))).toEqual([]);
  });

  it('keeps no reason for a read that no longer does it', () => {
    // Otherwise the list fills up with excuses for code that was fixed, and nobody can
    // tell which ones still mean anything.
    expect(Object.keys(SILENT).filter((key) => !reads.includes(key))).toEqual([]);
  });
});
