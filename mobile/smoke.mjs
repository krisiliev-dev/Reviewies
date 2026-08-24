/**
 * End-to-end check of the native app, rendered through react-native-web.
 *
 * This is not a substitute for running on a device — it cannot see haptics, the
 * local-network entitlement, or how anything feels. What it does prove, on every
 * change, is the part most likely to break silently: that the app boots, binds
 * SQLite, and that the core loop the whole product is judged on still works against
 * a real database rather than a mock.
 *
 * Run against `npx expo export --platform web && npx serve dist`.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4200';
const OUT = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

try {
  // --- Boot ------------------------------------------------------------------
  // The layout gates rendering on the platform bindings, so reaching Up Next at all
  // means SQLite opened and the core was wired up.
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Up Next', { timeout: 20000 });
  check('app boots and binds SQLite', true);
  check('empty state explains itself', (await text()).includes('Nothing tracked yet.'));
  await page.screenshot({ path: OUT + '1-empty.png' });

  // --- Search and track ------------------------------------------------------
  await page.getByText('Find something to watch').click();
  await page.getByPlaceholder('Shows, films, anime…').fill('long');
  await page.waitForSelector('text=The Long Dark', { timeout: 15000 });
  check('search returns results', true);
  await page.screenshot({ path: OUT + '2-search.png' });

  await page.getByText('Track', { exact: true }).first().click();
  await page.waitForSelector('text=Tracking', { timeout: 15000 });
  check('tracking a show persists', true);

  // --- Up Next ---------------------------------------------------------------
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=The Long Dark', { timeout: 20000 });
  const first = await text();
  check('Up Next offers the first episode', /S1E1\b/.test(first), first.slice(0, 90));

  const before = Number(first.match(/(\d+) more episodes/)?.[1]);
  check('shows a remaining count, not a vague badge', Number.isFinite(before), String(before));
  await page.screenshot({ path: OUT + '3-upnext.png' });

  // --- Mark watched ----------------------------------------------------------
  await page.getByText('Watched', { exact: true }).first().click();
  await page.waitForSelector('text=/S1E2/', { timeout: 15000 });
  const after = await text();
  const now = Number(after.match(/(\d+) more episodes/)?.[1]);
  check('marking watched advances to the next episode', /S1E2\b/.test(after));
  check('remaining count decrements', now === before - 1, `${before} → ${now}`);
  await page.screenshot({ path: OUT + '4-watched.png' });

  // --- Persistence -----------------------------------------------------------
  // A reload proves the write reached SQLite rather than living in React state.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('text=The Long Dark', { timeout: 20000 });
  check('progress survives a reload', /S1E2\b/.test(await text()));

  // --- The title page --------------------------------------------------------
  // Both other screens link here. This check exists because the file once failed to
  // write and nothing noticed until the link was followed by hand.
  await page.getByText('The Long Dark').first().click();
  await page.waitForTimeout(2000);
  const title = await text();
  check('the title page opens rather than dead-ending', /survival drama/i.test(title), title.slice(0, 100));
  await page.screenshot({ path: OUT + '5-title.png' });

  check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
} catch (err) {
  check('smoke run completed', false, err.message);
} finally {
  await browser.close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
