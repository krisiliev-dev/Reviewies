/**
 * The half of the product that has never been photographed.
 *
 * `capture.mjs` builds with every credential blanked (§6.125), which makes it deterministic
 * and also makes `10-lists`, `11-people` and `12-account` show a gate rather than a screen.
 * This runs against a *second* export, configured with a stub Supabase host, with a
 * fabricated session and PostgREST intercepted — see `signedIn.mjs` for why each of those
 * is necessary and what shape the rows have to be.
 *
 * A second export rather than a second context on the same one: the provider and the client
 * are chosen from build-time configuration, so a signed-in screen is a different build, not
 * a different browser state. That costs a second `expo export` and buys photographs of six
 * screens nobody has ever looked at.
 */
import { chromium } from 'playwright';
import { chromiumOptions } from '../scripts/browser.mjs';
import { mkdirSync } from 'node:fs';
import { HARNESS_SUPABASE_URL, signIn, stubBackend } from './signedIn.mjs';

const BASE = 'http://localhost:4201';
const OUT = new URL('./screens/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(chromiumOptions());
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await signIn(page);
await stubBackend(page, HARNESS_SUPABASE_URL);

/**
 * What each shot must show, as **content** rather than as a heading.
 *
 * The first version of this used `/Following/` for the People screen, which is the *label*
 * on the block — so a screen with no people in it satisfied a clause named for people, and
 * it passed while the follows fixture was wrong. Every needle here is something only a
 * signed-in screen with data can print.
 */
const SHOTS = [
  ['16-account-in', '/account', /you@example\.com/i],
  ['17-people-in', '/people', /@ana|Ana Ruiz/i],
  ['18-lists-in', '/lists', /Sunday nights|Ana recommends/i],
];

const hollow = [];
for (const [name, path, want] of SHOTS) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  for (let i = 0; i < 20; i++) {
    if (want.test(await page.locator('body').innerText())) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log('shot', name);
  if (!want.test(await page.locator('body').innerText())) {
    hollow.push(`${name} (${path}) does not show ${want}`);
  }
}

/*
 * And the target-size floor on the controls only an account can reach. `AddToList`'s
 * trigger measured 47x16 against WCAG 2.5.8's 24 points (#166) and no suite had ever seen
 * it, because the control does not exist signed out. Measured here rather than asserted in
 * source: `hitSlop` is real on a device and invisible to layout, so only the box counts.
 */
await page.goto(`${BASE}/search`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.getByPlaceholder('Shows, films, anime…').fill('quiet');
await page.waitForTimeout(2500);
const small = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('[role=button], button, [role=link], a')) {
    const r = el.getBoundingClientRect();
    const label = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30);
    if (!label || r.width === 0) continue;
    if (r.height < 24 || r.width < 24) out.push(`${label} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  return out;
});
if (small.length) hollow.push(`signed-in Search has controls under the 24pt floor: ${small.join(', ')}`);
else console.log('signed-in Search: every control is big enough to hit');

await browser.close();
if (hollow.length) {
  console.error(`Signed-in screenshots that do not show what makes them worth taking:\n  ${hollow.join('\n  ')}`);
  process.exitCode = 1;
}
