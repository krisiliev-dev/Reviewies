import { type ToggleContract } from '@reviewies/core/ui/toggle';
import { Tick } from './Mark';

/**
 * The DOM renderer of `core/src/ui/toggle.ts`. The decisions are there.
 *
 * What this replaces is `<input type="checkbox" className="size-5 shrink-0 accent-action-fill">`,
 * and both halves of that were wrong in ways only a photograph showed. `accent-color` is a
 * *hint*: the browser paints its own checkbox and takes the colour if it feels like it, which
 * in `dark-10-settings-foot.png` came out as a white square with a black tick — the only
 * white-filled square in the design record. And `size-5` is 20px against this product's 44pt
 * target floor, on the one control on that screen somebody is meant to press.
 *
 * Presentational, and the row around it is the control — which is the shape the phone had
 * already reasoned its way to and the web had not. `aria-hidden`, so the setting is announced
 * once rather than as a label and a separate unlabelled input.
 */
export function Toggle({ value, disabled }: ToggleContract) {
  return (
    <span
      aria-hidden="true"
      /* Written out rather than assembled: Tailwind's scanner reads source text, so a class
         built at runtime never compiles. The same reason `Choice.tsx` spells its four. */
      className={`grid size-target shrink-0 place-items-center rounded-plate border-icon ${
        disabled
          ? 'border-stroke-hairline text-ink-tertiary'
          : value
            ? 'border-working-fill bg-working-fill text-working-on-fill'
            : 'border-stroke-signal'
      }`}
    >
      {/* `text-s20`, not `size-5`, and the difference is 4px of tick.

          `Tick` is `h-[1em] w-[1em] shrink-0 ${className}`: it sizes itself in `em` and takes
          the caller's class after its own. Two utilities setting the same property at the same
          specificity are decided by Tailwind's *emission order*, not by which is written last
          — `.size-5` lands before `.h-[1em]` in the compiled sheet — so `size-5` was inert and
          this span carries no `text-*` class, leaving the mark at one em of the inherited body
          16px. Measured on Settings at 16x16 against `CrossOff`'s 20. Every other `Tick` and
          `Chevron` on the web already sized itself with a font size; this was the odd one.

          Written out rather than interpolated for the reason above — a class built from a
          number never reaches Tailwind's scanner — and `toggle.test.ts` builds `text-s20` from
          `TOGGLE.mark` and compares, since the compiler cannot. `currentColor`, set by the
          class above, is how `Tick` takes its ink. */}
      {value ? <Tick className="text-s20" /> : null}
    </span>
  );
}
