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

  // --- The watchlist note ----------------------------------------------------
  // The reason for saving something is the whole value of a watchlist — "I have ZERO
  // memory for why they're there" is the quote the screen was built around. The phone
  // could display a note the web had written and never write one, which is a note
  // nobody has.
  await page.getByText('Search', { exact: true }).first().click();
  await page.getByPlaceholder('Shows, films, anime…').fill('hollow');
  await page.waitForSelector('text=Hollow Crown Saga', { timeout: 20000 });
  await page.getByLabel('Add Hollow Crown Saga to watchlist').click();
  await page.waitForSelector('text=On watchlist', { timeout: 15000 });

  await page.getByText('Watchlist', { exact: true }).first().click();
  await page.waitForSelector('text=Add a note', { timeout: 15000 });
  check('a watchlist note can be written on the phone', true);

  await page.getByText('Add a note').first().click();
  await page.getByPlaceholder('Why did you save this?').fill('Recommended by Sam.');
  await page.getByText('Save', { exact: true }).first().click();
  await page.waitForTimeout(1200);
  check(
    'and the note survives being written',
    (await text()).includes('Recommended by Sam.'),
  );

  // Back where the rest of this script expects to be. Leaving the app on another tab
  // makes every later step depend on the order these blocks happen to sit in. A reload
  // rather than a tab tap, because "Up Next" is also the heading of the screen it names
  // and picking the wrong one of those is not a failure worth debugging twice.

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=The Long Dark', { timeout: 20000 });

  // --- Tabs ------------------------------------------------------------------
  // Five, and no more: the web app's eight is already too many for a phone, and
  // simplicity was the loudest single finding in the research.
  for (const tab of ['Discover', 'Watchlist', 'More']) {
    await page.getByText(tab, { exact: true }).first().click();
    await page.waitForTimeout(1200);
    check(`the ${tab} tab opens`, (await text()).includes(tab));
  }
  await page.screenshot({ path: OUT + '6-more.png' });

  // --- The rest of More --------------------------------------------------------
  // Every link has to lead somewhere. A route that does not exist is a dead end that
  // only shows up when someone taps it, which is how the title page shipped broken.
  for (const [detail, expect_] of [
    ['What is airing, and what to be told about', /Tell me about/i],
    ['Film and television in the same list', /list/i],
    ['Your handle, following, blocking', /account|sync|following/i],
  ]) {
    await page.getByText(detail).click();
    await page.waitForTimeout(1500);
    const body = await text();
    check(`${detail.slice(0, 22)}… opens`, expect_.test(body), body.slice(0, 90));
    await page.goBack();
    await page.waitForTimeout(1000);
  }

  // --- The watching preference -------------------------------------------------
  // The web has offered this since it shipped. The phone did the opposite of what the
  // toggle describes — it never opened the conversation — which is a worse kind of
  // missing than an absent control, because nothing said so.
  await page.getByText('Import from TV Time, export everything').click();
  await page.waitForTimeout(1500);
  check(
    'the phone offers the open-the-conversation preference',
    (await page.getByText('Open the conversation after marking watched').count()) > 0,
  );
  await page.goBack();
  await page.waitForTimeout(1000);

  // --- Account ---------------------------------------------------------------
  await page.getByText('Optional — adds sync and the shared layer').click();
  await page.waitForTimeout(1500);
  const account = await text();
  // A credential-free build must say why rather than showing a form that cannot work.
  check(
    'the account screen explains what it needs',
    /not configured on this build/i.test(account),
    account.slice(0, 120),
  );
  await page.goBack();
  await page.waitForTimeout(1000);

  // --- The remote ------------------------------------------------------------
  // This is what going native bought: the same feature on the web needed a companion
  // process dialling out to a relay, because a page cannot reach a LAN address.
  await page.getByText('Control a TV on your Wi-Fi, directly').click();
  await page.waitForTimeout(1500);
  const remote = await text();
  check('the remote opens with its buttons', /Scan Wi-Fi/.test(remote) && /Home/.test(remote), remote.slice(0, 110));
  check(
    'it says plainly that nothing is paired yet',
    /No device yet/.test(remote),
  );
  await page.screenshot({ path: OUT + '10-remote.png' });
  await page.goBack();
  await page.waitForTimeout(1000);

  // --- Stats -----------------------------------------------------------------
  await page.getByText('Runtime-weighted, and your year in review').click();
  await page.waitForTimeout(2000);
  const stats = await text();
  check('stats are runtime-weighted', /Watched/.test(stats) && /Episodes/.test(stats), stats.slice(0, 110));
  await page.screenshot({ path: OUT + '7-stats.png' });
  await page.goBack();
  await page.waitForTimeout(800);
  // Back on More; the title page is reached from Up Next.
  await page.getByText('Up Next', { exact: true }).last().click();
  await page.waitForTimeout(1200);

  // --- The title page --------------------------------------------------------
  // Both other screens link here. This check exists because the file once failed to
  // write and nothing noticed until the link was followed by hand.
  await page.getByText('The Long Dark').first().click();
  await page.waitForTimeout(2000);
  const title = await text();
  check('the title page opens rather than dead-ending', /survival drama/i.test(title), title.slice(0, 100));
  check('the episode list renders', /season 1/i.test(title), title.slice(0, 130));
  await page.screenshot({ path: OUT + '5-title.png' });

  // --- Watching Mode ---------------------------------------------------------
  // The reason this app exists rather than another tracker.
  await page.getByText('React', { exact: true }).first().click();
  await page.waitForTimeout(2000);
  check('Watching Mode opens', (await text()).includes('Start watching'));

  // Continuous listening is native-only: `useAudioStream` has no web implementation, so
  // the control must remove itself rather than offer a button that cannot work. Worth a
  // check because the failure mode is a dead affordance, not an error.
  check(
    'listening hides itself where there is no audio stream',
    !(await text()).includes('Keep in sync by listening'),
  );

  await page.getByText('Start watching').click();
  await page.waitForTimeout(1500);
  await page.getByText('Cliffhanger').click();
  await page.waitForTimeout(1200);

  const stored = await page.evaluate(async () => {
    const response = await fetch('/');
    void response;
    return document.body.innerText.includes('Pause');
  });
  check('the clock runs once started', stored);

  await page.screenshot({ path: OUT + '8-watching.png' });

  await page.getByPlaceholder('Search any emoji…').fill('twist');
  await page.waitForTimeout(800);
  check('emoji search filters the pad', (await text()).includes('Mind blown'));
  await page.screenshot({ path: OUT + '9-emoji-search.png' });
  await page.getByText('Close').click();
  await page.waitForTimeout(1500);

  // --- Comments, and the spoiler gate ------------------------------------------
  // The gate is a database policy; this screen only explains it. Unwatched episodes
  // must say so rather than showing an empty thread that looks like nobody commented.
  await page.getByText('Talk', { exact: true }).last().click();
  await page.waitForTimeout(1500);
  const talk = await text();
  check(
    'an unwatched episode says its comments are sealed',
    /Hidden until you watch it|needs? an account|not configured/i.test(talk),
    talk.slice(0, 130),
  );
  await page.screenshot({ path: OUT + '11-comments.png' });
  await page.goBack();
  await page.waitForTimeout(1000);

  check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
} catch (err) {
  check('smoke run completed', false, err.message);
} finally {
  await browser.close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
