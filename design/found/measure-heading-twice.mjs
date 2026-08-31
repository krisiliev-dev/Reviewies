/**
 * The phone's title page prints the show's name twice. This measures whether the two are
 * drawn differently, off the photograph rather than off the tables.
 *
 * ## Why the pixels and not the tables
 *
 * The two names are chosen in two files that do not mention each other.
 * `mobile/app/_layout.tsx` gives every pushed screen's navigator title
 * `fontFamily: MASTHEAD.sub.face` and `fontSize: MASTHEAD.sub.size`; `mobile/app/title/
 * [id].tsx` draws the page's own heading beside the poster as `<Masthead level="sub">`.
 * Reading either file alone, each choice is argued and correct. Only the rendered screen
 * shows that they resolve to the same three values, so the screen's depth-1 heading and its
 * depth-2 heading are the same ink at the same size, carrying the same words.
 *
 * §6.189's rule is the reason this is a script: a claim that two runs of type are "the same
 * size" read off two constant tables is a claim about two files, and the thing under review
 * is a screen. `agents.md` practice 2 — read the renderer, and hash the file, before writing
 * the finding — with the third step being to measure the picture the finding is about.
 *
 * ## What it measures
 *
 * A band is a run of consecutive rows holding ink. For each band this reports the ink's
 * bounding box. Two runs of the **same string** in the same face at the same size have the
 * same ink width and the same cap height, to the pixel; a step apart on `MASTHEAD`'s scale
 * — `sub` at s20 against `page` at s24 — would show as a 20% difference in both.
 *
 * The comparison is therefore between two bands of one photograph, which is what makes it
 * independent of the tables: nothing here imports a token.
 *
 * `x0` is a floor on the column searched, so the back chevron to the left of the navigator
 * title is not counted as part of it. It is passed rather than guessed at, and the default
 * covers both runs on the shot this was written for.
 *
 * Run:
 *   node design/found/measure-heading-twice.mjs design/screens/15-title.png 0 520
 *
 * The image is a design-pass shot and is gitignored; the script is committed so the numbers
 * can be taken again. Its own hash is printed with them, because §6.172, §6.174 and §6.175
 * were all retracted for reading a picture nobody could identify afterwards.
 */
import { PNG } from 'pngjs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const [file, from = '0', to = '520', x0 = '110'] = process.argv.slice(2);
if (!file) {
  console.error('usage: measure-heading-twice.mjs <shot.png> [fromY] [toY] [minX]');
  process.exit(2);
}

const bytes = readFileSync(file);
console.log(`${file}  sha256 ${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}`);

const png = PNG.sync.read(bytes);
const LEFT = Number(x0);
const TOP = Number(from);
const BOTTOM = Math.min(Number(to), png.height);

/**
 * Ink, as brightness above the ground.
 *
 * The ground is `#111`-dark and every run of type on this screen is either full ink or
 * secondary; 100 sits above the ground and below both, so the threshold does not have to
 * know which of the two a band is.
 */
const INK = 100;
const bright = (x, y) => {
  const i = (png.width * y + x) << 2;
  const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]];
  return (r * 299 + g * 587 + b * 114) / 1000 > INK;
};

const bands = [];
let open = null;
for (let y = TOP; y < BOTTOM; y++) {
  let left = null;
  let right = null;
  for (let x = LEFT; x < png.width; x++) {
    if (!bright(x, y)) continue;
    if (left === null) left = x;
    right = x;
  }
  if (left === null) {
    if (open) bands.push(open), (open = null);
    continue;
  }
  if (!open) open = { top: y, bottom: y, left, right };
  else {
    open.bottom = y;
    open.left = Math.min(open.left, left);
    open.right = Math.max(open.right, right);
  }
}
if (open) bands.push(open);

console.log(`bands of ink in y ${TOP}–${BOTTOM}, x ≥ ${LEFT} (device pixels, 2x):`);
for (const b of bands) {
  console.log(
    `  y ${String(b.top).padStart(4)}–${String(b.bottom).padStart(4)}` +
      `  height ${String(b.bottom - b.top + 1).padStart(3)}` +
      `  x ${String(b.left).padStart(4)}–${String(b.right).padStart(4)}` +
      `  width ${String(b.right - b.left + 1).padStart(4)}`,
  );
}
