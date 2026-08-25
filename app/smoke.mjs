/**
 * End-to-end smoke check of the core loop, driven in a real browser.
 *
 * Verifies the flow the whole product is judged on: find a show, track it, see it in
 * Up Next with a remaining count, mark an episode watched, and confirm the count
 * moves. Then exercises Watching Mode and export.
 *
 * Run against `npm run preview`. Screenshots land in ./screenshots.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:4173';
const OUT = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

/**
 * A real DioCache.db with real write-ahead frames, built by real SQLite.
 *
 * The second film is written after a checkpoint, so it exists only in the -wal —
 * which is the whole point. Both files are copied while the connection is still open,
 * because closing SQLite checkpoints and deletes the log.
 */
function buildDioCache() {
  const dir = mkdtempSync(join(tmpdir(), 'smoke-dio-'));
  const path = join(dir, 'DioCache.db');

  const movie = (uuid, name) => ({
    status: 'success',
    data: {
      type: 'list',
      objects: [
        {
          uuid,
          entity_type: 'movie',
          rewatch_count: 0,
          watched_at: '2026-02-01T20:00:00Z',
          filter: ['watched'],
          extended: { is_watched: true },
          meta: { uuid, name, runtime: 6000 },
        },
      ],
    },
  });

  const script = [
    "const fs = require('node:fs');",
    "const { DatabaseSync } = require('node:sqlite');",
    `const p = ${JSON.stringify(path)};`,
    'const db = new DatabaseSync(p);',
    'db.exec("pragma journal_mode = wal");',
    'db.exec("create table cache_dio (key text, subKey text, max_age_date integer, ' +
      'max_stale_date integer, content BLOB, statusCode integer, headers BLOB, ' +
      'primary key (key, subKey))");',
    'const put = (k, o) => db.prepare("insert into cache_dio values (?,?,?,?,?,?,?)")' +
      '.run(k, "s", 0, 0, Buffer.from(JSON.stringify(o)), 200, Buffer.from("{}"));',
    `put('checkpointed', ${JSON.stringify(movie('m1', 'Checkpointed Film'))});`,
    // Padding, so the checkpoint has whole pages to move.
    "for (let i = 0; i < 200; i++) put('pad' + i, { junk: 'x'.repeat(200) });",
    'db.exec("pragma wal_checkpoint(full)");',
    `put('walonly', ${JSON.stringify(movie('m2', 'Only In The Log'))});`,
    "fs.copyFileSync(p, p + '.copy');",
    "fs.copyFileSync(p + '-wal', p + '.copy-wal');",
  ].join('\n');

  execFileSync(process.execPath, ['-e', script], { stdio: 'pipe' });

  return { db: readFileSync(path + '.copy'), wal: readFileSync(path + '.copy-wal'), dir };
}

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// The environment ships a pinned Chromium; point at it rather than downloading one.
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => check('no page errors', false, e.message));

try {
  // --- Empty state -----------------------------------------------------------
  await page.goto(BASE, { waitUntil: 'networkidle' });
  check('app loads', await page.getByRole('heading', { name: 'Up Next' }).isVisible());
  check('empty state explains itself', (await page.getByText('Nothing tracked yet.').count()) > 0);
  await page.screenshot({ path: OUT + '01-empty.png' });

  // --- Is this build signed in to anything? -----------------------------------
  //
  // Several checks below are about what an account-gated control does, and the answer
  // differs depending on whether the build has Supabase credentials. Asserting the
  // credential-free answer unconditionally used to look fine, because it was written
  // against a build with no `.env` — and `vite.config.ts` sets `envDir: '..'`, so an
  // ordinary build in this repository picks up the root `.env` and takes the other
  // branch. The run then failed on a correct app.
  //
  // So ask the app, once, and hold the answer.
  await page.goto(new URL('account', BASE + '/').href, { waitUntil: 'networkidle' });
  const configured = !/not configured on this build/i.test(await page.locator('body').innerText());
  console.log(`(build is ${configured ? 'configured for sync' : 'credential-free'})`);
  await page.goto(BASE, { waitUntil: 'networkidle' });

  // --- Search and track ------------------------------------------------------
  await page.getByRole('link', { name: /Find something to watch/i }).click();
  await page.getByPlaceholder('Shows, films, anime…').fill('long');
  await page.waitForSelector('text=The Long Dark', { timeout: 5000 });
  check('search returns results', true);
  await page.screenshot({ path: OUT + '02-search.png' });

  await page.getByRole('button', { name: 'Track', exact: true }).first().click();
  await page.waitForSelector('text=Tracking', { timeout: 5000 });

  // --- Up Next ---------------------------------------------------------------
  await page.getByRole('link', { name: /Up Next/ }).click();
  await page.waitForSelector('text=The Long Dark', { timeout: 5000 });

  const row = page.locator('li').filter({ hasText: 'The Long Dark' }).first();
  await row.waitFor({ timeout: 5000 });
  const rowText = (await row.innerText()).replace(/\s+/g, ' ');
  check('Up Next offers the first episode', /S1E1\b/.test(rowText), rowText);

  const remainingText = await page.locator('text=/more episodes/').first().textContent();
  check('shows a remaining count, not a vague badge', /\d+ more episodes/.test(remainingText ?? ''), remainingText?.trim());
  await page.screenshot({ path: OUT + '03-upnext.png' });

  // --- Mark watched ----------------------------------------------------------
  await page.getByRole('button', { name: /Mark The Long Dark S1E1 watched/i }).click();

  // Opening the conversation after marking watched is how TV Time worked and was named
  // as a failing in two of its successors — but only when there is an account behind
  // it, because an empty comments page is a dead end. Both halves of that rule are
  // worth asserting; which one applies depends on the build, and the check has to come
  // before anything that looks at Up Next, because in one of the two it is no longer
  // the page being looked at.
  if (configured) {
    await page.waitForURL(/\/comments\//, { timeout: 5000 });
    check('marking watched opens the conversation when there is one', true, page.url());
    await page.getByRole('link', { name: /Up Next/ }).click();
    await page.waitForSelector('text=The Long Dark', { timeout: 5000 });
  } else {
    check('marking watched stays put without an account', page.url().endsWith('/'), page.url());
  }

  await page.waitForSelector('text=/S1E2/', { timeout: 5000 });
  check('marking watched advances to the next episode', true);

  const after = await page.locator('text=/more episodes/').first().textContent();
  const before = Number(remainingText?.match(/(\d+)/)?.[1]);
  const now = Number(after?.match(/(\d+)/)?.[1]);
  check('remaining count decrements', now === before - 1, `${before} → ${now}`);
  await page.getByRole('link', { name: /Data/ }).click();
  await page.waitForSelector('text=Open the conversation after marking watched', { timeout: 5000 });
  check('the preference for it is offered', true);
  await page.getByRole('link', { name: /Up Next/ }).click();

  // --- Watching Mode ---------------------------------------------------------
  await page.getByRole('link', { name: 'Watch along' }).first().click();
  await page.waitForSelector('text=Start watching', { timeout: 5000 });
  check('Watching Mode opens', true);
  await page.screenshot({ path: OUT + '04-watching-start.png' });

  await page.getByRole('button', { name: 'Start watching' }).click();
  await page.waitForTimeout(1200);

  await page.getByRole('button', { name: 'Cliffhanger' }).click();
  await page.getByRole('button', { name: 'Reveal' }).click();
  check('reactions can be recorded', true);

  const reactionCount = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('reviewies');
        req.onsuccess = () => {
          const tx = req.result.transaction('reactions', 'readonly');
          const count = tx.objectStore('reactions').count();
          count.onsuccess = () => resolve(count.result);
        };
      }),
  );
  check('reactions persist to IndexedDB', reactionCount === 2, `${reactionCount} stored`);

  await page.getByPlaceholder('Search any emoji…').fill('twist');
  await page.waitForTimeout(300);
  check('emoji search filters the pad', (await page.getByRole('button', { name: 'Mind blown' }).count()) > 0);
  await page.screenshot({ path: OUT + '05-watching-live.png' });

  // --- Extension auto-sync ---------------------------------------------------
  // Simulate what the extension's content script posts into the page and confirm
  // the clock follows it instead of needing a manual start.
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('link', { name: /Up Next/ }).click();
  await page.getByRole('link', { name: 'Watch along' }).first().click();
  await page.waitForSelector('text=Start watching', { timeout: 5000 });

  await page.evaluate(() => {
    window.postMessage(
      {
        type: 'reviewies:playback',
        payload: { positionMs: 754000, durationMs: 3000000, paused: false, at: Date.now() },
      },
      window.location.origin,
    );
  });
  await page.waitForTimeout(600);

  const syncedText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('extension position drives the clock', /12:3\d/.test(syncedText), syncedText.slice(0, 90));
  check('auto-sync replaces the manual start prompt', !/Start watching/.test(syncedText));
  await page.screenshot({ path: OUT + '11-autosync.png' });

  await page.evaluate(() => {
    // A stale reading must be ignored rather than freezing the clock.
    window.postMessage(
      {
        type: 'reviewies:playback',
        payload: { positionMs: 1000, durationMs: 3000000, paused: false, at: Date.now() - 60000 },
      },
      window.location.origin,
    );
  });
  await page.waitForTimeout(400);
  const afterStale = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('stale readings are ignored', !/0:0\d/.test(afterStale), afterStale.slice(0, 90));

  // --- Watchlist with notes --------------------------------------------------
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('link', { name: /Search/ }).click();
  await page.getByPlaceholder('Shows, films, anime…').fill('quiet');
  await page.waitForSelector('text=Quiet Harbour', { timeout: 5000 });
  await page.getByRole('button', { name: 'Watchlist', exact: true }).first().click();
  await page.getByPlaceholder(/Why\?/).fill('Ana recommended');
  await page.getByRole('button', { name: 'Save' }).click();

  await page.getByRole('link', { name: /Watchlist/ }).click();
  await page.waitForSelector('text=Quiet Harbour', { timeout: 5000 });
  const noteShown = await page
    .getByText('Ana recommended')
    .first()
    .waitFor({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  check(
    'watchlist note is saved and shown',
    noteShown,
    noteShown ? '' : (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 200),
  );
  await page.screenshot({ path: OUT + '06-watchlist.png' });

  // --- Spoiler-free quick log --------------------------------------------------
  // Logging a film must not require opening its page, which is covered in other
  // people's ratings and its own synopsis.
  await page.getByRole('link', { name: /Search/ }).click();
  await page.getByPlaceholder('Shows, films, anime…').fill('quiet');
  await page.waitForSelector('text=Quiet Harbour', { timeout: 5000 });
  const beforeUrl = page.url();
  await page.getByRole('button', { name: 'Seen it' }).first().click();
  await page.waitForSelector('text=Logged', { timeout: 5000 });
  check('a film can be logged without leaving search', page.url() === beforeUrl, page.url());

  // --- Spoiler-free catch-up ---------------------------------------------------
  await page.getByRole('link', { name: /Up Next/ }).click();
  await page.waitForSelector('text=The Long Dark', { timeout: 5000 });
  await page.getByRole('button', { name: 'Caught up further?' }).first().click();
  // Two-season fixture, so the season step comes first.
  await page.waitForSelector('text=/^Season$/', { timeout: 5000 });
  const sheet = await page.locator('div.rounded-t-3xl').innerText();
  // The whole point of the control: numbers, and no episode names anywhere.
  check(
    'catch-up picker shows no episode names',
    !/Pilot|Thaw|Episode \d/.test(sheet),
    sheet.replace(/\s+/g, ' ').slice(0, 140),
  );
  await page.screenshot({ path: OUT + '15-catchup.png' });

  await page.getByRole('button', { name: '2', exact: true }).first().click();
  await page.waitForSelector('text=/Last episode you watched in season 2/', { timeout: 5000 });
  await page.screenshot({ path: OUT + '16-catchup-episodes.png' });
  await page.getByRole('button', { name: '4', exact: true }).first().click();
  await page.waitForSelector('text=/Marked \\d+ episode/', { timeout: 5000 });
  const markedText = (await page.locator('text=/Marked/').first().innerText()).replace(/\s+/g, ' ');
  // 18 aired episodes; one was already watched above, so 11 of the first 12 remain.
  check('catching up marks the whole run at once', /Marked 11 episodes/.test(markedText), markedText);
  await page.getByRole('button', { name: 'Done' }).click();

  const afterCatchUp = await page.locator('text=/more episodes|Last one/').first().textContent();
  check('Up Next moves on after catching up', /more episodes|Last one/.test(afterCatchUp ?? ''), afterCatchUp?.trim());

  // --- A finished show completes itself ----------------------------------------
  // r/serializd, about a competitor: "I have over 100 shows stuck in Currently
  // Watching." Kitchen Nightshift is the ended fixture.
  await page.getByRole('link', { name: /Search/ }).click();
  await page.getByPlaceholder('Shows, films, anime…').fill('kitchen');
  await page.waitForSelector('text=Kitchen Nightshift', { timeout: 5000 });
  await page.getByRole('button', { name: 'Track', exact: true }).first().click();
  await page.waitForSelector('text=Tracking', { timeout: 5000 });

  await page.getByRole('link', { name: /Up Next/ }).click();
  const kitchen = page.locator('li').filter({ hasText: 'Kitchen Nightshift' }).first();
  await kitchen.waitFor({ timeout: 5000 });
  await kitchen.getByRole('button', { name: 'Caught up further?' }).click();
  await page.waitForSelector('text=/Last episode you watched/', { timeout: 5000 });
  await page.getByRole('button', { name: '12', exact: true }).first().click();
  // Completing the show removes its Up Next row. The confirmation must outlive that,
  // or the sheet just disappears and nothing tells you it worked.
  await page.waitForSelector('text=/Marked \\d+ episode/', { timeout: 5000 });
  check('the catch-up confirmation survives the row disappearing', true);
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(400);

  const libStatus = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('reviewies');
        req.onsuccess = () => {
          const store = req.result.transaction('library', 'readonly').objectStore('library');
          const all = store.getAll();
          all.onsuccess = () =>
            resolve(all.result.filter((r) => r.kind === 'show').map((r) => r.status).sort());
        };
      }),
  );
  check('a finished show completes itself', libStatus.includes('completed'), JSON.stringify(libStatus));
  // The one still airing must not be swept up with it.
  check('a show still airing stays in watching', libStatus.includes('watching'), JSON.stringify(libStatus));

  // --- Upcoming --------------------------------------------------------------
  await page.getByRole('link', { name: /Upcoming/ }).click();
  await page.waitForSelector('text=Tell me about', { timeout: 5000 });
  const upcomingText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('upcoming offers notification granularity', /Premieres & finales/.test(upcomingText));
  check('milestones is the default', /The moments worth knowing about/.test(upcomingText));
  await page.screenshot({ path: OUT + '10-upcoming.png' });

  // --- Discover --------------------------------------------------------------
  await page.getByRole('link', { name: /Discover/ }).click();
  await page.waitForSelector('text=Nothing you have already watched', { timeout: 5000 });
  await page.waitForTimeout(800);
  // Check the suggested titles specifically, not the whole page: a tracked show
  // legitimately appears in the "Because you watched…" attribution.
  const suggestedTitles = await page.locator('li p.font-medium').allInnerTexts();
  check(
    'discover excludes what you already track',
    !suggestedTitles.includes('The Long Dark'),
    suggestedTitles.join(', '),
  );
  check('discover suggests something', suggestedTitles.length > 0, `${suggestedTitles.length} suggested`);
  check(
    'discover explains why',
    /Because you watched The Long Dark/.test((await page.locator('body').innerText()).replace(/\s+/g, ' ')),
  );
  await page.screenshot({ path: OUT + '09-discover.png' });

  // --- Stats -----------------------------------------------------------------
  await page.getByRole('link', { name: /Stats/ }).click();
  await page.waitForSelector('text=Most watched', { timeout: 5000 });
  const statsText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('stats show runtime-weighted totals', /Watched/.test(statsText) && /Episodes/.test(statsText), statsText.slice(0, 120));
  check('stats list the most-watched title', /The Long Dark/.test(statsText));
  await page.screenshot({ path: OUT + '08-stats.png' });

  // --- Ratings and poster override -------------------------------------------
  await page.getByRole('link', { name: /Up Next/ }).click();
  await page.locator('li').filter({ hasText: 'The Long Dark' }).first().locator('a').first().click();
  await page.waitForSelector('text=Season 1', { timeout: 8000 });

  await page.getByRole('button', { name: '4 stars' }).first().click();
  await page.waitForTimeout(400);
  const rated = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('title can be rated in half stars', /4\.0/.test(rated), rated.slice(0, 80));

  // Tapping the same star again clears it — the escape from a mis-tap.
  await page.getByRole('button', { name: '4 stars' }).first().click();
  await page.waitForTimeout(400);
  const cleared = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('tapping the same star clears the rating', !/4\.0/.test(cleared));

  // --- Where to watch ----------------------------------------------------------
  await page.waitForSelector('text=Where to watch', { timeout: 5000 });
  const wtw = await page.locator('section', { hasText: 'Where to watch' }).first().innerText();
  check('where-to-watch lists a service', /Example Streaming/.test(wtw), wtw.replace(/\s+/g, ' ').slice(0, 120));
  // TMDB requires this wherever availability data appears; it is a licence condition.
  check('JustWatch attribution appears with the data', /JustWatch/.test(wtw));

  // Availability is per country, so answering for one silently would be confidently
  // wrong for most of the world.
  await page.getByRole('button', { name: 'United States', exact: true }).click();
  await page.getByRole('button', { name: 'GB', exact: true }).click();
  await page.waitForTimeout(400);
  const afterRegion = await page.locator('section', { hasText: 'Where to watch' }).first().innerText();
  check('the country can be changed', /United Kingdom/.test(afterRegion), afterRegion.replace(/\s+/g, ' ').slice(0, 90));

  check(
    'poster override is offered',
    (await page.getByText('Use a different poster').count()) > 0,
  );
  // Lists need an account, so "Add to list" correctly hides itself in this
  // credential-free build — same rule as the remote drawer. Its presence with sync
  // configured is covered by the lists unit tests.
  check(
    configured ? 'add-to-list is offered when signed in' : 'add-to-list is hidden without an account',
    ((await page.getByText('Add to list').count()) > 0) === configured,
  );
  // Content warnings are a community aggregate, so they need an account too. Their
  // ordering and verdict logic is covered by unit tests; what matters here is that a
  // credential-free build shows no dead control.
  check(
    configured
      ? 'content warnings are offered when signed in'
      : 'content warnings are hidden without an account',
    ((await page.getByRole('button', { name: 'Content warnings' }).count()) > 0) === configured,
  );
  await page.screenshot({ path: OUT + '13-title.png' });

  // --- People ----------------------------------------------------------------
  await page.getByRole('link', { name: /Data/ }).click();
  await page.getByRole('link', { name: /People/ }).click();
  await page.waitForSelector('h1:text("People")', { timeout: 5000 });
  const peopleText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  // Empty either way, and it must say which kind of empty rather than showing a search
  // box that can never return anything. The two reasons are different — the feature is
  // unavailable in this build, or it is available and you are signed out — and telling
  // someone the wrong one sends them looking for a setting that is not there.
  check(
    'people screen explains what it needs',
    configured ? /Sign in/i.test(peopleText) : /works without it/.test(peopleText),
    peopleText.slice(0, 140),
  );
  await page.screenshot({ path: OUT + '14-people.png' });
  await page.goBack();

  // --- Remote drawer ---------------------------------------------------------
  // With no relay configured the drawer must not appear at all: an inert remote
  // is worse than none.
  check(
    'remote drawer is hidden when no bridge is configured',
    (await page.getByRole('button', { name: 'Open remote' }).count()) === 0,
  );

  // --- Importing an archive ----------------------------------------------------
  // Doc 8 §3: the GDPR zip is how most people got their data out of TV Time, and
  // every tracker in the field is judged on whether it can read one.
  await page.getByRole('link', { name: /Data/ }).click();
  await page.waitForSelector('text=Choose files', { timeout: 5000 });

  const zip = Buffer.from(
    zipSync({
      'export/episodes.csv': strToU8(
        'show,season,number,name,seen,seen_date,times_watched,air_date,show_id,episode_id\n' +
          'Rescued Show,1,1,Pilot,True,2026-01-05,2,2026-01-01,900,4001',
      ),
      'export/readme.txt': strToU8('not data'),
    }),
  );
  await page.locator('input[type=file]').last().setInputFiles({
    name: 'tvtime-export.zip',
    mimeType: 'application/zip',
    buffer: zip,
  });
  await page.waitForSelector('text=/Imported \\d+ watch/', { timeout: 10000 });

  const importText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  // times_watched of 2 must survive: rewatch counts are the whole reason watches are
  // modelled as events.
  check('a GDPR-style zip imports', /Imported 2 watches/.test(importText), importText.slice(0, 160));
  check(
    'each file in the zip is accounted for',
    /episodes\.csv/.test(importText) && /readme\.txt/.test(importText),
  );
  // Silence is the failure mode every competitor has: "imported!" while dropping half.
  check('an unreadable file is named, not silently dropped', /Not recognised/.test(importText));
  await page.getByText(/Imported \d+ watch/).scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + '17-import.png' });

  // --- Recovering a DioCache.db in the browser ---------------------------------
  // This is the claim doc 8 §3.1 rests on, and the only place SQLite-in-WebAssembly
  // is exercised in a real browser: rows written after a checkpoint live only in the
  // -wal, so importing the pair must find them and the .db alone must not.
  const dio = buildDioCache();
  await page.locator('input[type=file]').last().setInputFiles([
    { name: 'DioCache.db', mimeType: 'application/octet-stream', buffer: dio.db },
    { name: 'DioCache.db-wal', mimeType: 'application/octet-stream', buffer: dio.wal },
  ]);
  await page.waitForSelector('text=/TV Time cache/', { timeout: 30000 });

  const dioText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('a DioCache.db is read in the browser', /TV Time cache/.test(dioText), dioText.match(/DioCache\.db — [^\n]{0,60}/)?.[0]);
  check(
    'the write-ahead log is merged, not ignored',
    /Recovered \d+ page\(s\) from the write-ahead log/.test(dioText),
  );
  check('the -wal was paired automatically, not asked for twice', !/No DioCache.db-wal was supplied/.test(dioText));

  const recovered = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('reviewies');
        req.onsuccess = () => {
          const all = req.result.transaction('watches', 'readonly').objectStore('watches').getAll();
          all.onsuccess = () =>
            resolve(all.result.map((w) => w.targetId).filter((id) => id.startsWith('local:movie:')));
        };
      }),
  );
  // The film written after the checkpoint is the one the .db alone would lose.
  check(
    'a film that exists only in the -wal is recovered',
    recovered.includes('local:movie:only-in-the-log'),
    JSON.stringify(recovered),
  );
  await page.getByText(/TV Time cache/).scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + '18-diocache.png' });
  rmSync(dio.dir, { recursive: true, force: true });

  // --- Export ----------------------------------------------------------------
  await page.getByRole('link', { name: /Data/ }).click();
  await page.waitForSelector('text=Export everything (JSON)', { timeout: 5000 });

  const download = await Promise.race([
    page.waitForEvent('download', { timeout: 5000 }),
    page.getByRole('button', { name: /Export everything/ }).click().then(() => null),
  ]).catch(() => null);
  const exported = await page.waitForEvent('download', { timeout: 5000 }).catch(() => download);
  check('export produces a file', Boolean(exported), exported?.suggestedFilename?.());
  await page.screenshot({ path: OUT + '07-data.png' });
} catch (err) {
  check('smoke run completed', false, err.message);
} finally {
  await browser.close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
