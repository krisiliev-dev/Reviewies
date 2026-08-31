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
 * The one scroller the shot is of, and the two facts worth knowing about it.
 *
 * ## Why one reading and not two
 *
 * `overflow` says how far the screen could travel; `at` says where it was standing when the
 * shutter opened. The house rule for writing a finding about what a shot cuts off is *"hash
 * the file and check the scroll position"*, and until `at` existed the second half of that
 * could not be done — three findings in the record were retracted over exactly this, one
 * for reading a shot taken at scroll 0 as a clipped row and one for citing `scrollTop 450`
 * on a page whose `maxScroll` was also 450.
 *
 * They are read in one traversal, off **one** element, and that is the load-bearing part.
 * The first draft asked the two questions separately and took the largest `scrollTop`
 * anywhere in the document, which can answer about a different element than `overflow` did
 * — and then `450 of 450` means nothing, because a pair of numbers is only a pair if it is
 * one page's. This is the same defect the file's own header catalogues under *"three
 * answers to one question"*, committed while adding the second question.
 *
 * ## The fourth condition, and what is **not** claimed for it
 *
 * A candidate must also be in the picture. The three older conditions — taller than its
 * box, tall enough to be a screen rather than a strip, not `overflow: visible` — say
 * nothing about whether the thing is on screen, and a scroller the shot is not of is not
 * the shot's scroller. That much is right on its own terms.
 *
 * It is **not** the explanation of the reading that prompted it, and this paragraph exists
 * so that nobody later reads it as one. `dark-01-upnext` and `light-01-upnext` both report
 * `+3891pt (at 3795pt)` — the same pair as `dark-11-remote`, the shot where the remote
 * drawer is open — on a screen carrying two rows and nothing below the fold. The obvious
 * suspect was `app/src/remote/RemoteDrawer.tsx`: `fixed inset-y-0 right-0 w-[288px]
 * overflow-y-auto`, mounted on every route so the bridge is not torn down, and merely
 * translated off the edge when shut. Measured instead of assumed, against the same
 * `app/dist` at 420: the closed panel's box is `left 420, right 708` of a 420pt window —
 * so this condition does exclude it — and its `scrollHeight` **equals** its `clientHeight`,
 * so it was never a candidate for `overflow` in the first place. On a fresh load of that
 * build no element in the document overflows at all.
 *
 * So the 3891 belongs to something the pass's walk creates and this has not found it, and
 * the same is true of the phone's `03-upnext at 3484 of 3500`. Recorded as an open
 * question, because *"an instrument measures what somebody thought to measure"* and a
 * plausible story attached to a number nobody has traced is how the 2-of-7 happened.
 *
 * `at` is reported and never refused. `reveal` presses controls that Playwright scrolls
 * into view, so a reveal below the fold is legitimately not at the top, and a rule that
 * convicted those would be the overfiring guard §6.190 corrected three of.
 */
const READING = () => {
  const inThePicture = (el) => {
    const r = el.getBoundingClientRect();
    return (
      r.width > 0 && r.height > 0 &&
      r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight
    );
  };
  let best = null;
  let most = 0;
  for (const el of document.querySelectorAll('*')) {
    const over = el.scrollHeight - el.clientHeight;
    if (
      over > most &&
      el.clientHeight > 200 &&
      getComputedStyle(el).overflowY !== 'visible' &&
      inThePicture(el)
    ) {
      most = over;
      best = el;
    }
  }
  if (most > 4 && best) return { overflow: Math.round(most), at: Math.round(best.scrollTop) };
  const doc = document.documentElement;
  return {
    overflow: Math.round(Math.max(0, doc.scrollHeight - doc.clientHeight)),
    at: Math.round(window.scrollY),
  };
};

/**
 * The scroller this shot is of, as `{ overflow, at }`.
 *
 * One export where there were two. `overflowOf` was exported and read by exactly one
 * caller — `shoot`, twelve lines down — and a second export beside it would have been a
 * second way to ask half the question, which is how the two numbers come to be about two
 * different elements again.
 */
export function readingOf(page) {
  return page.evaluate(READING);
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
    // What it said instead, not only what it did not say. §6.162: the first run of the
    // empty-state shots reported `00-discover-empty: nothing on it says "Nothing new to
    // suggest yet"` and left the next question — *then what is on it?* — to a second run.
    if (!body.includes(mustContain)) {
      problems.push(
        `${name}: nothing on it says "${mustContain}" — it says: ${body.replace(/\s+/g, ' ').slice(0, 140)}`,
      );
    }
  }

  /*
   * The pointer, out of the way — the same act as putting the scroll back, one axis over.
   *
   * `narrow-title-severance.png` photographed **four filled stars** under the heading *Your
   * rating*, on a title this harness tracks and never rates. `wide-title-severance.png` — same
   * build, same snapshot, same run — showed five empty ones. Nothing about the product
   * differed: `capture-web-real.mjs` reaches a title page by clicking the show's name in Up
   * Next, Playwright leaves the cursor there, and `StarRating` paints `hover ?? value ?? 0`.
   * On the 420 layout the row title's block centres over the fourth star; at 1280 the same
   * centre lands past the fifth, so the control drew empty and the two shots disagreed.
   *
   * Which is #172 again, and this file already argues the case for the other axis eight lines
   * below: *"a shot taken at somebody else's scroll position is #172"*. A shot taken at
   * somebody else's pointer position is the same sentence, and it is worse in one way — a
   * wrong scroll offset looks wrong, while a hover state looks like data.
   *
   * `(0, 0)` rather than off-screen, because Playwright clamps a move to the viewport anyway
   * and the corner is the one coordinate every layout in this repository leaves empty: the
   * screens all begin with a title inset by `SCREEN.edge`. Before the shutter, not after —
   * after is a tidy-up that photographs the hover and then removes it.
   */
  await page.mouse.move(0, 0);

  // Read before the shutter and not after, for `mouse.move`'s reason one paragraph up: a
  // reading taken after the foot shot would be a reading of where the instrument left the
  // page, which is the one number it cannot be.
  const { overflow, at } = await readingOf(page);
  await page.screenshot({ path: `${out}${name}.png` });
  scrolls?.push({ name, overflow, at });

  if (overflow > FOOT) {
    // The same element `READING` measured, found by the same four conditions — the foot
    // shot has to be of the scroller the overflow was reported for or it is a photograph of
    // something else. It scrolled a hidden drawer for as long as the picture test was
    // missing from here too.
    await page.evaluate(() => {
      const doc = document.documentElement;
      const inThePicture = (el) => {
        const r = el.getBoundingClientRect();
        return (
          r.width > 0 && r.height > 0 &&
          r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight
        );
      };
      let best = null;
      let most = 0;
      for (const el of document.querySelectorAll('*')) {
        const over = el.scrollHeight - el.clientHeight;
        if (
          over > most &&
          el.clientHeight > 200 &&
          getComputedStyle(el).overflowY !== 'visible' &&
          inThePicture(el)
        ) {
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

  const said = [
    overflow ? `scrolls ${overflow}pt${overflow > FOOT ? ', foot on file' : ''}` : '',
    at ? `taken at ${at}pt down` : '',
  ].filter(Boolean);
  console.log('shot', name, said.length ? `(${said.join('; ')})` : '');
  return overflow;
}

/**
 * Every turned-over box on the shelf: what its synopsis showed, what it wanted, and how much
 * of the ground it was given went unused.
 *
 * The ground is the flex child's own box — the panel is `h-full`, so that child is handed
 * whatever the title, the fact line and the four controls did not take, and its height is
 * therefore the answer rather than an estimate built out of the furniture above it.
 *
 * `wants` is measured by cloning the paragraph without the clamp at the same width, not by
 * dividing a character count by an assumed em. `capture-web-real.mjs` argues that
 * distinction at length one function down from where this used to live: the em is the thing
 * that would have to be guessed, and guessing it is how a measurement becomes an estimate
 * wearing a number.
 *
 * Here rather than in either pass, for §6.160's reason. Both platforms draw this box and
 * `react-native-web` renders `numberOfLines` as the same `-webkit-line-clamp` the web writes,
 * so the reading is one act; the two capture scripts that had copies of one act are what that
 * section is about.
 */
export async function unusedGround(page) {
  return page.evaluate(() => {
    const out = [];
    /*
     * The ground, found by what it *is* rather than by the markup around it: the element that
     * clips its overflow and whose first child is a clamped paragraph. The first version of
     * this walked `document.querySelectorAll('li')`, which is the web's shelf and not the
     * phone's — `react-native-web` draws a `View` as a `div` — so the phone pass reported
     * that it could find nothing and refused to hand back a clean run, which is what that
     * branch is for.
     */
    for (const ground of document.querySelectorAll('*')) {
      if (getComputedStyle(ground).overflowY !== 'hidden' || !(ground.clientHeight > 0)) continue;
      const p = ground.firstElementChild;
      if (!p || ground.children.length !== 1) continue;
      const clamp = getComputedStyle(p).webkitLineClamp;
      if (!clamp || clamp === 'none') continue;
      const line = parseFloat(getComputedStyle(p).lineHeight);
      if (!(line > 0)) continue;

      const clone = p.cloneNode(true);
      Object.assign(clone.style, {
        webkitLineClamp: 'unset',
        display: 'block',
        /*
         * `inset: auto` and not only `position: absolute`.
         *
         * The web draws this paragraph `absolute inset-0` so that it contributes nothing to
         * what its panel asks for, and a clone of it keeps that class — which pins top *and*
         * bottom and so makes the copy exactly as tall as the box it was cut out of. The
         * first version of this measure read `wants` equal to `shown` on every box on the
         * shelf and reported a clean pass on a build where the clamp did nothing at all.
         */
        inset: 'auto',
        position: 'absolute',
        height: 'auto',
        visibility: 'hidden',
        width: `${p.getBoundingClientRect().width}px`,
      });
      p.parentElement.appendChild(clone);
      const full = clone.getBoundingClientRect().height;
      clone.remove();

      const drawn = Math.min(ground.clientHeight, Math.round(clamp) * line);
      out.push({
        name: (ground.parentElement?.firstElementChild?.textContent ?? '').slice(0, 40),
        line,
        shown: Math.round(drawn / line),
        wants: Math.round(full / line),
        truncated: full - drawn > 1,
        spare: Math.round(ground.clientHeight - drawn),
        /*
         * How much taller the paragraph's own box is than the lines it is showing.
         *
         * `-webkit-line-clamp` hides what is past line N by clipping at the element's box,
         * so an element given a height of its own — `absolute inset-0` pins top *and* bottom
         * — clips six points lower than the text it is clamping and the **top of line N+1
         * prints** under the ellipsis. Photographed at six times scale on the first build of
         * the measured clamp: *"condition worsens and long-…"* with *"hidden family secrets
         * come to"* half-drawn beneath it, which is the rendering-fault register this clamp
         * exists to avoid.
         *
         * Nothing else here can see it: the ground is the right size, the shelf holds still,
         * the line count is right, and the extra ink is inside the box every other reading
         * is about.
         */
        overhang: Math.round(p.getBoundingClientRect().height - Math.round(clamp) * line),
      });
    }
    return out;
  });
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
  return partial.length
    ? partial.map((s) => `${s.name} +${s.overflow}pt${s.at ? ` (at ${s.at}pt)` : ''}`).join(', ')
    : null;
}

/**
 * The shots that are not of the top of their screen, which is a different sentence from the
 * one above and is the one a finding about a cut-off row has to be checked against.
 *
 * Separate rather than folded into `longerScreens`, because the two answer different
 * questions and a pass may want to say one without the other: *how much is below this* and
 * *where was this taken from*. A shot with no overflow can still be off the top — that is
 * exactly the state a page left scrolled by a previous step is in.
 */
export function offTheTop(scrolls) {
  const moved = scrolls.filter((s) => s.at > 0);
  return moved.length ? moved.map((s) => `${s.name} at ${s.at}pt`).join(', ') : null;
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
