/**
 * The home-screen icon, drawn from the design system rather than found in a folder.
 *
 * ## Why this script exists
 *
 * `app/vite.config.ts`'s manifest named `icon-192.png` and `icon-512.png` and **neither file
 * has ever existed** — not in `app/public`, not in `app/dist`, not anywhere in the tree.
 * §6.185. Install the PWA and the phone falls back to a screenshot of the page or a letter
 * on a grey square, which is the first thing anybody sees of this product and the one thing
 * no suite looked at. `shipping.test.ts` was written for exactly this failure — §6.111 caught
 * the *native* manifest pointing at Expo's template icon — and it reads `mobile/app.json` and
 * stops.
 *
 * ## What it draws, and why it is not a logo
 *
 * `docs/design/direction.md` specifies no mark, and inventing one in a sprint about press
 * states would be a design decision taken sideways. So this draws the thing the product
 * already draws when it has no artwork: `POSTER_PLATE`, with `posterInitials` on it.
 * `posterInitials('Reviewies')` is `RE` — one word, so its first two characters, by the rule
 * §6.137 wrote and probed against real titles.
 *
 * That is a deliberate placeholder and it is honest about being one: it is the product's own
 * fallback, applied to the product. Everything in it comes from `tokens.ts` — `actionFill`
 * and `actionLabel`, which the direction picked for the primary action and measured at
 * 17.17:1, and the title face. When a real mark exists, this script is what gets replaced.
 *
 * Rendered rather than hand-written as SVG, because the face has to be the shipped font file
 * and only a browser can set type in it. Run:
 *
 *   node scripts/make-icons.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromiumOptions } from './browser.mjs';
import { color, radius, type } from '../core/src/tokens.ts';
import { posterInitials } from '../core/src/ui/poster.ts';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'app/public');

/** The two the manifest asks for. 512 is also what a maskable icon is cut from. */
export const SIZES = [192, 512];
export const MONOGRAM = posterInitials('Reviewies');

/**
 * The face, inlined as a data URI.
 *
 * A `@font-face` pointing at a path would race the screenshot and silently fall back to a
 * system face — the §6.179 lesson about measuring before a thing has arrived, in a renderer.
 * Base64 in the document cannot lose that race.
 */
const face = readFileSync(
  resolve(ROOT, `app/public/fonts/${type.family.title.name}.ttf`),
).toString('base64');

/*
 * A maskable icon is cropped to a circle by Android, which takes about 10% off each edge, so
 * the mark sits at 60% of the plate rather than filling it. The plate's own corner is
 * `radius.plate` scaled with the icon — the direction's "printed images have square corners",
 * held at every size rather than becoming a rounded square at 512.
 */
const page = (size) => `<!doctype html><meta charset="utf-8"><style>
  @font-face { font-family: 'Title'; src: url(data:font/ttf;base64,${face}) format('truetype'); }
  html, body { margin: 0; padding: 0; }
  body { width: ${size}px; height: ${size}px; }
  .plate {
    width: ${size}px; height: ${size}px;
    background: ${color.dark.actionFill};
    border-radius: ${(radius.plate * size) / 96}px;
    display: flex; align-items: center; justify-content: center;
  }
  .mark {
    font-family: 'Title', sans-serif;
    font-size: ${Math.round(size * 0.42)}px;
    color: ${color.dark.actionLabel};
    letter-spacing: ${size * 0.01}px;
    line-height: 1;
  }
</style><div class="plate"><span class="mark">${MONOGRAM}</span></div>`;

if (process.argv[1] === import.meta.filename) {
  const browser = await chromium.launch(chromiumOptions());
  for (const size of SIZES) {
    const tab = await browser.newPage({ viewport: { width: size, height: size } });
    await tab.setContent(page(size));
    await tab.evaluate(() => document.fonts.ready);
    await tab.screenshot({ path: resolve(OUT, `icon-${size}.png`), omitBackground: false });
    await tab.close();
    console.log(`wrote app/public/icon-${size}.png — ${MONOGRAM} on ${color.dark.actionFill}`);
  }
  await browser.close();
}
