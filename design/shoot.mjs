/**
 * The two acts every design pass performs, and the one place they live.
 *
 * ## What a shot is
 *
 * `capture-web.mjs` photographed with `fullPage: true` and measured
 * `documentElement.scrollHeight / window.innerHeight`. It reported **"every shot fits one
 * screen"** for every route of every theme since it was written, and §6.142 wrote that into
 * the record as a *correction*. §6.157 read the files: all twenty were exactly 1800px tall
 * at `deviceScaleFactor: 2` — one 900pt window, every one. `app/src/App.tsx` puts
 * `overflow-y-auto` on `<main>`, so the document never scrolls, `fullPage` captures it
 * anyway, and the ratio was `1.0x` by construction. §6.153: an instrument that can only
 * return one answer is not returning an answer.
 *
 * So: find whatever actually scrolls, say how far, and file a second shot of its foot.
 *
 * ## Why both acts are here rather than in four files
 *
 * §6.157 wrote this file and pointed the *two web passes* at it; `capture.mjs` and
 * `capture-signedin.mjs` kept their own copies. §6.158 then added an `open`/`reveal` helper
 * to those two separately. Two acts, duplicated, in the harness whose job is telling this
 * project the truth about itself — and they agreed only because one person read all of them
 * in the same fortnight. §6.160 collapsed them, and found three differences that had
 * accumulated in the dark:
 *
 * 1. **Which element counts as scrolling.** Three answers to one question. `capture.mjs`
 *    and `capture-signedin.mjs` took the tallest element with `clientHeight > 200`; the web
 *    took the tallest with `overflowY !== 'visible'`, falling back to the document;
 *    `capture-real.mjs` — whose comment claimed to do "the same shot-and-measure
 *    `capture.mjs` does" — took the **first** overflowing element in document order, with no
 *    floor on its height at all. None was wrong and none was complete: the first cannot see
 *    a scrolling document, the second counts a 40-point chip row as a screen with more
 *    underneath, the third reports whichever scroller happens to be highest in the markup.
 *    Both conditions apply now, with the document as the fallback.
 *
 *    Measured rather than assumed: run against the same `dist-real` build, the old and new
 *    instruments returned the **same ten numbers**, `r6-title-one-piece +10631pt` included.
 *    The difference was latent on this content, not active — which is precisely the state a
 *    thing is in the day before it is not.
 * 2. **Whether the page is put back.** The phone family scrolled every element back to the
 *    top after the foot shot; the web did not, because its passes navigate away anyway. A
 *    shot at an inherited scroll position is what §6.141 retracted a defect over (#172), so
 *    it happens always rather than where somebody remembered.
 * 3. **A settle before the shutter.** `capture.mjs` waited 1200 ms inside its own `shot`;
 *    the others waited in the caller. That one is a real difference — how long a screen
 *    needs is the caller's knowledge — so it is a parameter with a default of none.
 */

/** Overflow below this is a hairline, not a screen somebody has to scroll. */
export const FOOT = 120;

/**
 * How far the page can scroll, whichever element does the scrolling.
 *
 * A real scroller: taller than its box, tall enough to be a screen rather than a strip, and
 * not `overflow: visible`. The document is the fallback, for a page that scrolls normally.
 */
const OVERFLOW = () => {
  let most = 0;
  for (const el of document.querySelectorAll('*')) {
    const over = el.scrollHeight - el.clientHeight;
    if (over > most && el.clientHeight > 200 && getComputedStyle(el).overflowY !== 'visible') {
      most = over;
    }
  }
  if (most > 4) return Math.round(most);
  const doc = document.documentElement;
  return Math.round(Math.max(0, doc.scrollHeight - doc.clientHeight));
};

export function overflowOf(page) {
  return page.evaluate(OVERFLOW);
}

/**
 * Photograph a screen, and its foot if it has one — then put it back.
 *
 * `mustContain` is the needle §6.146 argues for: a shot of a screen that never loaded is a
 * photograph of a spinner, and a design review of it reviews nothing.
 */
export async function shoot(page, { out, name, mustContain, problems, scrolls, settle = 0 }) {
  if (settle) await page.waitForTimeout(settle);

  if (mustContain) {
    const body = await page.locator('body').innerText();
    if (!body.includes(mustContain)) problems.push(`${name}: nothing on it says "${mustContain}"`);
  }

  const overflow = await overflowOf(page);
  await page.screenshot({ path: `${out}${name}.png` });
  scrolls?.push({ name, overflow });

  if (overflow > FOOT) {
    await page.evaluate(() => {
      const doc = document.documentElement;
      let best = null;
      let most = 0;
      for (const el of document.querySelectorAll('*')) {
        const over = el.scrollHeight - el.clientHeight;
        if (over > most && el.clientHeight > 200 && getComputedStyle(el).overflowY !== 'visible') {
          most = over;
          best = el;
        }
      }
      if (best) best.scrollTop = best.scrollHeight;
      else window.scrollTo(0, doc.scrollHeight);
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}${name}-foot.png` });
    // Put back, always. The next step inherits this page more often than not, and a shot
    // taken at somebody else's scroll position is #172.
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('*')) if (el.scrollTop > 0) el.scrollTop = 0;
      window.scrollTo(0, 0);
    });
  }

  console.log(
    'shot',
    name,
    overflow ? `(scrolls ${overflow}pt${overflow > FOOT ? ', foot on file' : ''})` : '',
  );
  return overflow;
}

/**
 * Which shots are the top of a longer screen, as one printable phrase — or null.
 *
 * The measurement's meaning lives with the instrument that took it; the wording and the
 * channel stay with the caller, which is the whole answer to #196.
 *
 * Two of the five passes had this filter written wrong, and it was not hypothetical. They
 * listed only shots with a **foot** on file — `overflow > FOOT` — under a heading that says
 * "the top of a longer screen", so anything scrolling by less than a fold was reported as a
 * whole screen. `design:real`'s `r3-upnext` scrolls **10pt** and was absent from that line
 * until this ran; it is on it now. `overflow > 0` is the honest threshold, and there is one
 * of it.
 */
export function longerScreens(scrolls) {
  const partial = scrolls.filter((s) => s.overflow > 0);
  return partial.length ? partial.map((s) => `${s.name} +${s.overflow}pt`).join(', ') : null;
}

/**
 * Press a control that reveals something, and photograph what it revealed. §6.158.
 *
 * The thing worth having in one place is what happens when the control is **not** there: a
 * missing reveal has to say which one, because "the shot is missing" and "the shot is of the
 * closed state" look identical on disk, and the second is what §6.157 spent a sprint on.
 *
 * `arrive` runs first — a path to navigate to, or a function, because the phone's web export
 * cannot deep-link a dynamic route (§6.130) and some reveals are only reachable by walking.
 */
export async function reveal(page, { out, name, control, arrive, problems, scrolls, settle }) {
  if (typeof arrive === 'string') {
    await page.goto(arrive, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
  } else if (typeof arrive === 'function') {
    await arrive();
  }

  const button = page.getByRole('button', { name: control }).first();
  if (!(await button.count())) {
    problems.push(`${name}: nothing on the screen matches ${control}, so the state is unphotographed`);
    return;
  }
  /*
   * Caught, because a click that times out on the wrong element used to end the whole run
   * and cost four unrelated shots. A harness that loses seven pictures to one bad needle is
   * worse than one that says which needle was bad. §6.158.
   */
  try {
    await button.click({ timeout: 8000 });
  } catch (err) {
    problems.push(`${name}: could not press it — ${err.message.split('\n')[0].slice(0, 90)}`);
    return;
  }
  await page.waitForTimeout(900);
  return shoot(page, { out, name, problems, scrolls, settle });
}
