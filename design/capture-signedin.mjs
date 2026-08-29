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
import { EPISODE_ID, HARNESS_SUPABASE_URL, serverAdmits, signIn, stubBackend } from './signedIn.mjs';

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

/**
 * What each shot is a shot *of*, which §6.141 taught `capture.mjs` and this file did not
 * get until §6.142.
 *
 * Every screenshot here is a viewport at scroll 0. A reader of `design/screens/` cannot
 * tell a whole screen from the top of a long one, so a defect at a shot's bottom edge is
 * unfalsifiable by looking — which is exactly how §6.138 filed a defect (#172) about a
 * screen that was simply scrolling.
 */
const FOOT = 120;
const scrolls = [];

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}${name}.png` });
  const overflow = await page.evaluate(() => {
    let most = 0;
    for (const el of document.querySelectorAll('*')) {
      if (el.scrollHeight - el.clientHeight > most && el.clientHeight > 200) {
        most = el.scrollHeight - el.clientHeight;
      }
    }
    return Math.round(most);
  });
  scrolls.push({ name, overflow });
  if (overflow > FOOT) {
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('*')) {
        if (el.scrollHeight - el.clientHeight > 0 && el.clientHeight > 200) el.scrollTop = el.scrollHeight;
      }
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}${name}-foot.png` });
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('*')) if (el.scrollTop > 0) el.scrollTop = 0;
    });
  }
  console.log('shot', name, overflow ? `(scrolls ${overflow}pt${overflow > FOOT ? ', foot on file' : ''})` : '');
};

const hollow = [];
for (const [name, path, want] of SHOTS) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  for (let i = 0; i < 20; i++) {
    if (want.test(await page.locator('body').innerText())) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1200);
  await shot(name);
  if (!want.test(await page.locator('body').innerText())) {
    hollow.push(`${name} (${path}) does not show ${want}`);
  }
}

/*
 * The comments screen, both halves of it, walked rather than deep-linked.
 *
 * `comments/[targetId]` is the one route with no photograph at all, and it has two designed
 * states: sealed until you have watched the episode, and the comments themselves. Neither
 * could be reached before this file existed — the screen needs an account, and the gate
 * needs a local watch.
 *
 * Walked, and the first attempt at this proved it has to be. `expo export` writes a
 * *dynamic* route as the literal file `comments/[targetId].html`, so `serve` answers a deep
 * link to `/comments/tmdb:ep:2-1-1` with a 404 — and the harness photographed that 404 and
 * called it a screen. A dynamic route on the phone's web export is only reachable the way a
 * person reaches it: from a static route, through the control that pushes to it. Which is
 * also the honest way to photograph a gate, since the gate is a rule and not a URL.
 */
await page.goto(`${BASE}/search`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.getByPlaceholder('Shows, films, anime…').fill('Kitchen');
const open = page.getByRole('link', { name: /^Open Kitchen Nightshift$/i });
await open.waitFor({ timeout: 20000 });
await open.click();

// A `link`, and the mark below is a `checkbox` — the roles `Row`'s `open` and
// `CrossOff` actually render, rather than the ones a reader would guess.
//
// Anchored at both ends. It used to require a comma and something after it, which was the
// episode's name — and the fixture's name for episode 1 is `Episode 1`, so the clause was
// pinned to the number being said twice. §6.146 stopped saying it and this clause is what
// noticed, which is the right way round: a harness that fails when the product improves is
// a harness naming the accident.
const talkTo = page.getByRole('link', { name: /^Comments on season 1 episode 1$/i });
await talkTo.waitFor({ timeout: 20000 });
await talkTo.click();
await page.waitForTimeout(2000);
await shot('19-comments-sealed');
if (!/Hidden until you watch it/i.test(await page.locator('body').innerText())) {
  hollow.push('19-comments-sealed does not show the spoiler gate');
}

await page.goBack();
const mark = page.getByRole('checkbox', { name: /^Mark season 1 episode 1 watched$/i });
await mark.waitFor({ timeout: 20000 });
await mark.click();
// The server's side of the gate opens because the journey watched it, not because a
// screenshot needed it to. See `serverAdmits` in signedIn.mjs.
serverAdmits(EPISODE_ID);
await page.waitForTimeout(1000);

await page.getByRole('link', { name: /^Comments on season 1 episode 1$/i }).click();
await page.waitForTimeout(2500);
await shot('20-comments-in');
/*
 * A needle from a comment body, not from the composer.
 *
 * "Post" and "What did you think?" are printed by an empty comments list just as happily,
 * so either would pass on a screen with nothing in it — §6.109's rule, which cost this file
 * a run when `/Following/` matched a heading above no people.
 */
const talk = await page.locator('body').innerText();
if (!/Called it in episode one/i.test(talk)) {
  hollow.push('20-comments-in shows no comments; the gate or the fixtures are wrong');
}
// And that the walk actually left the gate behind, rather than photographing it twice.
if (/Hidden until you watch it/i.test(talk)) {
  hollow.push('20-comments-in is still sealed after the episode was marked watched');
}
/*
 * The rule §6.129 states, measured on the rendered screen rather than asserted in source.
 *
 * `COMPOSE_OPEN` is a boolean two files import; a screen that ignored it would still
 * import it. What the rule claims is that a person arriving here meets the conversation
 * and not a form, so the measurement is **how many text boxes exist**.
 *
 * Boxes rather than the placeholder, which is what the first version of this looked for.
 * `TextInput` becomes a `<textarea placeholder="…">`, and a placeholder is an attribute:
 * it is painted on the screen and absent from `innerText`. So `/What did you think\?/`
 * was false on a screen that plainly showed those words — the absence clause passed for
 * the wrong reason and the presence clause failed for it. §6.87's rule reflected: emitted
 * is not rendered, and *drawn* is not *in the text*.
 */
if (await page.getByRole('textbox').count()) {
  hollow.push('20-comments-in opens on the composer; COMPOSE_OPEN is not being honoured');
}

/*
 * And the composer itself, which is now a state behind a control and would otherwise be
 * the next thing nothing had ever photographed.
 *
 * `count()` before `click()`, so that a build where the composer is already open reaches
 * the report rather than dying here. Planted with `COMPOSE_OPEN = true`, the first version
 * of this failed on "waiting for Say something" — true, and it sends a reader looking for
 * a missing button instead of at the clause four lines above that had already worked out
 * exactly what was wrong. A harness that fails is not the same as one that says why.
 */
const opener = page.getByRole('button', { name: /^Say something$/i });
if (await opener.count()) await opener.click();
await page.waitForTimeout(1200);
await shot('21-comments-writing');
if (!(await page.getByRole('textbox').count())) {
  hollow.push('21-comments-writing does not show the composer');
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

/*
 * The two reveals that need an account. §6.158.
 *
 * `18-lists-in` is the shot §6.157 read and found wanting: two **collapsed** list rows,
 * with a chevron on each, and the pass had never pressed one. The row that shows a list's
 * *titles* — which is what a list is — had never been photographed on either platform in
 * thirty-odd sprints of design review.
 *
 * `AddToList` is the other: it lives on the title page, needs an account to have any lists
 * to offer, and its closed state is a 47x16 link that §6.166 already had to widen once
 * without anybody seeing what it opens.
 */
async function reveal(name, control, path) {
  if (path) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
  }
  const button = page.getByRole('button', { name: control }).first();
  if (!(await button.count())) {
    hollow.push(`${name}: nothing matches ${control}, so the state is unphotographed`);
    return;
  }
  await button.click();
  await page.waitForTimeout(900);
  await shot(name);
}

/*
 * What `18-lists-open` is a shot of, and what it is not.
 *
 * A list row shows `item.name ?? item.titleId`, and the name comes from the **local title
 * cache** — so this pass, which has only ever opened Kitchen Nightshift, photographs
 * `tmdb:tv:1` in the title's own weight. That is the fallback working, and it is a real
 * state: a list can hold a title this device has never opened, which is exactly what a
 * list somebody else shared is.
 *
 * It is not the *common* state, and the attempt to reach that one is backed out rather
 * than left half-working. Two goes at the search result's accessible name both found
 * nothing — `fill('The Long Dark')` and `fill('Long')` — and a third guess is the thing
 * §6.132 says to stop and measure instead of making. Filed.
 */
await reveal('18-lists-open', /Sunday nights|Ana recommends/i, '/lists');

/*
 * The two title-page reveals that need an account, reached the way the file's own header
 * says a title page must be — **through the control that pushes to it**, not by a URL. A
 * `/title/tmdb:tv:501` deep link found neither control, which is that header's rule
 * restated by a failure. §6.158.
 *
 * Content warnings are here rather than in the fixture pass at all: the component opens
 * with `if (!syncConfigured()) return null`, so on a build with no account the control does
 * not exist. The fixture pass said so by name rather than filing a title page without it.
 */
const toTitle = async () => {
  await page.goto(`${BASE}/search`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.getByPlaceholder('Shows, films, anime…').fill('Kitchen');
  const link = page.getByRole('link', { name: /^Open Kitchen Nightshift$/i });
  await link.waitFor({ timeout: 20000 });
  await link.click();
  await page.waitForTimeout(2000);
};

await toTitle();
await reveal('15-title-addtolist', /Add to list/i);
await toTitle();
await reveal('15-title-warnings', /content warnings/i);

const partial = scrolls.filter((s) => s.overflow > 0);
console.log(
  partial.length
    ? `signed-in shots that are the top of a longer screen: ${partial.map((s) => `${s.name} +${s.overflow}pt`).join(', ')}`
    : 'every signed-in shot is a whole screen',
);

await browser.close();
if (hollow.length) {
  console.error(`Signed-in screenshots that do not show what makes them worth taking:\n  ${hollow.join('\n  ')}`);
  process.exitCode = 1;
}
