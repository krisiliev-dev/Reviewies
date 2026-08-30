/**
 * Filling a library from the snapshot of real TMDB, the way a person fills one.
 *
 * `capture-real.mjs` wrote this for the phone and §6.157 gave the web its own real pass.
 * Two harnesses seeding the same six shows is exactly the shape §6.132 warned about with
 * `library.mjs` — a fixture copied is a fixture that drifts — and the seeding is the half
 * that took three attempts to get right, so it is the last thing that should exist twice.
 *
 * The *routes* stay in each capture script, because the two apps genuinely have different
 * ones. This is the part that is the same.
 */
import { readFileSync } from 'node:fs';

/** The six titles the snapshot holds, and what each was chosen to stress. */
export const manifest = JSON.parse(
  readFileSync(new URL('./real/MANIFEST.json', import.meta.url), 'utf8'),
);
export const SHOWS = manifest.titles.filter((t) => t.kind === 'tv');
export const FILM = manifest.titles.find((t) => t.kind === 'movie');

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Track a show by searching for it — and then **wait for its episodes**, which is a thing
 * the fixture never made anybody think about.
 *
 * §6.152's first run photographed *"59 more episodes"* for One Piece against 1,220. Both a
 * wrong query and a cache still filling look identical in a screenshot, and the fixture's
 * longest show is twenty-four episodes in one request, so a fixed 2.5-second wait had never
 * been asked to cover twenty-four *seasons* fetched one at a time.
 */
export async function track(page, base, name) {
  await page.goto(`${base}/discover`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('Shows, films, anime…').fill(name);
  await page.getByText(name, { exact: true }).first().waitFor({ timeout: 25000 });
  await page
    .getByRole('button', { name: new RegExp(`^Track ${escape(name)}$`) })
    .first()
    .click({ timeout: 20000 });
  /*
   * Wait for the row to say so before leaving. Pressing Track starts a write *and* an
   * episode fetch, and §6.154 measured what a navigation in that window costs — the fetch
   * dies with the document. The product heals it now; the harness still waits like somebody
   * watching the screen, because a shot taken mid-fill is a shot of the wrong number.
   */
  await page.getByText('Tracking', { exact: true }).first().waitFor({ timeout: 30000 });
  return settle(page, base, name);
}

/**
 * Watch Up Next's count for this show until it stops growing.
 *
 * **In place.** §6.152's first version re-navigated on every poll and reported `-1` for all
 * five shows: a full app boot per second is slower than the boot, so the row was never on
 * screen when it looked. The app is a live query — it redraws as the cache fills — so the
 * right instrument is to arrive once and watch.
 */
export async function settle(page, base, name) {
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  let last = -1;
  let steady = 0;
  for (let i = 0; i < 60 && steady < 5; i++) {
    await page.waitForTimeout(1000);
    const body = await page.locator('body').innerText();
    const at = body.indexOf(name);
    const count =
      at === -1 ? -1 : Number(body.slice(at, at + 200).match(/(\d+) more episodes?/)?.[1] ?? -1);
    steady = count === last && count > 0 ? steady + 1 : 0;
    last = count;
  }
  console.log(`  tracked ${name} — Up Next settled at ${last} more`);
  return last;
}
