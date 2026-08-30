import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { fromDisk, fromGitRef, lopsided, scan, unreached } from './coreWiring';

/**
 * A subsystem that exists and nothing calls.
 *
 * Sync was in the core from the beginning, the phone's account screen said "an account
 * adds sync across devices", and nothing in `mobile/` ever imported the engine. Both
 * halves were individually correct and no test on either side could see it, because
 * what was wrong was the absence of a line rather than the content of one.
 *
 * This is the guard for that shape. It is deliberately a list of exceptions rather than
 * a clever rule: every entry below is a decision somebody made, written down, and an
 * entry that disappears from the code has to be removed from here too.
 */
const ROOT = resolve(__dirname, '../../..');

/**
 * Exported, called by nothing, and that is correct.
 *
 * Test seams and generated data mostly. Anything else that lands here is a promise the
 * apps never took up, and the choice is to wire it up or delete it — not to add a line.
 */
const UNREACHED: Record<string, string> = {
  'ui/contrast#contrast':
    "WCAG 2.1 contrast, and the reason it is in core rather than in the file that used it: three copies were about to exist. app/src/ui/contrast.test.ts had carried the arithmetic since it was written (palette.test.ts had its own before that), and \u00a76.185 needed the same formula in design/capture.mjs to measure a *pressed* control's label against the ground the press paints under it \u2014 a question no source clause can answer, because the style only exists while the pointer is down. No renderer reads it and none should: it decides nothing at runtime, it checks decisions. contrast.test.ts holds the formula to a published value (#777777 on white is 4.48), button.test.ts holds every tone's held label to TEXT_FLOOR, and the design pass measures the rendered thing.",
  'ui/contrast#TEXT_FLOOR':
    'WCAG 1.4.3 AA, 4.5:1, spelled once instead of at each comparison. contrast.test.ts states that this system deliberately has no headroom above it, which is a fact to hold rather than a number to nudge, so a guard that typed 4.5 inline would be the second place somebody could nudge it.',
  'data/db#clearDatabase':
    'Test seam: unbinds the database so the proxy\'s "call setDatabase() first" error can be read. Its previous reason here said the suites that swap Dexie for SQLite need it — they do not, they call setDatabase, and nothing called this at all. §6.59 pointed the seam at the error it is good for rather than deleting it; core/src/data/db.test.ts drives it now, which this scan reads as test code.',
  'ui/screen#PROSE_CHARACTERS':
    'The claim `SCREEN.prose` exists to satisfy, in the unit the claim is made in. A width in points cannot be checked against a typographic convention — how many characters a width holds is a fact about a face and a text size that lives in a stylesheet — so the renderers apply the width and this is what the *measurement* compares against: `design/capture-web-real.mjs` counts the browser’s own line boxes on every real synopsis at 420 and 1280 and fails the pass over it. No renderer reads it, which is the point; `screen.test.ts` holds the number and the harness to each other. The `design/` tree is not one of this scan’s consumers, so a constant only the design pass reads looks unreached from here — the same arrangement `ui/screen#EMPTY_ALIGN` below already describes.',
  'ui/screen#EMPTY_ALIGN':
    'Where a screen puts its message when it has nothing else in it. A rule about alignment rather than a value a renderer reads — the three screens it governs simply stopped centring — so screen.test.ts is what holds them to it, and design/capture.mjs measures where the words actually land.',
  'ui/screen#FULL_SCREEN':
    'The one place a centred, full-height state is correct, and why: _layout.tsx replaces the whole app before the router mounts. A design decision beside the decision it qualifies; screen.test.ts reads it and fails when the entry outlives the file.',
  'ui/reveals#REVEALS':
    'Every place the product hides content behind a control, and the shot that proves somebody has looked at it open. §6.158. A design decision beside the decisions it qualifies, in the same way EDGE_EXEMPT and FULL_SCREEN are: no renderer reads it, because a screen already knows its own reveal — what nothing knew was which reveals exist. reveals.test.ts reads it, checks each named state is really in the screen it names, and fails when a reveal has no walk in a capture script.',
  'ui/reveals#NOT_A_REVEAL':
    'The boolean states that are conditions rather than reveals — in flight, failed, gated — each named with why it is not a container for anything. The allowlist is the honest half: reveals.test.ts sweeps the screens for the shape and fails on anything neither registered nor excused, which is what caught two reveals the register\'s own author had missed by reading.',
  'ui/emptyStates#EMPTY_STATES':
    'Every screen this product can show with nothing on it, and whether anybody has looked. §6.162, and the sibling of REVEALS: no renderer reads it, because a screen already knows its own empty branch — what nothing knew was which empty states exist and which of them have never been photographed. emptyStates.test.ts reads it, checks each named screen really renders the sentence, and fails on an unphotographed state whose reason is too thin to be worth reading.',
  'ui/emptyStates#NOT_AN_EMPTY_STATE':
    'The sentences that look like empty states and are not — failures, gates, and prose that is drawn over a full screen too — each with why. The allowlist is the honest half: emptyStates.test.ts sweeps copy.ts for the key shape and fails on anything neither registered nor excused, which is how the four literal "Nobody yet" strings in People were found.',
  'ui/row#ROW_TAG':
    'How a row\u2019s tag is drawn, and \u2014 the load-bearing half \u2014 that it has **no rule**. \u00a76.168. Both renderers boxed it in `strokeHairline` and `rounded-plate`, which is `Choice`\u2019s unselected chip and a `secondary` `Button` one token away, so a *fact* about a row wore the shape this build reserves for controls. Neither renderer reads this at runtime for the reason `ui/button#SIZE` gives at length \u2014 Tailwind compiles from source text and StyleSheet takes literals \u2014 so what it is for is stating the absence, the way `TOGGLE.off` does: a renderer that re-adds a border is disagreeing with something rather than filling in a blank. `factNotControl.test.ts` reads it and sweeps both renderers.',
  'ui/surface#SUNK_FILLS':
    'Every place the sunken ground is painted and left there, and what is meant to sit in it. \u00a76.167, and the third of these registers after REVEALS and EMPTY_STATES: no renderer reads it, because a component already knows its own fill \u2014 what nothing knew was how many static ones exist. Found by asking why a streaming service in 15-title.png was drawn two steps darker than the card around it, which turned out to be the only element in a hundred and thirty shots darker than its own container. sunkenFill.test.ts sweeps both platforms and fails on a fill nobody has said what goes in.',
  'ui/screen#EDGE_EXEMPT':
    'The screens that do not take the standard edge, and why. It is a design decision rather than a test fixture — Watching Mode is immersive and has no rows to bleed — so it lives beside the decision it qualifies; screen.test.ts is what reads it, and what fails when an entry outlives its screen.',
  'sync/driver#resetSyncDriver': 'Test seam: the driver is a singleton and cases must not share it.',
  'data/importing#resetImports':
    'Test seam: whether an import is running is module state, so cases must not inherit it.',
  'metadata/index#resetProvider':
    'Test seam: the provider is chosen once and kept, and a suite binds its config after some file has already asked. Called from core/src/test/setup.ts, which this scan reads as test code.',
  'data/failure#resetFailures':
    'Test seam: the failure bus is a singleton and a listener must not leak into the next case.',
  'sync/memoryBackend#MemoryBackend': 'A backend for tests. Shipping it would be the bug.',
  'watching/emojiIndex#EMOJI_INDEX_RAW':
    'Generated by scripts/build-emoji-index.mjs and read through a dynamic import, which this scan does not follow.',
  'data/transfer#addWatchlistFromTitles':
    'Kept for the importers: a format that carries a watchlist but no library rows has nowhere else to land. No shipped importer produces one yet.',
  'domain/types#parseId':
    'The inverse of makeId, which the ID format promises. Nothing has needed to take an ID apart yet.',
  'fingerprint/fingerprint#estimateBytes':
    'Sizes a reference before uploading it. The contribution path checks its frame count instead.',
  'fingerprint/fingerprint#serialiseReference': 'Paired with the wire format; only its tests read it.',
  'fingerprint/spectrogram#spectrogramFromPcm':
    'The whole-buffer form. Both apps stream frames instead, which is what SpectrogramStream is.',
  'fingerprint/stream#int16ToFloat': 'Sample conversion, used by the tests that feed it real PCM.',
  'metadata/animeMapping#isAnime':
    'Answers the question the season correction asks implicitly. Nothing asks it directly.',
  'metadata/animeMapping#clearMappingCache': 'Test seam for the mapping cache.',
  'metadata/index#setProvider':
    'Test seam, in the house style of setDatabase / setStorage / setFileSaver. Added by \u00a76.68 because the cache layer above it \u2014 getProvidersCached, which \u00a76.58 rewrote so a failure could be told apart from an empty answer \u2014 had never been executed: there was no way to make a provider *fail*, since the fixture catalogue always succeeds and the real one needs a token and a network.',
  /**
   * The two token layers with no consumer at all yet.
   *
   * There were eleven of these yesterday. Nine went the moment
   * `scripts/tokens-to-css.mjs` started emitting them, without anybody editing this
   * list — the stale check above took them out, which is the property that made adding
   * them defensible in the first place.
   *
   * These two are genuinely unreached. `elevation` is read by `flat.test.ts` and by
   * nothing else, which is the point of it: it exists so the app can assert it has no
   * shadow scale, and it caught a `backdrop-blur` the day it landed. `ratio` waits for
   * the poster component.
   *
   * `docs/design/tokens.md` decides the whole system at once — that is what one owner
   * means — but the spec is equally explicit that the space and radius guards land WITH
   * their ~99 and ~84 site migrations or not at all, because a guard carrying an
   * allowlist of its own violations is not a guard. So the values arrive first and the
   * call sites arrive per sprint.
   *
   * Each of these is reached today by exactly one thing: the guard that holds it to its
   * specification. That is not nothing — `elevation` exists so `flat.test.ts` can assert
   * the app has no shadow scale, and it caught a `backdrop-blur` on the web drawer the
   * day it landed — but it is not a call site, and this list is where that difference is
   * admitted rather than hidden.
   *
   * None of these needs deleting when it is used: the stale check above removes the
   * entry the moment product code reaches the export.
   */

  /*
   * `tokens#ratio` was here, saying "values landed; migrates with the poster component". It
   * migrated: `core/src/ui/poster.ts` derives both poster heights from it. The stale check
   * below deleted the line the moment product code reached the export, which is the whole
   * point of that clause — and this one had been true and unread long enough for the row
   * poster to sit two points off the ratio it names. §6.118.
   */

  'sync/clock#resetClock':
    'Test seam: the learned server offset is module state and a case must not inherit the previous one\u2019s. Nothing in the product forgets it — the offset describes the device, not the account, so signing out is not a reason to unlearn it.',
};

/**
 * Called by one app and not the other, on purpose.
 *
 * Symmetry is the default because the two apps are meant to be the same product. Each
 * of these is a place where they genuinely differ, and the reason has to survive being
 * read aloud.
 */
const LOPSIDED: Record<string, string> = {
  /**
   * The one entry here that is a **platform difference by definition** rather than an
   * unfinished migration. §6.159.
   *
   * `WIDE` answers what to do with a window wider than the column of rows, and the phone
   * has no such window: its window is the device. Every other line in this table describes
   * something that will stop being true when a migration lands, and this one will not — so
   * the stale-reason check above cannot expire it, and the honest thing is to say why
   * rather than to let it read as work outstanding.
   */
  /**
   * Not a migration either, and for the reason the entry gives: the two platforms reach the
   * same decision through different mechanisms on purpose.
   */
  'mobile only: ui/surface#PRESS_FILL':
    "Where a filled control goes while it is held. The phone reads the token by name; the web cannot \u2014 Tailwind's scanner reads source text, so a class built from a constant never reaches it, and app/src/ui/Button.tsx writes `active:bg-action-fill-pressed` out in PRESS_CLASS. That is the arrangement ui/button#BOX_RADIUS already has and the coupling is guarded rather than trusted: button.test.ts derives the utility from PRESS_FILL and PRESS for every tone and compares, and asserts exactly one `active:bg-*` per tone so a second spelling cannot sit behind the first in the cascade. \u00a76.185.",
  'app only: ui/screen#WIDE':
    'What the web does with a window wider than its column: one column, and the navigation takes the column\'s measure. The phone has no wider window — its window is the device — so this is a difference by definition rather than a migration nobody has finished.',
  /**
   * The phone's remote drawer is the only thing in either app that animates from a
   * table yet, so it is the only caller of the motion tokens.
   *
   * Not a platform difference and not meant to last: the web's drawer has the same
   * slide and still writes its own timing. It moves when the web drawer is migrated,
   * and the stale check above deletes these two lines the day it does.
   */
  'mobile only: tokens#duration': 'Only the phone drawer reads the motion table so far.',
  'mobile only: tokens#reduced': 'The Reduce Motion half of the same table.',
  /**
   * The web reads tokens as generated CSS, not as TypeScript.
   *
   * This is the architecture rather than a gap: `scripts/tokens-to-css.mjs` emits custom
   * properties and Tailwind utilities from the same file the phone imports, so a web
   * component writes `bg-stroke-signal` where a phone component writes
   * `color.dark.strokeSignal`. Both come from `core/src/tokens.ts`; only the delivery
   * differs, because a stylesheet cannot import TypeScript and a React Native style
   * cannot read a custom property.
   *
   * `tokens.generated.test.ts` is what holds the two ends together.
   */
  'mobile only: tokens#z': 'The web reads var(--z-*), emitted from this table.',
  'mobile only: tokens#type': 'The web reads --font-* and @font-face, generated from this table.',
  /*
   * `tokens#track` was here for one sprint. `Section` imports it on both sides now — the
   * web through the component rather than through the generated CSS — so the reason expired
   * and the clause below deleted it, which is the whole point of that clause.
   */
  /*
   * `weight` used to be here for the same reason. It is not, because the phone stopped
   * importing it at all in stage 2: React Native ignores a `fontWeight` beside a
   * `fontFamily`, so on that side the weight is the file and the table is web-only. The
   * clause below is what deleted the line — nobody had to remember.
   */

  /*
   * Tailwind compiles from source text, so a class assembled at runtime is a class that
   * never gets built. The web's Button therefore writes `rounded-pill` and
   * `active:border-2` as literals where the phone reads these two exports. That is a fact
   * about the toolchain rather than a decision, and it is the same shape as the entries
   * above — but an explanation alone would be the free pass §6.59 is about, so
   * `app/src/ui/button.test.ts` holds the literals to these numbers. Change `border.mark`
   * and the web fails until it follows.
   */
  'mobile only: ui/button#BOX_RADIUS': 'Tailwind needs a literal class; button.test.ts couples the two.',
  'mobile only: ui/button#PRESSED': 'Tailwind needs a literal class; button.test.ts couples the two.',
  'mobile only: ui/button#SELECTED': 'Tailwind needs a literal class; button.test.ts couples the two.',
  'mobile only: ui/button#LABEL_FACE': 'Tailwind needs a literal class; type.test.ts couples the two.',
  'mobile only: ui/button#MIN_WIDTH':
    'What a tone with no box is wide, instead of the horizontal padding it does not spend. The phone reads the number; the web writes `min-w-target`, because Tailwind’s scanner reads source text and a class built from a constant is never compiled — the arrangement `ui/button#BOX_RADIUS` already has. `button.test.ts` derives the utility name from the token whose value this is and fails the web if the number moves.',
  'mobile only: ui/section#SECTION_FACE': 'Tailwind needs a literal class; section.test.ts couples the two.',
  'mobile only: ui/attribution#ATTRIBUTION_SEPARATION':
    'Tailwind needs a literal class; attribution.test.ts couples the two.',
  'mobile only: ui/section#SECTION_RULE': 'A CSS rule is a border utility; section.test.ts couples the two.',
  'mobile only: ui/data#DATA_FACE': 'Tailwind needs a literal class; data.test.ts couples the two.',
  'mobile only: ui/data#DATA_UNIT_FACE': 'The web unit inherits the body face; data.test.ts couples the two.',
  /*
   * Not a spelling difference — a mechanism the web does not have. `allowFontScaling` is a
   * React Native prop, and the web's type is in `px` and has never answered the browser's
   * font-size setting, so its monogram already behaves the way this constant asks for.
   * `poster.test.ts` asserts the value and that the phone reads it. §6.181.
   */
  'mobile only: ui/poster#POSTER_GLYPH_SCALES':
    'allowFontScaling is an RN prop; the web is in px and never scaled. poster.test.ts holds both.',
  /*
   * The active tab's rule is three numbers, and the web writes them as generated
   * utilities by decision — `w-s24`, `gap-0.5`, `border-t-tally` — because a class assembled
   * at runtime is a class that never gets built. Same shape as the `button` entries above,
   * with the same requirement: `tabIcon.test.ts` derives those three class names *from*
   * `TAB_MARKER` and compares, so moving a number in the table fails the web until it
   * follows. It was the gap that had drifted — 2 on the web against 4 on the phone. §6.183.
   */
  'mobile only: ui/tabIcon#TAB_MARKER':
    'Tailwind needs literal classes; tabIcon.test.ts derives them from the table.',
  /*
   * Not a spelling difference — a mechanism the web has and the phone does not, which is the
   * `POSTER_GLYPH_SCALES` shape from the other end. The web's chevron is drawn `1em` square,
   * so it takes the size of the text it sits beside and there is no number for that side to
   * read; an `Svg` inherits no font, so the phone has to be told one. `mark.test.ts` holds
   * both ends: the phone's default must *be* this export, and the web's call sites must sit
   * in the text class named after the same token. §6.183.
   */
  'mobile only: ui/mark#CHEVRON_SIZE':
    'The web mark is 1em and takes the row’s text size; mark.test.ts holds both ends.',
  'mobile only: ui/note#NOTE': 'Tailwind needs a literal class; note.test.ts couples the two.',
  'mobile only: ui/note#NOTE_INK': 'Tailwind needs a literal class; note.test.ts couples the two.',
  'mobile only: ui/field#FIELD_SIZE': 'Tailwind needs a literal class; field.test.ts couples the two.',
  'mobile only: ui/field#FIELD_BOX': 'Tailwind needs a literal class; field.test.ts couples the two.',

  'mobile only: ui/block#BLOCK': 'Tailwind needs a literal class; block.test.ts couples the two.',
  'mobile only: ui/surface#PRESS': 'Tailwind needs a literal class; surface.test.ts couples the two.',
  'mobile only: ui/surface#SURFACE': 'Tailwind needs a literal class; surface.test.ts couples the two.',
  'mobile only: ui/progress#PROGRESS_SIZE': 'Tailwind needs a literal class; progress.test.ts couples the two.',
  'mobile only: ui/progress#PROGRESS_COLOUR': 'Tailwind needs a literal class; progress.test.ts couples the two.',

  'app only: data/adapters/dexie#createDexieDatabase':
    'IndexedDB is the browser store. The phone binds the SQLite adapter instead.',
  'app only: devices/relayUrl#relayConnectionUrl':
    'The browser cannot reach a television directly, so the web goes through the relay; the phone has the local network entitlement and talks to it. The bridge uses this too — it is the relay\'s other half — but this check compares the app against the phone.',
  'app only: watching/scrobble#startScrobbleListener':
    'Listens for the browser extension. There is no browser extension on a phone, and nothing else posts a window message at it — the equivalent there is listening to the room, which is a different mechanism for a different situation.',
  'app only: calendar/upcoming#notificationsSupported':
    'Asks about the Web Notification API. The phone has its own stack in mobile/src/notifications.ts and its own capability check.',
  'app only: fingerprint/references#CONTRIBUTION_MS':
    'How long to record a contribution, which only the web decides: it takes one bounded capture of that length, while the phone records for as long as you hold the button and is bounded by MIN_REFERENCE_MS at the other end. Both numbers live together in the core so the pair can be read at once (§6.52).',
  'mobile only: devices/direct#createDirectRokuAdapter':
    'The phone is on the same network as the television and can speak to it. A browser cannot, so the web goes through the local bridge.',
  'mobile only: devices/direct#discoverRokus':
    'The other half of the same difference, and hidden until \u00a76.75. Finding a Roku means an SSDP broadcast over UDP, which a browser cannot send at all — the web asks the bridge for the list instead. This was not reported as lopsided before, because the file that declares it mentions the name once more in a comment and the scan counted that as a second use; stripping comments made the truth visible.',
  'mobile only: fingerprint/continuous#ContinuousMatcher':
    'The phone holds a background audio session and corrects for drift as it goes. The web takes one bounded capture with the microphone on only for those few seconds, which is a privacy decision rather than a missing feature.',
  'mobile only: ui/button#SIZE':
    'The two renderers of a shared component read its table differently, and only one of them reads it at runtime. React Native takes the numbers and colour names straight out of `core/src/ui/` and puts them in a `StyleSheet`; the DOM writes Tailwind class strings, because Tailwind\u2019s scanner reads *source text* \u2014 a class assembled from a token name at runtime is never compiled, so `bg-working-fill` has to appear literally in the file. `button.test.ts`, `choice.test.ts`, `crossOff.test.ts` and `key.test.ts` are what hold the web\u2019s written-out classes to the table instead. This was hidden until \u00a76.96 by a re-export in each web component \u2014 `BUTTON_SIZE = SIZE` and four more \u2014 that nothing anywhere imported: seven exports whose only effect was to make this scan count a read. Deleting them made the real asymmetry visible, which is the asymmetry described here.',
  /*
   * `ui/button#TONE` was here, with the same reason as `SIZE`, and the stale clause below
   * took it out — which is the property the header above claims and this is the second time
   * it has been shown. `boxed(tone)` asks the table whether a tone paints anything, so the
   * *core* reads `TONE` now, and a symbol its own module uses is not lopsided at all. The
   * reason had not become wrong; it had become beside the point, which is the harder kind
   * to notice by reading.
   */
  'mobile only: ui/choice#CHOICE_SIZE': 'The same divergence as `ui/button#SIZE`.',
  'mobile only: ui/choice#CHOSEN': 'The same divergence as `ui/button#SIZE`.',
  'mobile only: ui/crossOff#RING': 'The same divergence as `ui/button#SIZE`.',
  'mobile only: ui/toggle#TOGGLE': 'The same divergence as `ui/button#SIZE`; `toggle.test.ts` holds the web\u2019s written-out classes to the table.',
  'mobile only: ui/crossOff#STRUCK': 'The same divergence as `ui/button#SIZE`.',
  'mobile only: ui/surface#SURFACE_OFF': 'The same divergence as `ui/button#SIZE`.',
  'mobile only: ui/row#ROW_INK': 'The same divergence as `ui/button#SIZE`.',
  'app only: data/sqlWasm#setSqlJsLoader':
    'Binds the loader that fetches sql.js\u2019 WASM binary, which is how the *web* runs SQLite \u2014 in a browser it has to be fetched and instantiated. The phone has expo-sqlite compiled in and never asks for one. Invisible until \u00a76.167: the function names itself inside its own "call setSqlJsLoader() from your entry point" error, and until the scan blanked string literals as well as comments, that mention counted as the module reaching itself.',
  'mobile only: sync/auth#setAuthStorage':
    'React Native has no `localStorage`, so the phone hands the Supabase client AsyncStorage before it is created; in a browser the client uses `localStorage` by default and there is nothing to bind. Hidden the same way and for the same sprint: `setAuthStorage() must be called before the Supabase client is created` names it in a string.',
  'mobile only: fingerprint/continuous#positionNow': 'Part of the same continuous session.',
  'mobile only: fingerprint/continuous#shouldCorrect': 'Part of the same continuous session.',
};

const explain = (entries: string[], allowed: Record<string, string>) =>
  entries.filter((entry) => !(entry in allowed));

describe('what the core offers, and who calls it', () => {
  const rows = scan(fromDisk(ROOT));

  it('finds the core it is meant to be scanning', () => {
    // A scan that silently matched nothing would pass everything below it.
    expect(rows.length).toBeGreaterThan(300);
  });

  it('has no exports nothing anywhere reaches', () => {
    expect(explain(unreached(rows), UNREACHED)).toEqual([]);
  });

  it('has no unexplained difference between what the two apps call', () => {
    expect(explain(lopsided(rows), LOPSIDED)).toEqual([]);
  });

  it('does not keep reasons that have stopped being true', () => {
    // Two ways a reason expires, and the comment here used to name only the first.
    // `live` is what is unreached or lopsided *now*, so an entry drops out of it either
    // because the export was deleted or because something finally started calling it —
    // and an excuse that outlives the condition it describes is the §6.59 shape. The
    // design tokens below lean on this: each one's reason ends the day its migration
    // lands, without anybody having to remember.
    const live = new Set([...unreached(rows), ...lopsided(rows)]);
    const stale = [...Object.keys(UNREACHED), ...Object.keys(LOPSIDED)].filter(
      (key) => !live.has(key),
    );
    expect(stale).toEqual([]);
  });
});

describe('pointed at the commit before sync was wired up', () => {
  /**
   * The check, checked.
   *
   * A guard for a class of bug that has never been shown to catch one is a guess. This
   * one is aimed at c2aa930^ — the last commit where the phone could not sync — and has
   * to find it there. If this stops failing to find the gap, the scan has stopped
   * looking properly and everything above it is decoration.
   */
  const BEFORE_SYNC_WAS_WIRED = 'c2aa930^';

  /**
   * This case reads a whole tree out of git history and scans it, which is slower than
   * anything else in this suite by an order of magnitude. Vitest's default five seconds
   * is enough when it runs alone and not enough when it runs alongside thirty-five other
   * files on a machine whose disk is busy — it took 3.7s alone and 6.3s in the suite the
   * first time this ran on a Mac, so the check failed for its own cost rather than for
   * anything it was looking at. An explicit budget rather than a faster check: the work
   * is the point, and a guard that fails on timing teaches people to ignore it. 6.82.
   */
  const READING_HISTORY_IS_SLOW = 30_000;

  it('finds the engine the phone never called', () => {
    let rows;
    try {
      rows = scan(fromGitRef(ROOT, BEFORE_SYNC_WAS_WIRED));
    } catch {
      // A shallow clone has no history to point at. Say so rather than passing quietly.
      throw new Error(
        `Could not read ${BEFORE_SYNC_WAS_WIRED}. This check needs the repository history.`,
      );
    }

    expect(lopsided(rows)).toContain('app only: sync/engine#syncOnce');
    expect(lopsided(rows)).toContain('app only: sync/engine#pendingCount');
  }, READING_HISTORY_IS_SLOW);
});
