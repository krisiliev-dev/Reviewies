import { KEY_BOX, KEY_HEIGHT, type KeyContract } from '@reviewies/core/ui/key';

/**
 * The DOM renderer of `core/src/ui/key.ts`. The decisions are there.
 *
 * Disabled is a rule and a step in the ink, never an opacity. The drawer this replaces
 * wrapped the whole fascia in `<fieldset disabled className="disabled:opacity-40">`,
 * which is the fade `appearance.test.ts` bans on a filled control and for the reason it
 * gives: a faded fill is a dark block with dark lettering on it, which reads as broken
 * rather than as waiting for a television.
 *
 * Written-out class strings rather than interpolation, for the reason `Button.tsx` gives:
 * Tailwind's scanner reads source text, so a class assembled at runtime is never compiled.
 * The one exception is the height: `min-h-15` would be the Tailwind spelling for 60 and it
 * would put that number in one more place, and the point of `KEY_HEIGHT` is that the two
 * platforms cannot drift on it.
 */
const KEY = 'flex items-center justify-center rounded-plate px-2 font-title font-semibold';
const READY = 'bg-ground-raised text-ink active:bg-ground-well';
const CENTRE = 'bg-action-fill text-action-label active:bg-ground-well';
const OFF = 'border-hairline border-stroke-hairline text-ink-tertiary';

/**
 * `KEY_BOX` as classes, written out, for the reason at the top of this file.
 *
 * `spans` is a no-op in `RemoteDrawer`'s `grid-cols-3` — every cell is already its column's
 * full width — and it is written anyway, because "the web happens to do the right thing
 * here" is not the same claim as "the web reads the rule", and only one of those survives
 * somebody changing the layout. §6.181.
 */
const BOX = { square: 'aspect-square', spans: 'w-full' } as const;

export function Key({ spec, disabled, onPress }: KeyContract) {
  const tone = disabled ? OFF : spec.size === 'centre' ? CENTRE : READY;
  const box = KEY_BOX[spec.size];
  return (
    <button
      type="button"
      onClick={() => onPress(spec.command, spec.repeat ?? 1)}
      disabled={disabled}
      // "▲" read aloud is "up-pointing triangle", and "OK" is not obviously a button that
      // selects. Every key on the fascia carries a spoken name for that reason.
      aria-label={spec.name}
      style={{ minHeight: KEY_HEIGHT }}
      className={`${KEY} ${tone} ${box.square ? BOX.square : ''} ${box.spans ? BOX.spans : ''}`}
    >
      <span aria-hidden="true">{spec.legend}</span>
    </button>
  );
}
