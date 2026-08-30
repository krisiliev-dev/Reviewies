import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COPY } from '@reviewies/core/copy';

/**
 * A screen with two modes says which one it is in, once, at the top.
 *
 * Discover has two and only ever one at a time: `getSuggestions` builds a feed out of your
 * library and, **only if that comes back empty**, falls back to a trending chart —
 * `if (merged.length > 0) return merged`. So every row is a recommendation or every row is
 * a chart entry, never a mixture.
 *
 * Until §6.169 the screen said `blurb` for both. That sentence — *"Nothing you have already
 * watched or added"* — is true of a chart as well, so nothing on the screen told a person
 * which feed they were reading. And the *rows* carried the difference instead:
 * `narrow-discover-foot.png` shows thirty of them, each with **Popular right now** under its
 * title, in the slot `copy.ts` calls "the line that separates a recommendation from an
 * advert". A sentence repeated on every row it appears on is not what tells them apart.
 *
 * So the mode moved to the top and the rows lost the repetition. §6.104's rule one subject
 * over: "nothing" and "I could not look" are different sentences, and so are "things like
 * what you watch" and "things people are watching".
 *
 * Two halves, and the second is the one that would rot: a screen can quietly go back to
 * putting the mode on the row.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const withoutProse = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const DISCOVER = ['app/src/screens/Discover.tsx', 'mobile/app/(tabs)/discover.tsx'];

describe('the two feeds Discover can be showing', () => {
  it('has a different sentence for each, and neither is the other', () => {
    // Non-vacuity, and the thing the defect actually was: one string for two states.
    expect(COPY.discover.trendingBlurb).not.toBe(COPY.discover.blurb);
    expect(COPY.discover.trendingBlurb.length).toBeGreaterThan(20);
  });

  it('picks between them on both platforms, from the feed rather than from a flag', () => {
    for (const file of DISCOVER) {
      const source = withoutProse(read(file));
      expect(source, `${file} says the same thing for both feeds`).toContain(
        'COPY.discover.trendingBlurb',
      );
      // Read off the suggestions themselves. A separate piece of state saying which mode
      // the screen is in is a second answer to a question the feed already answers, and
      // §6.138 is the entry about what happens when two things answer one question.
      expect(source, `${file} decides its mode from something other than the feed`).toMatch(
        /\?\.\[0\]\?\.trending/,
      );
    }
  });

  it('puts nothing on a trending row where the reason goes', () => {
    /*
     * The half that rots. `COPY.discover.trending` still exists — `offers.test.ts` and the
     * suggestion type both know about the flag — and the easy regression is a screen
     * passing it back into `note`, which is where it was.
     */
    const wrong: string[] = [];
    for (const file of DISCOVER) {
      const source = withoutProse(read(file));
      if (/note=\{[^}]*COPY\.discover\.trending\b/.test(source)) {
        wrong.push(`${file} puts the screen's mode back on every row`);
      }
      // Whitespace-tolerant: the web's expression wraps across three lines once the second
      // argument lands on it, and a needle that a reformat can break is a needle about
      // formatting rather than about the fact. §6.109.
      if (!/trending\s*\?\s*undefined\s*:/.test(source)) {
        wrong.push(`${file} does not leave a trending row's reason empty`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('what the remote drawer says about its connection', () => {
  /*
   * §6.170, and the same defect one screen over: a panel that said *"It will reconnect on
   * its own"* at the top and printed the raw transport error in `trouble` red nine hundred
   * points below, under thirteen keys. Both conditions hold at once, and
   * `dark-11-remote.png` — the drawer's first photograph in this project, because
   * `bridgeConfigured()` had gated it out of every design pass — shows both at once.
   *
   * One place, one register. The error is a footnote under the sentence it qualifies.
   */
  it('says it in one place, and not in the trouble colour', () => {
    const source = withoutProse(read('app/src/remote/RemoteDrawer.tsx'));
    // The state is "reconnecting", which is not trouble — and the panel's own headline
    // says so. A red line under the keys contradicting the sentence above them is the
    // thing this holds shut.
    expect(source, 'the remote drawer paints a connection state as trouble').not.toMatch(
      /text-trouble/,
    );
    /*
     * And the detail is drawn in the quiet ink, under the sentence it qualifies.
     *
     * The first draft sliced the file from `function Status(` and asked it to contain
     * `bridge.error` — and `clauses.test.ts` refused it, correctly: that string occurs
     * three times in the file, so the needle cannot say *which* of them it found. The
     * line below occurs once and says the thing that matters, which is the register.
     */
    expect(source, 'the transport error is not with the sentence it qualifies').toMatch(
      /text-ink-tertiary">\{bridge\.error\}/,
    );
  });
});

describe('a connection that has been refused', () => {
  /*
   * §6.171. `relay/src/server.ts` closes with **1008** and a reason when the pairing
   * parameters are wrong — so the app has always been able to tell a relay that declined
   * this connection from one that is merely down, and did not. It said *"Bridge offline.
   * It will reconnect on its own"* for both, and dialled again every five seconds forever
   * to keep making a promise it cannot keep.
   *
   * §6.43 fixed the *reporting* of a 1008 and left the loop, which is how the sentence and
   * the behaviour were both still wrong two dozen sprints later. Two halves, both held.
   */
  const bridge = () => read('app/src/remote/useBridge.ts');

  it('is a status of its own, told apart from being down', () => {
    expect(withoutProse(bridge()), 'useBridge cannot tell refused from disconnected').toMatch(
      /'refused'/,
    );
    expect(
      withoutProse(read('app/src/remote/RemoteDrawer.tsx')),
      'the drawer says the same thing for a refusal as for an outage',
    ).toMatch(/status === 'refused'/);
  });

  it('stops dialling, because the next attempt is refused for the reason the last one was', () => {
    const source = withoutProse(bridge());
    // The 1008 branch returns *before* the retry is scheduled. Read as: between the code
    // check and the end of the handler there is a `return` and no `setTimeout`.
    const branch = /if \(event\.code === 1008\) \{([\s\S]*?)\}/.exec(source)?.[1] ?? '';
    expect(branch, 'nothing handles a refusal separately').toContain('return');
    expect(branch, 'a refusal still schedules a retry').not.toContain('setTimeout');
  });
});

describe('a year in review', () => {
  /*
   * §6.171, from `dark-06-stats-year.png` — the first photograph of a chosen year, taken by
   * §6.170. The card read "Your 2026 / 1.0 days / across 50 episodes and 3 titles" over four
   * tiles reading *Watched 1.0 days*, *Episodes 50*, *Titles 3*: three of four repeated the
   * card, one screen apart, in two shapes. A review that opens by restating its own contents
   * is not a review.
   *
   * Headline and breakdown, neither saying the other's part — and on both platforms, since
   * the phone had no card at all.
   */
  it('is a headline on both platforms, and neither repeats the other', () => {
    for (const file of ['app/src/screens/Stats.tsx', 'mobile/app/stats.tsx']) {
      const source = withoutProse(read(file));
      expect(source, `${file} has no year headline`).toContain('COPY.stats.yourYear');
      // The prose restatement of two tiles, gone rather than merely reworded.
      expect(source, `${file}'s headline recites the tiles under it`).not.toMatch(
        /across \{?summary\.episodes/,
      );
      // And the tile the headline already gave is not drawn beside it.
      expect(source, `${file} draws Watched beside a headline that just said it`).toMatch(
        // §6.177 gave that label an owner, so the pin reads the reference. What it is about —
        // the figure being *conditional* on not being the year review — is unchanged.
        /(!isYearReview|year === undefined) &&\s*(<Tile label=\{COPY\.stats\.watched\}|\(\s*<Figure label=\{COPY\.stats\.watched\})/,
      );
    }
  });
});
