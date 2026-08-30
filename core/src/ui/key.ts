/**
 * The printed remote fascia.
 *
 * Three surfaces render these keys — `mobile/app/remote.tsx` and `RemoteDrawer` through
 * `RemotePanel`, and the web's `RemoteDrawer` over the relay — and until this table they
 * disagreed about what the same key is called and what it shows. Back-15 was `⏪ 15s` on
 * the phone and `↺` on the web; Select was `OK` on one and `●` on the other; the web has
 * a Mute key the phone does not, and the phone puts Home in the volume row while the web
 * gives it a wide button of its own. Nobody decided any of that.
 *
 * **The legends are mono text, not emoji.** `⏪`, `⏩` and `🔇` are colour emoji: they are
 * drawn by the emoji font at whatever size and hue it decides, which is why screen 14
 * shows orange arrows sitting beside flat vector triangles. Where a triangle is still the
 * right mark it carries U+FE0E, which asks for the text presentation explicitly rather
 * than hoping the platform picks it.
 *
 * **Every key is disabled until a device is found**, which is the defect this closes. The
 * phone rendered eleven pressable keys with nothing attached, so pressing one did nothing
 * and said nothing; the web wrapped them in a `fieldset` at 40% opacity, which is
 * the fade `appearance.test.ts` bans and reads as broken rather than as waiting. Disabled
 * here is a rule and a step in the ink, the same treatment `Button` gives it.
 */
import type { Command } from '../devices/types.ts';

/**
 * Text presentation, requested rather than assumed.
 *
 * A bare `▶` is emoji-presentation-by-default on several platforms, which is how a flat
 * vector triangle and a rounded orange one ended up in the same row.
 */
const TEXT = '︎';

/**
 * How much of the fascia a key takes.
 *
 * `pad` is the square in the d-pad grid, `wide` spans a transport or volume row, and
 * `centre` is the one filled key — Select, in the middle of the d-pad, where a thumb
 * lands without looking.
 *
 * A plain union rather than a table keyed by these three, because the table had the same
 * two numbers in all three rows: it looked like a decision and was not. The one number
 * that differs between a key and every other control is below.
 *
 * That paragraph was true when it was written and §6.181 measured it false. A union with no
 * table is a union each renderer interprets, and they interpreted it differently: the web
 * gave `pad` `aspect-square` and the phone gave **every** key a hand-typed `minWidth: 72`,
 * typed a second time in `RemotePanel`'s `dpadGap` to keep the empty cells of the grid in
 * line. Measured in both browsers, the same arrow key is **80x80 on the web and 72x60 on
 * the phone** — a square and a landscape rectangle, on the fascia this product's remote is.
 * `KEY_BOX` below is what the union was implying.
 */
export type KeySize = 'pad' | 'wide' | 'centre';

/**
 * Taller than the house target, and the same on both platforms.
 *
 * `size.target` is 44 — the floor for a control you tap once. This is a fascia you press
 * repeatedly, in the dark, without looking at it, which is the argument the phone's 60
 * was already making silently while the web's keys were 44. One of them had to be wrong;
 * the phone's was right, so the web's moved.
 */
export const KEY_HEIGHT = 60;

/**
 * The shape of a key, which is what `KeySize` names and neither renderer read.
 *
 * A rule rather than a width, deliberately, and the distinction is the whole of this entry.
 *
 * - `pad` is **square**. A d-pad arrow is square on every physical remote there has ever
 *   been, and a landscape one reads as a button that happens to have an arrow on it.
 * - `wide` **spans its row** — that is what the name says and it is what the phone already
 *   did with `flex: 1`. On the web it is a no-op today, because `RemoteDrawer` lays the
 *   fascia out as `grid-cols-3` and every cell is already the full width of its column; it
 *   is written anyway so the statement is true rather than accidentally true.
 * - `centre` is neither: it is the one filled key, and it sits in the d-pad *and* in the
 *   transport row. Square would make it 80 tall between two 60-tall neighbours on the web.
 *
 * ## What is deliberately not here
 *
 * A width in points. The web's fascia is a 300pt drawer and the phone's is a 390pt screen,
 * so the same rule lands on 80 there and 60 here — and that is the surface's decision, the
 * way `SCREEN.edge` is. What was wrong was not that the numbers differed; it was that
 * nothing said which of them was a decision, so a hand-typed 72 in two phone files was
 * indistinguishable from one.
 *
 * The floor that *is* shared is below it: `KEY_HEIGHT` in both directions, so the smallest
 * key any surface can produce is a square at the height this file already argues for.
 */
export const KEY_BOX = {
  pad: { square: true, spans: false },
  centre: { square: false, spans: false },
  wide: { square: false, spans: true },
} as const satisfies Record<KeySize, { square: boolean; spans: boolean }>;

export interface KeySpec {
  command: Command;
  /** What the key shows. Mono, and never a colour emoji. */
  legend: string;
  /** What the key is, for anything that cannot see a glyph. Required — see below. */
  name: string;
  size: KeySize;
  /**
   * How many presses one tap sends.
   *
   * Roku's ECP has no seek: it has `Fwd` and `Rev`, which move by a fixed step in
   * whatever is playing. Three presses is a decent approximation of fifteen seconds and
   * the honest alternative — no skip key — is worse. It lives in the table because the
   * phone repeated three times and the web sent one, so the same key moved a different
   * distance depending on which screen you pressed it from.
   */
  repeat?: number;
}

/**
 * Names, not labels.
 *
 * "▲" read aloud is "up-pointing triangle" and "OK" is not obviously a button that
 * selects, so every key carries a spoken name. These are `RemotePanel`'s, which were
 * already right, kept verbatim.
 */
export const TRANSPORT: readonly KeySpec[] = [
  { command: 'back', legend: '−15', name: 'Back 15 seconds', size: 'wide', repeat: 3 },
  { command: 'playpause', legend: `▶${TEXT}‖`, name: 'Play or pause', size: 'centre' },
  { command: 'forward', legend: '+15', name: 'Forward 15 seconds', size: 'wide', repeat: 3 },
];

/** Nine cells, four of them empty, so the arrows sit where a thumb expects them. */
export const DPAD: readonly (KeySpec | null)[] = [
  null,
  { command: 'up', legend: '▲', name: 'Up', size: 'pad' },
  null,
  { command: 'left', legend: `◀${TEXT}`, name: 'Left', size: 'pad' },
  { command: 'select', legend: 'OK', name: 'Select', size: 'centre' },
  { command: 'right', legend: `▶${TEXT}`, name: 'Right', size: 'pad' },
  null,
  { command: 'down', legend: '▼', name: 'Down', size: 'pad' },
  null,
];

/**
 * Volume, and Mute — which the phone did not have and the web did, for no reason either
 * of them recorded.
 */
export const VOLUME: readonly KeySpec[] = [
  { command: 'volumeDown', legend: 'VOL −', name: 'Volume down', size: 'wide' },
  { command: 'mute', legend: 'MUTE', name: 'Mute', size: 'wide' },
  { command: 'volumeUp', legend: 'VOL +', name: 'Volume up', size: 'wide' },
];

/** On its own line, because it leaves whatever is playing and the others do not. */
export const HOME: KeySpec = { command: 'home', legend: 'HOME', name: 'Home', size: 'wide' };

/*
 * There was a `FASCIA` here — every key in one list — and nothing but the guard ever read
 * it. `coreWiring.test.ts` said so within a minute of it being written, which is what that
 * check is for: an export the product does not reach is a decision that looks made and is
 * not. The guard composes the list from the four groups above instead.
 */

export interface KeyContract {
  spec: KeySpec;
  /** No device found yet. Not "busy": the fascia has no state in which it is waiting. */
  disabled?: boolean;
  onPress(command: Command, repeat: number): void;
}
