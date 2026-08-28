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
