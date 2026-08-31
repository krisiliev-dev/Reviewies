/**
 * Discover's group heading is a sentence carrying show titles, drawn as an eyebrow.
 * This photographs it both ways on the real screen and measures the difference.
 *
 * ## The question
 *
 * `core/src/ui/section.ts` calls the `section` level *"The eyebrow"* and gives it two
 * channels — `caps: true`, `track: t83` — against `group`'s *as written, no tracking*. The
 * twenty-three sites it was written for are labels: `NEXT TWO MONTHS`, `YOUR YEARS`,
 * `MOST WATCHED`, `TODAY`.
 *
 * `Browse.tsx` sends something else through it, on both platforms:
 * `COPY.discover.because(titles, watched)` — *"Because you watched X and Y"*, a sentence
 * assembled at runtime out of the names of shows. Nothing in either renderer, in
 * `section.ts`, or in `Browse.tsx`'s own argument about the heading decides that a
 * **sentence containing proper nouns** should take the label treatment; `Browse.tsx`
 * settles only *where* the sentence goes — once over its group rather than on every box —
 * and reaches for the component that draws headings.
 *
 * What uppercase costs here is not legibility in general. It is that **the capitalisation
 * is the only channel that says which words are the name of a show**. `BECAUSE YOU TRACK
 * SHŌGUN` cannot be told from a sentence about shoguns, and `BECAUSE YOU WATCHED HOLLOW
 * CROWN SAGA AND THE LONG DARK` gives a reader no way to see where the first title ends.
 *
 * The repository has already drawn this exact distinction one component over.
 * `core/src/ui/row.ts`, on why `note` alone gets two lines: *"It is the only slot holding a
 * **sentence**. The title is a name, the meta is `Series · 2005`, the count is a number;
 * those are labels."* This is that argument applied to the heading it was never applied to.
 *
 * ## What this does, and what it deliberately does not
 *
 * It seeds the fixture library the way `capture-web.mjs` does — same CSV, so the shelf is
 * the one the design record already holds — walks to Discover, and photographs the heading
 * twice: as it ships, and with the two eyebrow channels lifted so the sentence is set as
 * written. Both shots are clipped to the same rectangle, so the pair differs in the type
 * and in nothing else.
 *
 * The alternative applied here is **`SECTION.group`'s type only** — case, tracking and ink.
 * `group` also carries a hairline rule to the right edge, and that is left off on purpose:
 * the rule is a separate decision about nesting, and including it would make the pair
 * disagree in three channels when the claim is about one. This is a photograph of the
 * variable, not a proposal already drawn.
 *
 * It asserts nothing. It prints, for `measure.mjs`'s stated reason: a number that should
 * hold forever belongs in a clause, and this is the instrument for finding out what the
 * number is.
 *
 * ## Running it
 *
 *   node scripts/portFree.mjs 4480 &&
 *   node scripts/served.mjs 4480 "cd app && npx vite preview --port 4480 --strictPort" \
 *   node design/found/discover-heading.mjs
 *
 * It needs `app/dist` — the fixture build `npm run design:web` makes. The two PNGs land in
 * `design/found/`, which is gitignored for the reason that directory's `.gitignore` entry
 * gives; this script is committed so the pictures can be taken again.
 */
import { chromium } from 'playwright';
import { chromiumOptions } from '../../scripts/browser.mjs';
import { CSV } from '../library.mjs';

const BASE = process.env.BASE ?? 'http://localhost:4480';
const OUT = new URL('./', import.meta.url).pathname;

const browser = await chromium.launch(chromiumOptions());
const context = await browser.newContext({
  viewport: { width: 420, height: 900 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

/* §6.125: a pass that reaches a third party photographs whatever that third party did. */
await page.route('**', async (route) => {
  const url = route.request().url();
  if (url.startsWith(BASE) || url.startsWith('data:') || url.startsWith('blob:')) {
    return route.continue();
  }
  return route.abort();
});

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

await page.locator('input[type=file]').last().setInputFiles({
  name: 'episodes.csv',
  mimeType: 'text/csv',
  buffer: Buffer.from(CSV),
});
let landed = '';
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(500);
  landed = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  if (/Imported [1-9]\d* watches/.test(landed)) break;
}
// The count and not the sentence: "Imported 0 watches" satisfies a looser needle and
// means every shot below is of an empty app. §6.104.
if (!/Imported [1-9]\d* watches/.test(landed)) {
  console.error(`the import never landed — ${landed.slice(0, 140)}`);
  process.exit(1);
}

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 180; i++) {
  await page.waitForTimeout(500);
  const body = await page.locator('body').innerText();
  if (!/Matching…/.test(body) && /The Long Dark|Kitchen Nightshift|Hollow Crown/.test(body)) break;
}

await page.goto(`${BASE}/discover`, { waitUntil: 'domcontentloaded' });
const heading = page.getByText(/^Because you (watched|track)/i).first();
await heading.waitFor({ timeout: 30000 });

/*
 * The pointer at the origin before either shutter, `shoot.mjs`'s reason exactly: a hover
 * state looks like data, and the pair below would carry it into only one of the two.
 */
await page.mouse.move(0, 0);

/** What the heading actually is, read off the element rather than off the tables. */
const read = () =>
  heading.evaluate((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      text: el.textContent,
      transform: s.textTransform,
      tracking: s.letterSpacing,
      size: s.fontSize,
      ink: s.color,
      family: s.fontFamily.split(',')[0],
      box: `${Math.round(r.width)}x${Math.round(r.height)}`,
      // How many line boxes the sentence takes, which is the half a constant cannot say.
      lines: Math.round(r.height / parseFloat(s.lineHeight || s.fontSize)),
    };
  });

/*
 * One rectangle for both shots, taken from the blurb above the heading down past the first
 * box's own title — enough context to judge the heading against the words it sits between,
 * and identical across the pair so nothing but the type moves.
 */
const clip = await heading.evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { x: 0, y: Math.max(0, r.top - 60), width: 420, height: 320 };
});

const before = await read();
await page.screenshot({ path: `${OUT}discover-heading-eyebrow.png`, clip });

/*
 * `SECTION.group`'s type, applied to the element the sentence is already in.
 *
 * Written as an inline style rather than by swapping a class: the class lists are Tailwind
 * literals compiled from source text (`Section.tsx`'s header has the argument), so a class
 * added at runtime is a class with no rule behind it — which would photograph *no change*
 * and read as evidence that the treatment does not matter.
 */
await heading.evaluate((el) => {
  el.style.textTransform = 'none';
  el.style.letterSpacing = '0';
  el.style.color = 'var(--color-ink)';
});
await page.waitForTimeout(200);
const after = await read();
await page.screenshot({ path: `${OUT}discover-heading-as-written.png`, clip });

console.log('the heading as it ships:', before);
console.log('the heading as written: ', after);
console.log(`clip ${clip.width}x${clip.height} at y ${Math.round(clip.y)}, both shots`);

await browser.close();
