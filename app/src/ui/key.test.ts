import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '@reviewies/core/test/source';
import { KEY_DISABLED, KEY_HEIGHT, TRANSPORT, DPAD, VOLUME, HOME } from '@reviewies/core/ui/key';
import type { KeySpec } from '@reviewies/core/ui/key';
import { border, color, size } from '@reviewies/core/tokens';

/**
 * The remote fascia, held to the three things that were wrong with it.
 *
 * Three surfaces render these keys and each had its own table, so the same key showed a
 * different mark, answered to a different name and moved a different distance depending on
 * which screen you pressed it from. And on both platforms every key rendered live with no
 * television attached.
 */
const ROOT = resolve(import.meta.dirname, '../../..');
const read = (path: string) => stripComments(readFileSync(resolve(ROOT, path), 'utf8'));

const RENDERERS = {
  phone: read('mobile/src/ui/Key.tsx'),
  web: read('app/src/ui/Key.tsx'),
};
const CALLERS = {
  phone: read('mobile/src/devices/RemotePanel.tsx'),
  web: read('app/src/remote/RemoteDrawer.tsx'),
};
const BOTH = Object.entries(RENDERERS);

/**
 * Every key, composed here rather than exported from the contract.
 *
 * It lived in `key.ts` as `FASCIA` for about a minute, and `coreWiring.test.ts` caught it:
 * nothing in the product reached it, only this file. An export the product does not use is
 * a decision that looks made and is not.
 */
const FASCIA: readonly KeySpec[] = [
  ...TRANSPORT,
  ...DPAD.filter((cell): cell is KeySpec => cell !== null),
  ...VOLUME,
  HOME,
];

describe('the remote fascia', () => {
  it('reads two renderers and one table', () => {
    for (const [platform, source] of BOTH) expect(source.length, platform).toBeGreaterThan(600);
    expect(FASCIA.length).toBe(12);
  });

  it('is the same size on both platforms, and taller than the house target', () => {
    /*
     * The phone's keys were 60 and the web's were 44. One of them was wrong: 44 is the
     * floor for a control you tap once, and this is a fascia you press repeatedly in the
     * dark without looking at it. Both read the number now rather than typing it.
     */
    expect(KEY_HEIGHT).toBeGreaterThan(size.target);
    for (const [platform, source] of BOTH) {
      expect(source, `${platform} types its own key height`).toContain('KEY_HEIGHT');
    }
  });

  it('is one table, not one per surface', () => {
    /*
     * Back-15 was `↺` on the web and `⏪ 15s` on the phone; Select was `●` here and `OK`
     * there; the web had a Mute key the phone did not. Nothing decided any of that, and
     * nothing would have noticed it: the two files never met.
     */
    for (const [platform, source] of Object.entries(CALLERS)) {
      expect(source, `${platform} keeps its own fascia`).not.toMatch(
        /(TRANSPORT|DPAD|VOLUME)(:|\s*=\s*\[)/,
      );
      expect(source, `${platform} does not read the table`).toContain("@reviewies/core/ui/key");
    }
  });

  it('prints mono marks, not colour emoji', () => {
    // `⏪`, `⏩` and `🔇` are drawn by the emoji font at whatever size and hue it decides,
    // which is why one screen showed orange arrows beside flat vector triangles.
    for (const spec of FASCIA) {
      expect(spec.legend, spec.command).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{23E9}-\u{23FA}]/u);
      expect(spec.legend.length, spec.command).toBeGreaterThan(0);
    }
  });

  it('names every key, because a triangle has no name', () => {
    // "▲" read aloud is "up-pointing triangle" and "OK" is not obviously a button that
    // selects. Both renderers take the name from the table rather than the legend.
    for (const spec of FASCIA) expect(spec.name.length, spec.command).toBeGreaterThan(1);
    expect(RENDERERS.phone).toContain('accessibilityLabel={spec.name}');
    expect(RENDERERS.web).toContain('aria-label={spec.name}');
  });

  it('sends the same number of presses from either screen', () => {
    // Roku's ECP has no seek, so skip is repeated presses. The phone sent three and the
    // web sent one: the same key moved a different distance depending on where you were.
    expect(TRANSPORT.find((k) => k.command === 'back')?.repeat).toBe(3);
    expect(TRANSPORT.find((k) => k.command === 'forward')?.repeat).toBe(3);
    for (const [platform, source] of BOTH) {
      expect(source, `${platform} ignores the table's repeat count`).toContain(
        'spec.repeat ?? 1',
      );
    }
  });

  it('is off until a device is found, and says so with a rule rather than a fade', () => {
    /*
     * The defect this component closes. The phone rendered eleven pressable keys with
     * nothing attached; the web wrapped them in a `fieldset` at 40% opacity, which is the
     * fade `appearance.test.ts` bans — a faded fill is a dark block with dark lettering
     * on it, and reads as broken rather than as waiting.
     */
    expect(KEY_DISABLED.rule).toBe(border.hairline);
    for (const [platform, source] of Object.entries(CALLERS)) {
      expect(source, `${platform} renders live keys with no device`).toMatch(
        /disabled=\{!(remote\.device|bridge\.selected)\}/,
      );
      expect(source, `${platform} fades instead of ruling`).not.toMatch(/disabled:opacity/);
    }
    expect(RENDERERS.web).not.toMatch(/opacity/);
    expect(RENDERERS.phone).not.toMatch(/opacity/);

    // And the disabled lettering is still readable on the ground it sits on.
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
      expect(contrast(table[KEY_DISABLED.ink], table.ground), theme).toBeGreaterThan(4.5);
    }
  });

  it('keeps the d-pad a nine-cell grid, with the arrows where a thumb expects them', () => {
    expect(DPAD.length).toBe(9);
    expect(DPAD.map((cell) => cell?.command ?? null)).toEqual([
      null, 'up', null,
      'left', 'select', 'right',
      null, 'down', null,
    ]);
    expect(VOLUME.map((k) => k.command)).toEqual(['volumeDown', 'mute', 'volumeUp']);
    expect(HOME.command).toBe('home');
  });
});
