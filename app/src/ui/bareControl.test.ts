import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { jsxElements, stripComments, styleOf } from '@reviewies/core/test/source';

/**
 * No control outside the component set draws its own fill, rule or padding.
 *
 * This is the guard `accentFill.test.ts` has been waiting on since §6.99, in that file's
 * own words: *"the wider rule this came out of — no bare control carrying its own
 * background, border or padding — is not this, and is not landed."* It could not land
 * because three surfaces had no component to point at, and because §6.99's own probe was
 * wrong about the size of the job.
 *
 * ## The count, three times
 *
 * **Fifty-seven** in §6.99, after a first probe said eighteen — it split each file on the
 * tag and took the head up to the first `>`, and `onPress={() => setOpen(false)}` contains
 * a `>`, so every control with an arrow-function handler was read as clean.
 *
 * **Thirty-two** when re-measured in §6.131 with `jsxElements` — which is that walker,
 * moved into `core/src/test/source.ts` so the next probe is built from it rather than
 * rewritten without it. Twenty-six of the fifty-seven went with §6.122's accent-fill
 * migration.
 *
 * And thirty-two was itself two numbers. A first pass reported twenty-three and **every
 * one was on the web**, which is the tell: the phone writes `style={styles.retry}` and the
 * dress is two hundred lines away in `StyleSheet.create`. A probe that reads only the
 * opening tag cannot see a phone control at all. `styleOf` resolves them, and nine of the
 * thirty-two were the phone's.
 *
 * **Seven** now, and every one is named below with a reason.
 */
const ROOT = resolve(import.meta.dirname, '../../..');

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'dist-signedin', '.expo'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, out);
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

/** `app/src/ui/Name.tsx` and `mobile/src/ui/Name.tsx`, by shape rather than by a list. */
const COMPONENT = /(app[/\\]src[/\\]ui|mobile[/\\]src[/\\]ui)[/\\][A-Z]/;

const FILES = [
  ...sources(resolve(ROOT, 'app/src')),
  ...sources(resolve(ROOT, 'mobile/app')),
  ...sources(resolve(ROOT, 'mobile/src')),
].filter((path) => !COMPONENT.test(relative(ROOT, path)));

/** The tags that are controls. `Link` and `a` included: a link is pressed too. */
const CONTROLS = ['Pressable', 'TouchableOpacity', 'button', 'Link', 'a'];

/** A fill, a rule or padding — the three things a component is supposed to own. */
const DRESSED =
  /\b(backgroundColor|borderWidth|borderColor|borderRadius|padding|paddingHorizontal|paddingVertical)\s*:|(?:^|[\s"'`])(bg-|border(?![-\w]*none)|rounded-|p-\d|px-|py-)/;

/**
 * The seven, each with the reason it is not a `Button` or a `Row`.
 *
 * An exemption list, not a budget. The difference is that every line here is a *claim*
 * about one control, and the clause below fails if the file it names stops containing
 * one — so an exemption cannot outlive the thing it excuses, which is §6.41's rule and the
 * reason `screen.ts` spells its two lists this way.
 *
 * Two of these are jobs for a component that does not exist yet, and they are the same two
 * `accentFill.test.ts` has named since §6.99. They stay here until somebody builds it.
 */
const EXEMPT: Record<string, string> = {
  'app/src/App.tsx':
    'The skip link. It is invisible until focused and then has to paint itself somewhere ' +
    'over the page — no component does that, and there is exactly one of them.',
  'app/src/remote/RemoteDrawer.tsx':
    'The drawer handle: a tab on the screen edge, deliberately not a button shape. It is ' +
    'a component\'s own internals — the drawer lives outside `src/ui/`, which is the only ' +
    'reason the filter above does not already skip it.',
  'mobile/src/devices/RemoteDrawer.tsx':
    'The same handle on the phone, and the scrim — which is not a control at all: it is ' +
    '`aria-hidden` and unnamed on purpose, so that dismissing by tapping away does not put ' +
    'a second "Close remote" in the reading order.',
  'mobile/src/devices/RemotePanel.tsx':
    'The device list. A row in a list of things, so it wants `Row` rather than `Button` — ' +
    'and `Row` on the phone carries a title, a lead and an `under`, none of which a bare ' +
    'device name needs. Named by `accentFill.test.ts` since §6.99 as a surface with no ' +
    'component; it still has none.',
  'mobile/app/data.tsx':
    'The switch row — `accessibilityRole="switch"`, the one control kind this design has ' +
    'never drawn. The second surface `accentFill.test.ts` named in §6.99, still unbuilt.',
  'mobile/app/watching/[targetId].tsx':
    'The drift banner: a whole pressable sentence offering to correct the clock, which is ' +
    'not a button, a row or a note but something of its own. The third of §6.99\'s three.',
};

describe('a control outside the component set', () => {
  it('reads the screens rather than nothing', () => {
    // The clause below is `toEqual([])`, which an empty file list satisfies for free.
    expect(FILES.length).toBeGreaterThan(30);
  });

  it('does not draw its own fill, rule or padding', () => {
    const bare: string[] = [];
    for (const file of FILES) {
      const key = relative(ROOT, file).replace(/\\/g, '/');
      if (EXEMPT[key]) continue;
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const tag of CONTROLS) {
        for (const { open } of jsxElements(source, tag)) {
          // Everything the dress could come from: the inline class or style, and every
          // `styles.NAME` the control names, resolved to its declaration. Reading only the
          // opening tag makes every phone control look clean.
          let dress = open;
          for (const named of open.matchAll(/styles\.([A-Za-z0-9_]+)/g)) {
            dress += `\n${styleOf(source, named[1]) ?? ''}`;
          }
          if (DRESSED.test(dress)) bare.push(`${key}: ${open.replace(/\s+/g, ' ').slice(0, 70)}`);
        }
      }
    }
    expect(bare).toEqual([]);
  });

  it('keeps no exemption for a control that has stopped existing', () => {
    // §6.41's rule. Every line in `EXEMPT` is a claim that *this file* still has a control
    // the rule cannot cover; when the last one goes, the reason has to go with it.
    const stale: string[] = [];
    for (const key of Object.keys(EXEMPT)) {
      const source = stripComments(readFileSync(resolve(ROOT, key), 'utf8'));
      const found = CONTROLS.flatMap((tag) => jsxElements(source, tag)).some(({ open }) => {
        let dress = open;
        for (const named of open.matchAll(/styles\.([A-Za-z0-9_]+)/g)) {
          dress += `\n${styleOf(source, named[1]) ?? ''}`;
        }
        return DRESSED.test(dress);
      });
      if (!found) stale.push(`${key} is exempt and has no bare control left`);
    }
    expect(stale).toEqual([]);
  });
});
