import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SCREEN_STATES, phoneRoutes, webRoutes } from './screenStates';

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

/**
 * The inventory in `screenStates.ts` says which of each screen's states anything has
 * ever rendered. A list like that is worth exactly as much as its accuracy, and the
 * failure mode is not that somebody lies in it — it is that a screen is added, or a
 * route renamed, and the list quietly stops describing the app.
 *
 * So the list is checked against the app rather than read: every route the routers
 * actually have must appear, and no row may name a route that has been deleted. What
 * cannot be checked mechanically — whether "the catch-up sheet, open" really is driven
 * on every run — is left to the reasons written beside each entry, which is why they
 * are required rather than optional.
 */
describe('the screen-state inventory', () => {
  const web = SCREEN_STATES.filter((s) => s.platform === 'web').map((s) => s.route);
  const phone = SCREEN_STATES.filter((s) => s.platform === 'phone').map((s) => s.route);

  it('covers every route the web app has, and no route it does not', () => {
    expect([...web].sort()).toEqual([...webRoutes(ROOT)].sort());
  });

  it('covers every route the phone has, and no route it does not', () => {
    expect([...phone].sort()).toEqual([...phoneRoutes(ROOT)].sort());
  });

  it('finds the routes rather than trusting a hardcoded list', () => {
    // Non-vacuity for the two readers above: if either silently returned nothing, both
    // assertions would be comparing an empty list with an empty list.
    expect(webRoutes(ROOT).length).toBeGreaterThan(10);
    expect(phoneRoutes(ROOT).length).toBeGreaterThan(10);
    expect(webRoutes(ROOT)).toContain('*');
    expect(phoneRoutes(ROOT)).toContain('+not-found');
  });

  it('names one state per screen at least, and no duplicates', () => {
    for (const screen of SCREEN_STATES) {
      expect(screen.states.length, `${screen.platform} ${screen.route}`).toBeGreaterThan(0);
      const names = screen.states.map((s) => s.name);
      expect(new Set(names).size, `${screen.platform} ${screen.route}`).toBe(names.length);
    }
  });

  it('says why, for everything nothing has ever rendered', () => {
    // The whole value of a `never` is the reason beside it. Without one it is a shrug.
    for (const screen of SCREEN_STATES) {
      for (const state of screen.states) {
        if (state.verdict !== 'never') continue;
        expect(state.why, `${screen.platform} ${screen.route}: ${state.name}`).toBeTruthy();
      }
    }
  });

  it('is not quietly all-green', () => {
    // The way this list rots is not that somebody writes a false `suite` — it is that
    // the honest entries are flipped one at a time until nothing is left admitting to
    // anything. If that ever becomes true, it should be true on purpose.
    const never = SCREEN_STATES.flatMap((s) => s.states).filter((s) => s.verdict === 'never');
    expect(never.length).toBeGreaterThan(10);
  });

  it('does not claim a suite renders a screen its suite never mentions', () => {
    const smoke = { web: read('app/smoke.mjs'), phone: read('mobile/smoke.mjs') };
    // The route as the suite would refer to it: the last meaningful segment, which is
    // what appears in a URL, a link name or a screenshot filename. A weak link on
    // purpose — it cannot tell which *state* was reached — but it does catch a whole
    // screen being claimed by a suite that has never heard of it.
    const missing: string[] = [];
    for (const screen of SCREEN_STATES) {
      if (!screen.states.some((s) => s.verdict === 'suite')) continue;
      const segment = screen.route
        .replace(/^\(tabs\)\//, '')
        .replace(/\/\[?[\w:.]+\]?$/, '')
        .replace(/[^\w-]/g, '');
      // '/' and '*' reduce to nothing, and the phone spells Up Next 'index'. Both are
      // unmistakably driven — they are where each run starts — and neither leaves a
      // word to look for.
      if (!segment || segment === 'index') continue;
      // Case-insensitively: a suite refers to Discover by its label and to the calendar
      // by its filename, and which one it happens to be is not the point here.
      if (!smoke[screen.platform].toLowerCase().includes(segment.toLowerCase())) {
        missing.push(`${screen.platform} ${screen.route} (looked for "${segment}")`);
      }
    }
    expect(missing).toEqual([]);
  });
});
