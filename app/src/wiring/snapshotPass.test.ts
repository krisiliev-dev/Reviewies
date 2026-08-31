import { describe, expect, it } from 'vitest';
import { stripComments } from '@reviewies/core/test/source';
import { existsSync, readFileSync } from 'node:fs';
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

  /**
   * Every question the provider always asks, asked by the snapshot too.
   *
   * ## What this found
   *
   * `TmdbProvider.genres()` fetches `/genre/tv/list` and `/genre/movie/list` once per
   * provider and holds the id → name table for its life, because a *list* endpoint returns
   * `genre_ids: [18, 10765]` and only that table turns them into words. `design/snapshot.mjs`
   * never fetched either. It is written to degrade quietly — a failure there is not a search
   * failure, so the table comes back empty and every result carries no genres — so nothing
   * broke, nothing logged in the app, and the two 404s scrolled past in the capture output
   * among two hundred lines of Metro.
   *
   * The consequence is a hole in the design record that neither pass could show on its own.
   * `boxUnder` in `core/src/ui/box.ts` composes the line under a box's title as **genre, then
   * year**, and `box.ts` argues at length for those being the two facts a spine carries
   * besides the name. The fixture pass photographs *Drama · 2024* under a blank monogram
   * plate; the real pass photographs a real poster under *2001*. Thirty sprints of design
   * review, two passes, and a box with both an image and its own second fact has never been
   * photographed once.
   *
   * ## Why fixed paths only
   *
   * `/tv/${id}/season/${n}` cannot be checked this way and should not be: which titles the
   * snapshot holds is `LIBRARY`'s decision, and a clause insisting on every possible id
   * would be asserting a different thing badly. What is checkable is the set of endpoints the
   * provider asks for **whatever the library is** — the ones written as literals — and those
   * are exactly the ones a snapshot can silently omit for ever, because no title being
   * missing is what makes them noticeable.
   *
   * One direction only. The snapshot fetching `/configuration`, which the provider does not,
   * costs one response and answers a question somebody may add.
   */
  it('copies every question the provider asks at a fixed address', () => {
    const provider = read('core/src/metadata/tmdb.ts');
    const asked = [
      ...new Set([...provider.matchAll(/this\.get<[^>]*>\(\s*'(\/[^']+)'/g)].map((m) => m[1])),
    ];
    // The clause has to be able to fail for its own subject: a regex that stopped matching
    // would pass an empty set against anything. §6.121's shape, which this file's neighbours
    // have three entries about.
    expect(asked.length, 'nothing in TmdbProvider looks like a fixed endpoint any more')
      .toBeGreaterThan(2);
    expect(asked, 'the genre table is the endpoint this clause was written for')
      .toContain('/genre/tv/list');

    const snapshot = read('design/snapshot.mjs');
    for (const path of asked) {
      /*
       * The **call**, not the string. `design/snapshot.mjs` is a file of paragraphs about
       * which questions it copies and why, so a bare `toContain(path)` would be answered by
       * a comment describing the endpoint it forgot to fetch — which is the failure one
       * altitude up from the one this whole clause is about.
       *
       * **And comments are stripped first, which the call-shaped needle alone did not do.**
       * A re-plant in the main checkout commented the fetch out — `// await
       * api('/genre/tv/list');` — and this clause passed, because a commented-out call is
       * still a call as far as a regex is concerned. That is the likelier real form than a
       * paragraph mentioning an endpoint: somebody silences a fetch to debug something and
       * the line stays. `stripComments` is what every other file here uses for this, and it
       * was the missing half.
       */
      expect(
        stripComments(snapshot),
        `design/snapshot.mjs never fetches ${path}, which TmdbProvider asks for on every run — ` +
          'so the real-data design passes photograph a screen the product would not draw',
      ).toMatch(new RegExp(`api\\(\\s*'${path.replace(/\//g, '\\/')}'`));
    }
  });

  /**
   * And the snapshot **on disk** answers them, which the clause above cannot see.
   *
   * ## Measured, not asserted
   *
   * The clause above reads `design/snapshot.mjs` and checks it *asks*. That fix was merged.
   * Then a checkout was handed a `design/real/` taken before it — no `api/genre/` directory
   * at all — and the whole clause above passed, seven of seven, while every real-data box in
   * the run that followed drew **year only** because `TmdbProvider.genres()` swallowed two
   * 404s and handed back an empty map. The photographs were of a screen the product would
   * not draw, which is the one thing this whole file exists to refuse.
   *
   * So the source clause was green for the defect it was written for. That is not a
   * criticism of it — it is the right clause, one file short. A snapshot is a copy of the
   * questions, and a copy taken before a question was added does not have the answer.
   *
   * ## Why only the endpoints asked with no parameters
   *
   * `queryKey` files an answer under the path *and* the query, so `/search/multi` lives at
   * `api/search/multi__include_adult=false&query=….json` and a fixed path alone does not
   * name a file. `/tv/{id}` is `LIBRARY`'s decision and the clause above says why not to
   * assert on it. What is left is the set a snapshot can silently omit for ever **and** whose
   * filename is fully determined: a literal path asked with `{}`. Today that is the two genre
   * lists. It is derived from the provider rather than typed here, so a third one is covered
   * the day somebody writes it.
   *
   * ## Skipped, not passed, when there is no snapshot
   *
   * `design/real/` is gitignored and 534 MB, so most checkouts do not have it. A missing
   * directory is not zero missing answers — §6.187 and `design/unread.mjs`'s
   * `missingShotDirs` are the same distinction — so this reports as **skipped** in the run
   * rather than as another green tick. "I cannot look" and "there is nothing wrong" are
   * different answers and only one of them is about the snapshot.
   */
  const SNAPSHOT = resolve(ROOT, 'design/real');
  it.skipIf(!existsSync(SNAPSHOT))('has an answer on disk for the questions it cannot miss', () => {
    const provider = read('core/src/metadata/tmdb.ts');
    const fixed = [
      ...new Set(
        [...stripComments(provider).matchAll(/this\.get<[^>]*>\(\s*'(\/[^']+)',\s*\{\}/g)].map(
          (m) => m[1],
        ),
      ),
    ];
    // The clause has to be able to fail for its own subject. §6.121, and the clause above
    // carries the same guard against a regex that has quietly stopped matching.
    expect(fixed, 'nothing in TmdbProvider is asked at a fixed address with no parameters')
      .toContain('/genre/tv/list');

    for (const path of fixed) {
      const file = queryKey(path);
      const where = resolve(SNAPSHOT, file);
      expect(
        existsSync(where),
        `design/real/${file} is not in the snapshot, and TmdbProvider asks for ${path} on ` +
          'every run — so `genres()` catches the 404, hands back an empty map, and the ' +
          'real-data passes photograph boxes with no genre on them. Re-take it with ' +
          '`npm run design:snapshot`, or fetch that one answer; the snapshot on disk is ' +
          'older than `design/snapshot.mjs`.',
      ).toBe(true);

      /*
       * And the answer says something.
       *
       * Existence alone is not the property. Planted and measured: `{"genres":[]}` in place
       * of the real table passes an existence check and draws **the identical screen** to
       * the 404 — `for (const g of list.genres ?? [])` iterates nothing, the map comes back
       * empty, `toResult` filters every id to nothing and returns `undefined` rather than
       * `[]` on purpose, and `boxUnder` composes the year alone. An empty envelope is a 404
       * wearing a 200, and a guard that cannot tell them apart is not guarding the screen.
       *
       * The rule is *at least one populated array*, rather than the word `genres`, for the
       * same reason the path list is derived rather than typed: this clause should not know
       * which endpoint it is looking at. Every list answer TMDB gives is an object with an
       * array in it, and no library decision is being asserted — which titles the snapshot
       * holds is still entirely `LIBRARY`'s, and this says nothing about them.
       */
      const populated = (value: unknown): boolean =>
        Array.isArray(value)
          ? value.length > 0
          : !!value && typeof value === 'object' && Object.values(value).some(populated);
      expect(
        populated(JSON.parse(readFileSync(where, 'utf8'))),
        `design/real/${file} holds no rows, and an empty answer draws the same screen a 404 ` +
          `does: \`genres()\` builds an empty map either way. Re-take the snapshot rather ` +
          'than leaving a file that only looks like an answer.',
      ).toBe(true);
    }
  });

  /**
   * The shutter puts the **pointer** back, for the reason it already puts the scroll back.
   *
   * ## What it photographed
   *
   * `narrow-title-severance.png` showed four filled stars under the heading *Your rating*, on
   * a title the harness had tracked and never rated. `wide-title-severance.png`, same build,
   * same data, same run, showed five empty ones. The difference is where the mouse was:
   * `capture-web-real.mjs` reaches a title page by clicking the show's name in Up Next, the
   * cursor stays at that coordinate through the navigation, and `StarRating` paints
   * `hover ?? value ?? 0` — so on the narrow layout the title's block lands over the fourth
   * star and the shot is of a rating nobody gave. At 1280 the same block centre lands past
   * the fifth star and the control draws empty.
   *
   * A design record whose shots show state the product is not in is the failure the whole
   * `mustContain` clause above exists to refuse, arriving through a different door. And it is
   * `design/shoot.mjs`'s own precedent, one axis over: that file already scrolls every element
   * back to the top after a foot shot, and says why — *"a shot taken at somebody else's scroll
   * position is #172"*. A shot taken at somebody else's **pointer** position is the same
   * sentence.
   *
   * ## Why the order is the assertion
   *
   * Moving the pointer *after* the screenshot satisfies any check for the call and fixes
   * nothing, which is the plant this clause was widened against. So the two are located in the
   * source and compared: the move has to come first.
   */
  it('puts the pointer somewhere harmless before the shutter, not after', () => {
    const source = read('design/shoot.mjs');
    // `await page.mouse.move(` rather than the bare phrase: this file is mostly prose about
    // what it does, and a paragraph describing the move would otherwise answer for it.
    const moved = source.indexOf('await page.mouse.move(');
    expect(
      moved,
      'design/shoot.mjs never moves the pointer, so every shot is taken wherever the last click ' +
        'left it and any control under it is photographed in its hover state',
    ).toBeGreaterThan(-1);
    const shutter = source.indexOf('page.screenshot');
    expect(shutter, 'design/shoot.mjs no longer takes a screenshot').toBeGreaterThan(-1);
    expect(
      moved,
      'design/shoot.mjs moves the pointer after the shutter, which photographs the hover state ' +
        'and then tidies up',
    ).toBeLessThan(shutter);
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
