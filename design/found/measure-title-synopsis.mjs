/**
 * What the poster's column costs the title page's synopsis, at both photographed widths.
 *
 * ## The finding this exists to make checkable
 *
 * `app/src/screens/TitleDetail.tsx` draws the poster and a `flex-1` column beside it, and
 * puts the whole synopsis **inside that column**. On a long overview the poster runs out
 * after three lines and the remaining twelve keep the poster's indent, so the paragraph is
 * set to a measure it never needed. `mobile/app/title/[id].tsx:203` draws the same field on
 * its own line under the row and always has — and the comment on the control beneath it
 * gives the reason in as many words: *"Its own line rather than the column beside the
 * poster … in a column narrowed by a poster and by whatever the system font scale is doing,
 * the last stars fall off the end."* That reason was applied to the rating and to
 * `AddToList`, on one platform, and not to the paragraph.
 *
 * `TitleDetail.tsx`'s own comment already names the shape — *"one field, two platforms,
 * different halves"* — about the `line-clamp-3` it removed from this very paragraph. This
 * is the same field's other half.
 *
 * ## Measured rather than eyeballed, and the alternative photographed rather than described
 *
 * The run reports the paragraph's box as drawn, then moves the element out of the poster's
 * column in the DOM — which is the phone's layout, not an invention — and reports it again.
 * `docs/design/agents.md`: *"A finding that says 'this should be bigger' is worth much less
 * than two images and a measurement."*
 *
 * One Piece, because it is the longest overview in the snapshot at 583 characters and the
 * defect is a function of length: a two-line synopsis never reaches past the poster.
 *
 * Run, with the snapshot server on the port `app/dist-real` was built against:
 *
 *   npm run build:real --workspace app          # if dist-real is not current
 *   node scripts/served.mjs 4203 "node design/serveSnapshot.mjs 4203" \
 *     node scripts/served.mjs 4472 "cd app && npx vite preview --outDir dist-real --port 4472 --strictPort" \
 *     env BASE=http://localhost:4472 node design/found/measure-title-synopsis.mjs
 */
import { chromium } from 'playwright';
import { chromiumOptions } from '../../scripts/browser.mjs';

/** The window the web app is actually opened in, and the one `capture-web-real.mjs` shoots. */
const WIDTHS = [420, 1280];
/** One Piece — `design/real/MANIFEST.json`, the longest overview in the snapshot. */
const TITLE = 'tmdb:tv:37854';
const OPENS = /Years ago, the fearsome Pirate King/;
const BASE = process.env.BASE ?? 'http://localhost:4472';
const OUT = new URL('./', import.meta.url).pathname;

const paragraph = () =>
  [...document.querySelectorAll('p')].find((e) => /Years ago, the fearsome Pirate King/.test(e.textContent));

const browser = await chromium.launch(chromiumOptions());
for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/title/${encodeURIComponent(TITLE)}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  if (!OPENS.test(await page.locator('body').innerText())) {
    console.error(`${width}: the synopsis never arrived, so nothing below is a measurement of it`);
    process.exitCode = 1;
    await page.close();
    continue;
  }

  const now = await page.evaluate(() => {
    const p = [...document.querySelectorAll('p')].find((e) =>
      /Years ago, the fearsome Pirate King/.test(e.textContent));
    const r = p.getBoundingClientRect();
    const cs = getComputedStyle(p);
    return {
      x: Math.round(r.x),
      width: Math.round(r.width),
      lines: Math.round(r.height / parseFloat(cs.lineHeight)),
      height: Math.round(r.height),
      // The cap `SCREEN.prose` puts on it, which is what binds at 1280 and never at 420.
      maxWidth: cs.maxWidth,
      chars: p.textContent.length,
    };
  });
  await page.screenshot({ path: `${OUT}web-title-synopsis-${width}-now.png` });

  /*
   * The alternative: the paragraph on its own line under the poster row. Applied to the
   * live DOM rather than to the source, because the question is what the layout does and a
   * branch would answer it no better and take a build.
   */
  await page.evaluate(() => {
    const p = [...document.querySelectorAll('p')].find((e) =>
      /Years ago, the fearsome Pirate King/.test(e.textContent));
    const row = p.closest('.flex');
    row.parentElement.insertBefore(p, row.nextSibling);
    p.style.marginTop = '0';
    p.style.marginBottom = '20px';
  });
  await page.waitForTimeout(400);
  const moved = await page.evaluate(() => {
    const p = [...document.querySelectorAll('p')].find((e) =>
      /Years ago, the fearsome Pirate King/.test(e.textContent));
    const r = p.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      width: Math.round(r.width),
      lines: Math.round(r.height / parseFloat(getComputedStyle(p).lineHeight)),
      height: Math.round(r.height),
    };
  });
  await page.screenshot({ path: `${OUT}web-title-synopsis-${width}-moved.png` });

  console.log(
    `${width}: beside the poster ${now.width}px, ${now.lines} lines, ${now.height}px tall ` +
      `(${Math.round(now.chars / now.lines)} characters a line, cap ${now.maxWidth}) — ` +
      `on its own line ${moved.width}px, ${moved.lines} lines, ${moved.height}px ` +
      `(${Math.round(now.chars / moved.lines)} a line)`,
  );
  await page.close();
}
await browser.close();
