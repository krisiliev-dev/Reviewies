import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BLOCK } from '@reviewies/core/ui/block';
import { space, text } from '@reviewies/core/tokens';

/**
 * `Block` — a section label and the thing it labels — and the drift that proves it is one
 * object.
 *
 * `Section` drew the label. Nothing drew the pair, so five phone screens and three web
 * ones assembled it by hand and disagreed twice over:
 *
 * - **the label had two treatments.** `data.tsx`, `stats.tsx` and the web's `Settings.tsx`
 *   used `Section` — the `s12` eyebrow. `account.tsx`, `people.tsx`,
 *   `comments/[targetId].tsx`, `AccountPanel.tsx` and `People.tsx` used a hand-written
 *   `s16` in the title face, inside a raised card.
 * - **the gap had three values**: 12 on the phone's data, account and people screens, 8 in
 *   comments, and `mb-1` — four pixels — on the web.
 *
 * `people.tsx` did **both, in one scroll view**: `<Section>Find people</Section>` and a
 * boxed `s16` "You". That is the whole argument. A considered distinction between two
 * kinds of block does not appear twice in one file under two spellings.
 *
 * And `data.tsx` had already written the component, locally, with a comment reading *"this
 * is the box, `Section` is the label on it, and one file holding both under one name is how
 * the label ended up hand-written nine times."* The diagnosis was right and it was made
 * where only one screen could benefit.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const withoutProse = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist', '.expo'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(path, out);
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

describe('a labelled block', () => {
  it('has one gap, on the scale', () => {
    expect(BLOCK.gap).toBe(space.s12);
    expect(Object.values(space), "the label's gap is off the scale").toContain(BLOCK.gap);
  });

  it('draws its label with Section on both platforms, from the table', () => {
    const phone = withoutProse(read('mobile/src/ui/Block.tsx'));
    expect(phone).toContain('<Section>{heading}</Section>');
    expect(phone).toContain('gap: BLOCK.gap');

    const web = withoutProse(read('app/src/ui/Block.tsx'));
    expect(web).toContain('<Section>{heading}</Section>');
    expect(web, "the web's gap left the table").toContain(`gap-s${BLOCK.gap}`);
  });

  /**
   * Files where an `s16` title-face heading is **not** a block label, and why.
   *
   * The first version of the clause below swept every `<h2 class="… text-s16 …">` and
   * caught two I had not counted. They are not the same object: an overlay has a *title*
   * — the sheet's subject, the drawer's name — and a screen has *labelled blocks*. Both
   * platforms already agree on `s16` for the overlay title (`mobile/src/ui/CatchUp.tsx`
   * line 179 says the same thing the web does), so there is no drift there to fix.
   *
   * That distinction is real and the treatment is still unowned, which is a later sprint
   * rather than this one. What was diagnosed here is the *block label*, and the evidence
   * was one file spelling it both ways; forcing the overlay title to `Masthead.sub` for
   * tidiness would be fixing something nobody has shown to be broken — which is the
   * mistake the last four sprints kept catching in their own briefs.
   */
  const NOT_A_BLOCK_LABEL: Record<string, string> = {
    'app/src/ui/CatchUp.tsx': "The sheet's title, not a label on a block inside it. Both platforms already agree on s16 here; the treatment is unowned but it is not drifting.",
    'app/src/remote/RemoteDrawer.tsx': "The drawer's title, same object as the sheet's. Named so the sweep below stays about the thing that was actually diagnosed.",
  };

  it('is the only thing that heads a block, so the s16 treatment is gone', () => {
    /*
     * The needle is the treatment, not the component: seven sites wrote an `s16` title-face
     * heading over a block, and the point of this sprint is that they were `Section`'s job
     * all along. A site that spells it again is the eighth.
     */
    const offenders: string[] = [];
    for (const file of filesUnder('app/src')) {
      if (NOT_A_BLOCK_LABEL[file]) continue;
      for (const m of withoutProse(read(file)).matchAll(/<h[23] className="([^"]*)"/g)) {
        if (/\btext-s16\b/.test(m[1])) offenders.push(`${file}: ${m[1]}`);
      }
    }
    for (const file of [...filesUnder('mobile/app'), ...filesUnder('mobile/src')]) {
      for (const m of withoutProse(read(file)).matchAll(/^\s*card[A-Za-z]*[Hh]eading: \{[^\n]*/gm)) {
        offenders.push(`${file}: ${m[0].trim()}`);
      }
    }
    expect(offenders).toEqual([]);

    // §6.41: the exemptions cannot outlive the files they excuse, and each gives a reason
    // rather than a shrug.
    for (const [file, why] of Object.entries(NOT_A_BLOCK_LABEL)) {
      expect(() => read(file), `${file} is gone; drop its exemption`).not.toThrow();
      expect(why.length, `${file}'s exemption gives no reason`).toBeGreaterThan(40);
    }
  });

  it('is what the screens that were doing it by hand now call', () => {
    const callers: string[] = [];
    for (const file of [...filesUnder('mobile/app'), ...filesUnder('mobile/src'), ...filesUnder('app/src')]) {
      if (file.endsWith('ui/Block.tsx')) continue;
      if (/<Block\b/.test(withoutProse(read(file)))) callers.push(file);
    }
    /*
     * Six files, exact. `data.tsx` (which had the local copy), `account.tsx`, `people.tsx`
     * and `comments/[targetId].tsx` on the phone; `AccountPanel.tsx` and `People.tsx` on
     * the web. No margin: a floor with slack in it tolerates a screen quietly going back
     * to assembling the pair by hand, which is the accident this exists to notice.
     */
    expect(callers.length, 'a screen stopped using Block; say why').toBe(6);
    // And both platforms are in that set, because the last four sprints were all about one
    // platform moving alone.
    expect(callers.some((f) => f.startsWith('mobile/'))).toBe(true);
    expect(callers.some((f) => f.startsWith('app/'))).toBe(true);
  });

  it('does not let the label size drift back to a fourth step', () => {
    // `Section` is s12; the boxed heading was s16. Both are on the scale, which is why no
    // type guard objected to seven sites carrying the second one for the same job.
    expect(text.s12).toBeLessThan(text.s16);
    expect(read('core/src/ui/block.ts'), 'the block grew its own type')
      .not.toMatch(/fontSize|text\.s\d/);
  });
});
