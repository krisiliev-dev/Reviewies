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
      className={`grid size-11 shrink-0 place-items-center rounded-plate border-icon ${
        disabled
          ? 'border-stroke-hairline text-dim-ink'
          : value
            ? 'border-working-fill bg-working-fill text-working-on-fill'
            : 'border-stroke-signal'
      }`}
    >
      {/* `size-5` is 20px, which is `TOGGLE.mark` and the same 20 `CrossOff` draws. Written
          out rather than interpolated for the reason above — a class built from a number never
          reaches Tailwind's scanner — and `toggle.test.ts` holds the literal and the token
          together, since the compiler cannot. `currentColor`, set by the class above, is how
          `Tick` takes its ink. */}
      {value ? <Tick className="size-5" /> : null}
    </span>
  );
}
