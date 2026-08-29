/**
 * A screenshot, and an honest answer about how much of the screen it is.
 *
 * ## Why this is not `fullPage: true`
 *
 * `capture-web.mjs` photographed with `fullPage: true` and measured
 * `documentElement.scrollHeight / window.innerHeight`. It reported **"every shot fits one
 * screen"** for every route of every theme since it was written, and §6.142 wrote that into
 * the record as a correction: *"capture-web.mjs has always passed `fullPage: true`, so its
 * twenty shots are whole documents and were never scroll positions."*
 *
 * That was wrong, and §6.157 measured it by reading the files: all twenty are **exactly**
 * 1800px tall at `deviceScaleFactor: 2` — one 900pt window, every one. `app/src/App.tsx`
 * puts `overflow-y-auto` on `<main>`, so the *document* never scrolls; an element inside it
 * does. `fullPage` captures the document, `documentElement.scrollHeight` equals
 * `innerHeight`, and the metric could only ever return `1.0x`. **An instrument that can only
 * return one answer is not returning an answer** — §6.153, in the harness that wrote the
 * rule's predecessor.
 *
 * So: find whatever actually scrolls, say how far, and file a second shot of its foot. That
 * is what `capture.mjs` and `capture-real.mjs` have always done for the phone, and it works
 * whether the document scrolls or an element does. It lives here so there is one of it.
 */

/** Overflow below this is a hairline, not a screen somebody has to scroll. */
export const FOOT = 120;

/**
 * How far the page can scroll, whichever element does the scrolling.
 *
 * The document first, then the tallest overflowing element — so this is right for a page
 * that scrolls normally *and* for an app shell that hands the scrolling to a `<main>`.
 */
export function overflowOf(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const fromDocument = doc.scrollHeight - doc.clientHeight;
    if (fromDocument > 4) return fromDocument;
    let most = 0;
    for (const node of document.querySelectorAll('*')) {
      const over = node.scrollHeight - node.clientHeight;
      if (over > most && getComputedStyle(node).overflowY !== 'visible') most = over;
    }
    return most;
  });
}

/** Scroll whatever scrolls to its end, so the foot shot is of the foot. */
async function toFoot(page) {
  await page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollHeight - doc.clientHeight > 4) {
      window.scrollTo(0, doc.scrollHeight);
      return;
    }
    let best = null;
    let most = 0;
    for (const node of document.querySelectorAll('*')) {
      const over = node.scrollHeight - node.clientHeight;
      if (over > most && getComputedStyle(node).overflowY !== 'visible') {
        most = over;
        best = node;
      }
    }
    if (best) best.scrollTop = best.scrollHeight;
  });
  await page.waitForTimeout(400);
}

/**
 * Photograph a screen, and its foot if it has one.
 *
 * `mustContain` is the needle §6.146 argues for: a shot of a screen that never loaded is a
 * photograph of a spinner, and a design review of it reviews nothing. Push onto `problems`
 * and the run says what it could not reach.
 */
export async function shoot(page, { out, name, mustContain, problems, scrolls }) {
  const body = await page.locator('body').innerText();
  if (mustContain && !body.includes(mustContain)) {
    problems.push(`${name}: nothing on it says "${mustContain}"`);
  }

  const overflow = await overflowOf(page);
  await page.screenshot({ path: `${out}${name}.png` });

  if (overflow > FOOT) {
    await toFoot(page);
    await page.screenshot({ path: `${out}${name}-foot.png` });
    scrolls?.push(`${name} +${overflow}pt`);
    console.log(`shot ${name} (scrolls ${overflow}pt, foot on file)`);
  } else {
    console.log(`shot ${name}${overflow ? ` (scrolls ${overflow}pt)` : ''}`);
  }
  return overflow;
}
