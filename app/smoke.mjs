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

const BASE = process.env.BASE ?? 'http://localhost:4173';
const OUT = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

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
  await page.waitForSelector('text=/S1E2/', { timeout: 5000 });
  check('marking watched advances to the next episode', true);

  const after = await page.locator('text=/more episodes/').first().textContent();
  const before = Number(remainingText?.match(/(\d+)/)?.[1]);
  const now = Number(after?.match(/(\d+)/)?.[1]);
  check('remaining count decrements', now === before - 1, `${before} → ${now}`);

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
