import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { jsxElements, stripComments } from '@reviewies/core/test/source';
import { ROW, ROW_INK, ROW_LINES } from '@reviewies/core/ui/row';
import { border, color, size } from '@reviewies/core/tokens';
import { CLAMP } from './clamp';

/**
 * The listing row, held to the rule that is not a style rule.
 *
 * A row is not one control. It exposes at most one navigation target and one action, and
 * every name carries what tells that row from its neighbours. `calendar.tsx` was the row
 * the design doc named as still getting this wrong — the whole entry a single `Pressable`
 * labelled `Open {name}`, so the episode code and name were announced twice or not at all.
 */
const ROOT = resolve(import.meta.dirname, '../../..');
const read = (path: string) => stripComments(readFileSync(resolve(ROOT, path), 'utf8'));

/** Every `.tsx` under a directory, so a clause can sweep call sites rather than name them. */
function filesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist', '.expo'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(path, out);
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

const RENDERERS = {
  phone: read('mobile/src/ui/Row.tsx'),
  web: read('app/src/ui/Row.tsx'),
};
const BOTH = Object.entries(RENDERERS);

/** The call sites migrated so far. Each one that lands joins this list. */
const MIGRATED = {
  'mobile/src/ui/Coming.tsx': 'phone',
  'app/src/ui/Coming.tsx': 'web',
  'mobile/app/(tabs)/watchlist.tsx': 'phone',
  'app/src/screens/Watchlist.tsx': 'web',
  'mobile/app/(tabs)/index.tsx': 'phone',
  'app/src/screens/UpNext.tsx': 'web',
  'mobile/app/title/[id].tsx': 'phone',
  'app/src/screens/TitleDetail.tsx': 'web',
  'mobile/app/(tabs)/discover.tsx': 'phone',
  'app/src/screens/Discover.tsx': 'web',
  'mobile/app/lists.tsx': 'phone',
  'app/src/screens/Lists.tsx': 'web',
  'mobile/app/people.tsx': 'phone',
  'app/src/screens/People.tsx': 'web',
  'mobile/src/ui/MatchImports.tsx': 'phone',
  'app/src/ui/MatchImports.tsx': 'web',
  'mobile/app/(tabs)/more.tsx': 'phone',
  'app/src/screens/More.tsx': 'web',
} as const;

describe('the listing row', () => {
  it('reads two renderers and one table', () => {
    for (const [platform, source] of BOTH) expect(source.length, platform).toBeGreaterThan(1500);
    expect(ROW.rule).toBe(border.hairline);
    expect(ROW.minHeight.index).toBe(size.target);
  });

  it('is a rule and a bleed, not a rounded fill with a gutter', () => {
    /*
     * The direction's objection, and the site it was written for: thirty-nine
     * `backgroundColor` declarations that exist to separate one row from the next, which
     * is what a one-point rule is for. A migrated screen that keeps its own card is a
     * screen that did not migrate.
     */
    expect(RENDERERS.phone).toContain('borderBottomWidth: ROW.rule');
    expect(RENDERERS.phone).toContain("backgroundColor: 'transparent'");
    expect(RENDERERS.web).toContain('border-b border-b-stroke-hairline bg-transparent');
  });

  it('is what the migrated screens use, rather than one they built themselves', () => {
    /*
     * Named for what it measures. The first version of this looked for
     * `backgroundColor: theme.groundRaised` anywhere in a migrated file and reported the
     * calendar's *notification panel* — a card that is a card, on a screen that also has
     * rows. "No card fill on this screen" is not the rule; "these screens no longer build
     * their own rows" is, and a poster wrapped in a link the screen owns is what building
     * one looks like.
     */
    for (const [path, platform] of Object.entries(MIGRATED)) {
      const source = read(path);
      expect(source, `${path} does not use the component`).toMatch(/<(Base)?Row\b/);
      const own = platform === 'phone' ? /<Pressable[^>]*>\s*<Poster/ : /<Link[^>]*>\s*<Poster/;
      expect(own.test(source), `${path} still wraps its own poster in its own target`).toBe(
        false,
      );
    }
  });

  it('goes nowhere unless it says where', () => {
    /*
     * `open.name` is required in the contract, so a target with no name is a compile
     * error rather than a screen reader saying "button". And the renderer is only
     * pressable when `open` is given: a card that navigates without announcing it is
     * worse than a card that does not navigate.
     */
    // The required field, not the whole type: `RowOpen` has changed shape twice — it grew
    // a `does` flag for MatchImports and #170 replaced that with a `to` | `run` union,
    // which also turned it from an `interface` into a `type`. A clause pinned to the
    // declaration's exact text would have failed both times for a reason that has nothing
    // to do with what it is named for.
    expect(read('core/src/ui/row.ts')).toMatch(/RowOpen = \{ name: string \}/);
    expect(RENDERERS.phone).toContain('accessibilityLabel={open.name}');
    expect(RENDERERS.web).toContain('aria-label={open.name}');
    for (const [platform, source] of BOTH) {
      expect(source, `${platform} presses without an open`).toMatch(/\{open \?/);
    }
  });

  it('says whether pressing a row opens something or answers something', () => {
    /*
     * MatchImports is the row that is a choice: three candidate posters for an imported
     * show, and pressing one *is* the answer — nothing opens.
     *
     * The contract used to say this twice. The web derived the role from `to` versus
     * `run`; the phone's `open` only ever carried `run` — eight call sites passed
     * `run: () => router.push(…)` — so it could not tell a destination from an action and
     * read a separate `does?: 'navigate' | 'act'` flag instead, defaulting to `navigate`.
     * A row with `run` and no `does` was therefore a **button on the web and a link on the
     * phone**, which is what §6.134 hit on the calendar.
     *
     * #170: the flag is gone and the route is data. `to` or `run`, in the shared contract,
     * and both renderers read the role off which field is set.
     */
    expect(read('core/src/ui/row.ts')).toMatch(/\{ to: string; run\?: never \}/);
    expect(read('core/src/ui/row.ts')).toMatch(/\{ run\(\): void; to\?: never \}/);
    expect(read('core/src/ui/row.ts'), 'the flag is back').not.toMatch(/does\?:/);
    /*
     * The *role*, on each platform, not merely that the union is mentioned somewhere in
     * the file. The first version of this was the loose version and a plant walked through
     * it: hard-coding `accessibilityRole="link"` on the phone left `onPress` still
     * branching on `open.to`, so the file matched and the row lied. §6.120's shape again —
     * a clause easier to satisfy than its name.
     */
    expect(RENDERERS.phone, 'the phone hard-codes a role').toMatch(
      /accessibilityRole=\{open\.to (===|!==) undefined \?/,
    );
    // The web has no role attribute: an `<a href>` and a `<button>` carry their own, which
    // is the reason it renders two different elements instead of one with a prop.
    expect(RENDERERS.web, 'the web stopped choosing its element').toMatch(
      /open\.to (===|!==) undefined \?[\s\S]{0,120}<Link/,
    );
    expect(RENDERERS.web, 'the web target is not a button when there is no URL').toMatch(
      /<button type="button" onClick=\{open\.run\}/,
    );

    /*
     * *Every* row on that screen, not one of them. The first version of this was a
     * `toContain`, and the web file has two candidate lists — so deleting the marker from
     * one of them left the clause green, which is the check-easier-than-its-name shape
     * this codebase keeps finding in its own instruments. Both files have exactly one
     * screen's worth of rows and all of them choose, so the rule is: on MatchImports,
     * every row acts — no `to` anywhere.
     */
    for (const path of ['mobile/src/ui/MatchImports.tsx', 'app/src/ui/MatchImports.tsx']) {
      const opens = read(path).split('open={{').slice(1);
      expect(opens.length, `${path}: no rows found to check`).toBeGreaterThan(0);
      for (const [i, body] of opens.entries()) {
        const open = body.slice(0, body.indexOf('}}'));
        expect(open, `${path} row ${i + 1} presses to choose and calls it navigation`).toMatch(
          /\brun:/,
        );
        expect(open, `${path} row ${i + 1} presses to choose and calls it navigation`).not.toMatch(
          /\bto:/,
        );
      }
    }

    /*
     * And no phone call site may hide a route in a callback again, which is the thing that
     * made the flag necessary. A `router.push` inside a `Row`'s `open` is a destination the
     * contract cannot see.
     */
    const hiding = [];
    for (const path of Object.keys(MIGRATED).filter((p) => MIGRATED[p as keyof typeof MIGRATED] === 'phone')) {
      for (const open of read(path).split('open={{').slice(1)) {
        const body = open.slice(0, open.indexOf('}}'));
        if (/router\.push/.test(body)) hiding.push(path);
      }
    }
    expect(hiding, 'a route hidden inside a row callback').toEqual([]);
  });

  it('keeps the target one control, with the rest outside it', () => {
    /*
     * The §6.96 collision, encoded: the poster and the words were separate links to the
     * same route under the same name on two screens. One target wraps both, and
     * `trailing`/`under` sit outside it — a control inside a control is unreachable by a
     * screen reader and ambiguous to everything else.
     */
    /*
     * Read the target elements, not a window around them. The first version of this
     * sliced from `{open ?` to the first `{trailing}` — so the plant that moved
     * `{trailing}` *inside* the link became the slice's own end marker, the window
     * collapsed to nothing, and the check passed on the defect it was written for. A
     * check whose window is defined by the token it is hunting for finds nothing.
     *
     * What the target renders is exactly `{inside}`. That is the claim, so that is the
     * assertion.
     */
    /**
     * The children of one JSX element, found by walking rather than by regex.
     *
     * `[^>]*>` stopped inside `style={({ pressed }) => [...]}`, because an arrow function
     * in a prop contains a `>`. Tracking brace depth is what tells an attribute's `>`
     * from the tag's own.
     *
     * The walker was written here and lived here, privately, and §6.99 then wrote a fresh
     * probe four days later without it and mis-measured a migration by thirty-nine. It is
     * `jsxElements` in `core/src/test/source.ts` now — §6.131 moved it, and this is the
     * call site that proves the move is real rather than a claim in a commit message.
     */
    const childrenOf = (source: string, tag: string): string[] =>
      jsxElements(source, tag)
        .map(({ children }) => children)
        .filter((children): children is string => children !== undefined);

    for (const [platform, source] of BOTH) {
      const targets = ['Link', 'Pressable', 'button'].flatMap((tag) => childrenOf(source, tag));
      expect(targets.length, `${platform}: no target found to check`).toBeGreaterThan(0);
      for (const body of targets) {
        expect(body.trim(), `${platform}: a target rendering more than the row`).toBe('{inside}');
      }
      expect(source, `${platform} has nowhere to put a group`).toContain('{under}');
    }
  });

  it('does not let the browser centre a row whose target is a button', () => {
    /*
     * `Row` opens either a `<Link>` or a `<button>`, and their UA defaults disagree:
     * `text-align: start` against `center`. Every call site passed `open.to` until §6.131,
     * so the `run` branch had never rendered — and the one that used it put a row's title
     * and sub-line in the middle of the screen.
     *
     * The clause is on the shared class rather than on either branch: whatever the two
     * render, they must not disagree about where the words start.
     */
    expect(RENDERERS.web, 'the web target does not reset text alignment').toMatch(
      /const TARGET =[\s\S]*?text-left/,
    );
  });

  it('is inside a list on the web, because it renders a list item', () => {
    /*
     * `Row` is an `<li>`. §6.131 migrated Settings' People link to it and dropped the row
     * straight into a `flex flex-col`, and `light-10-settings` — the first photograph the
     * web app has ever had — shows what that looks like: the title and its sub-line
     * centred in the middle of the screen, reading as neither a row nor a heading.
     *
     * It is also invalid markup, and that half is the reason this is a clause rather than
     * a note. An `<li>` outside a list announces as a list item belonging to no list, and
     * nothing in the suite could see it: every other call site happened to be inside a
     * `.map()` under a `<ul>`, so the rule was true by habit and had never been stated.
     *
     * Reading structure rather than text: a `<Row` whose nearest enclosing tag among
     * `ul`/`ol` is missing. Crude, and it does not need to be clever — the failure is a
     * call site with no list anywhere above it in the file's own JSX.
     */
    const offenders: string[] = [];
    for (const file of filesUnder('app/src')) {
      const source = read(file);
      if (!/<Row\b/.test(source) || file.endsWith('ui/Row.tsx')) continue;
      // `WhereToWatch` has a local `Row` of its own that is not this component.
      if (!source.includes("from './Row'") && !source.includes("from '../ui/Row'")) continue;
      for (const at of [...source.matchAll(/<Row\b/g)].map((m) => m.index ?? 0)) {
        const before = source.slice(0, at);
        const opens = (before.match(/<(?:ul|ol)\b/g) ?? []).length;
        const closes = (before.match(/<\/(?:ul|ol)>/g) ?? []).length;
        if (opens <= closes) offenders.push(`${file}: a <Row> with no list around it`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('steps the ink rather than fading it, and reads on the ground', () => {
    // The same rule `Button` and `Key` follow: disabled is a step to tertiary, never an
    // opacity, because a faded fill reads as broken rather than as waiting.
    expect(ROW_INK.disabled).toBe('inkTertiary');
    for (const [platform, source] of BOTH) {
      expect(source, `${platform} fades a disabled row`).not.toMatch(/opacity/);
    }
    const luminance = (hex: string) => {
      const v = hex.replace('#', '');
      const ch = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
      const lin = ch.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    };
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const theme of ['dark', 'light'] as const) {
      const table = color[theme];
      expect(contrast(table[ROW_INK.title], table.ground), `${theme} title`).toBeGreaterThan(4.5);
      expect(contrast(table[ROW_INK.meta], table.ground), `${theme} meta`).toBeGreaterThan(4.5);
      expect(contrast(table[ROW_INK.disabled], table.ground), `${theme} off`).toBeGreaterThan(4.5);
    }
  });

  it('truncates every slot at the number the table gives, on both platforms', () => {
    /*
     * §6.179. The phone gave `note` two lines and the web gave it `truncate`, which is one
     * — a sentence cut short on one platform and not the other, in the component §6.140 and
     * §6.141 spent two sprints unifying.
     *
     * What let it survive is that **nothing said what the numbers were**. Every other slot
     * agreed at one by accident, so there was nothing to disagree with. `ROW_LINES` is the
     * statement and this is what holds the two renderers to it.
     *
     * Spelled per platform because the mechanisms genuinely differ. The phone **reads the
     * table** — `numberOfLines={ROW_LINES.note}` — which is the strongest form and the one
     * `coreWiring` asked for when it reported `ROW_LINES` as an export nothing reached. The
     * web cannot: Tailwind generates the utilities it can see, so `line-clamp-${'{n}'}` built
     * at runtime is a class that does not exist. Its classes stay literal and this clause is
     * what binds them to the table.
     */
    for (const slot of Object.keys(ROW_LINES)) {
      expect(
        RENDERERS.phone,
        `the phone does not read the table for ${slot}`,
      ).toContain(`numberOfLines={ROW_LINES.${slot}}`);
      expect(RENDERERS.web, `the web does not read the table for ${slot}`)
        .toContain(`CLAMP[ROW_LINES.${slot}]`);
    }
    /*
     * And the map both platforms go through has to say what the table says. Reading the
     * table is only worth anything if the lookup it feeds is right: `CLAMP` mapping 2 to
     * `truncate` would satisfy every assertion above and clamp the note to one line.
     *
     * It moved to `app/src/ui/clamp.ts` in §6.180, because `Button`'s label needs the same
     * lookup and a second copy of a three-entry map is how forty-five button styles start.
     * So this reads the map itself rather than a literal in a renderer — which is stronger
     * than what it replaced: a `CLAMP` whose values were right in `Row.tsx` and wrong in
     * the module both files import was not something the old spelling could have seen.
     */
    expect(CLAMP[ROW_LINES.note], 'the map does not give note two lines').toBe('line-clamp-2');
    expect(CLAMP[ROW_LINES.title], 'the map does not give title one line').toBe('truncate');
    expect(RENDERERS.web, 'the web keeps a second copy of the map')
      .not.toMatch(/CLAMP\s*=/);
  });

  it('takes the strike from the cross-off rather than drawing its own', () => {
    // `struck` is the *result* of a cross-off and `CrossOff` owns the control — the title
    // page shows struck rows for episodes marked on another device, with no undo window.
    // `crossOff.test.ts` already fails anything that draws a line outside the component;
    // this is the other half, that the row reaches for it.
    expect(RENDERERS.phone).toContain('crossedOff(!!struck)');
    expect(RENDERERS.web).toContain('crossedOffText(!!struck)');
  });
});
