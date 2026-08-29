import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { queryKey } from '../../../design/tmdbKey.mjs';
import { TMDB_BASE, TMDB_IMAGE } from '@reviewies/core/metadata/tmdb';
import { getConfig, setConfig } from '@reviewies/core/config';
import { ROOT } from './pairs';

const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

/**
 * The pass that photographs real data, and the two things that make it possible.
 *
 * Every other design pass runs on `FixtureProvider`: five titles of two or three short
 * words, `Episode {n}` for every name, one-sentence overviews and **no artwork at all**, so
 * every poster in thirty sprints of design record is the two-letter fallback. The token was
 * in `.env` the whole time and all three scripts blanked it. §6.151.
 *
 * Measured before building anything: **Chromium in this container has no outbound network**
 * — `example.com` and `registry.npmjs.org` fail with `ERR_CONNECTION_RESET` exactly as TMDB
 * does. So the pass is a snapshot taken by node and served from localhost, and the two
 * things it needs are a configurable endpoint and a stable filing key.
 */

describe('the real-data pass', () => {
  it('leaves TMDB as the default when nothing is configured', () => {
    /*
     * The whole risk of a configurable endpoint: a build that silently points somewhere
     * else. Absence has to mean TMDB, and the constants have to be the real hosts.
     */
    expect(TMDB_BASE).toBe('https://api.themoviedb.org/3');
    expect(TMDB_IMAGE).toBe('https://image.tmdb.org/t/p');
    setConfig({});
    expect(getConfig().tmdbBase).toBeUndefined();
    expect(getConfig().tmdbImage).toBeUndefined();
  });

  it('is bound on both platforms, or it is a field nothing fills', () => {
    // §6.115's shape, and this repo has had it twice: `app.json` held three empty strings
    // nothing interpolated, and `platform.ts` read three keys that never arrived.
    expect(read('app/src/data/platform.ts')).toContain('VITE_TMDB_BASE');
    expect(read('app/src/data/platform.ts')).toContain('VITE_TMDB_IMAGE');
    expect(read('mobile/app.config.ts')).toContain('EXPO_PUBLIC_TMDB_BASE');
    // The construct, not the word: `tmdbBase` appears twice in that file and §6.131's rule
    // is that a needle a file carries more than once proves nothing about either.
    expect(read('mobile/src/platform.ts')).toMatch(/tmdbBase: extra\.tmdbBase/);
  });

  it('files an answer under the question, not under a tidier one', () => {
    /*
     * The first snapshot fetched `append_to_response=external_ids,content_ratings,
     * release_dates` — what a thorough person fetches — and the provider asks for
     * `external_ids` alone. Different key, so a 404, so a screen with nothing on it.
     *
     * **A snapshot is a copy of the questions, not of the data**, and asking a better one
     * is asking a different one. §6.151.
     */
    expect(queryKey('/search/multi', { query: 'x', include_adult: 'false' })).toBe(
      'api/search/multi__include_adult=false&query=x.json',
    );
    // Sorted, so the key does not depend on the order a caller built its object in.
    expect(queryKey('/search/multi', { include_adult: 'false', query: 'x' })).toBe(
      queryKey('/search/multi', { query: 'x', include_adult: 'false' }),
    );
    expect(queryKey('/tv/95396')).toBe('api/tv/95396.json');
  });

  it('refuses to hand back a photograph of an empty screen', () => {
    /*
     * §6.146's lesson, written into the pass that most needs it: this one asserts almost
     * nothing about content — it cannot, its content is whatever TMDB said — so the one
     * thing it must refuse is the failure mode of a harness pointed at nothing. The first
     * run of it did exactly that and said so, five times, rather than filing screenshots
     * of a search box with no results.
     */
    const source = read('design/capture-real.mjs');
    /*
     * In two halves since §6.160, and both are asserted.
     *
     * The needle-check used to be written out inside this pass's own `shot`; it moved into
     * `design/shoot.mjs` with the shot itself, so reading only this file for the words
     * "nothing on it says" would now pass a pass that had stopped handing its shots
     * anything to look for. What each half owns: this file supplies the needle, the shot
     * refuses the photograph without it, and this file is the one that can fail the run.
     */
    expect(source, 'the pass gives its shots nothing to look for').toMatch(
      /shoot\(page, \{[^)]*mustContain/,
    );
    expect(read('design/shoot.mjs'), 'the shot does not check it reached anything').toMatch(
      /problems\.push\(\s*`\$\{name\}: nothing on it says/,
    );
    expect(source, 'the pass cannot fail').toContain('process.exitCode = 1');
    // And the server says which answer was missing, rather than 404ing silently.
    expect(read('design/serveSnapshot.mjs')).toContain('snapshot has no answer for');
  });

  it('answers the preflight the provider forces', () => {
    /*
     * `Authorization: Bearer …` makes every request non-simple, so the browser asks
     * `OPTIONS` first. The first run of the pass photographed the network-failure state on
     * every screen because this was a 404, which looks exactly like a provider with nothing
     * in it.
     */
    const source = read('design/serveSnapshot.mjs');
    expect(source).toContain("req.method === 'OPTIONS'");
    expect(source).toContain('access-control-allow-headers');
  });
});
