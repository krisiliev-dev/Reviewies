import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { stripComments } from '@reviewies/core/test/source';
import { TONE } from '@reviewies/core/ui/button';
import { CHOSEN } from '@reviewies/core/ui/choice';

/**
 * The one filled shape in the app, and the two components allowed to draw it.
 *
 * §6.90 spent 822 sites turning fills into rules so that a shape would mean something, and
 * what the accent fill was left meaning is **the thing on this screen worth pressing**.
 * Twenty-six call sites outside the component set painted it themselves anyway, and about
 * half of those were not actions at all: they were selected states — a chip that is on, a
 * toggle that is held, a verdict dot — using the loudest shape in the product to say
 * "already chosen", which is the opposite of what it means.
 *
 * So the rule is narrow and complete: `Button`'s primary tone owns the fill, `Choice` draws
 * being chosen without one, and no screen paints it. There is no exemption list here,
 * deliberately — a guard lands with its migration or not at all, and a budget is an
 * allowlist that counts.
 *
 * The wider rule this came out of — no bare control carrying its own background, border or
 * padding — is not this, and is not landed. It had fifty-seven violations when measured
 * properly (§6.99), and the remainder are surfaces with no component yet: Watching Mode's
 * emoji pad, the remote's device list, `data.tsx`'s switch row. A component has to exist
 * before a guard can point at it.
 */
const ROOT = resolve(import.meta.dirname, '../../..');

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.expo') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, out);
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

/**
 * The component set: `app/src/ui/Name.tsx` and `mobile/src/ui/Name.tsx`.
 *
 * By *shape*, not by a list of filenames. A list would need editing every time a component
 * is added, and the thing that gets forgotten is the edit — which is how an exemption
 * outlives the thing it excuses (§6.59).
 */
const COMPONENT = /(app[/\\]src[/\\]ui|mobile[/\\]src[/\\]ui)[/\\][A-Z]/;

const FILES = [
  ...sources(resolve(ROOT, 'app/src')),
  ...sources(resolve(ROOT, 'mobile/app')),
  ...sources(resolve(ROOT, 'mobile/src')),
].filter((path) => !COMPONENT.test(relative(ROOT, path)));

describe('the accent fill', () => {
  it('reads the screens rather than nothing', () => {
    // The clause below is `toEqual([])`, which an empty file list satisfies for free —
    // an empty state is a claim about somebody's own data (§6.56), and so is this.
    expect(FILES.length).toBeGreaterThan(30);
  });

  it('is what `Button` fills with, and the only thing that fills with it', () => {
    expect(TONE.primary.fill).toBe('actionFill');
    // And no other tone does. Red only ever means trouble; grey read as disabled through
    // three design reviews, which is why `secondary` is an outline.
    for (const [name, shape] of Object.entries(TONE)) {
      if (name !== 'primary') expect(shape.fill, `${name} is filled too`).toBe(null);
    }
  });

  it('is not how anything says "this one is chosen"', () => {
    /*
     * `Choice` draws selection as a rule and a weight step, and `Button.selected` reuses
     * the same table rather than a second spelling. Neither touches the fill: a filled
     * chip on a ruled page is the last card left in the app, and it would compete with the
     * one control on the screen worth pressing.
     */
    expect(CHOSEN.colour).toBe('workingMark');
    expect(CHOSEN.colour).not.toBe(TONE.primary.fill);
  });

  it('is painted by no screen, on either platform', () => {
    const offenders: string[] = [];
    for (const path of FILES) {
      const rel = relative(ROOT, path);
      const source = stripComments(readFileSync(path, 'utf8'));
      // Each platform's own spelling of the same token: the generated Tailwind utility on
      // the web, the generated theme object on the phone.
      const paints = rel.startsWith('mobile') ? /theme\.actionFill/ : /\bbg-action-fill\b/;
      if (paints.test(source)) offenders.push(rel);
    }
    expect(offenders, 'a screen painting the action fill itself').toEqual([]);
  });

  it('and neither is the label that goes on it', () => {
    /*
     * The other half, and the half a `bg-` search alone would miss. `action-label` is the
     * ink that reads on the accent fill and nothing else — a screen writing it is a screen
     * that either has a fill this guard did not catch, or has painted an unreadable label
     * on some other ground.
     */
    expect(TONE.primary.label).toBe('actionLabel');
    const offenders: string[] = [];
    for (const path of FILES) {
      const rel = relative(ROOT, path);
      const source = stripComments(readFileSync(path, 'utf8'));
      const paints = rel.startsWith('mobile') ? /theme\.actionLabel/ : /\btext-action-label\b/;
      if (paints.test(source)) offenders.push(rel);
    }
    expect(offenders, 'a screen writing the label that belongs on the fill').toEqual([]);
  });
});
