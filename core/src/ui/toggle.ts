/**
 * A setting that is on or off, decided once for both platforms.
 *
 * ## What it replaces
 *
 * There is exactly one of these in the product — *Open the conversation after marking
 * watched* — and until §6.166 it was drawn by whatever the platform felt like:
 *
 * | | what it was |
 * | --- | --- |
 * | phone | `<Switch value={openComments} />` — no `trackColor`, no `thumbColor` |
 * | web | `<input type="checkbox" class="size-5 accent-action-fill">` |
 *
 * §6.165 photographed both. The phone's came out a **teal** sliding switch on a product whose
 * accent is amber and which uses teal nowhere else. The web's came out a white square with a
 * black tick — the only white-filled square in the design record — because `accent-color` is
 * a *hint*: the browser draws its own control and takes the colour if it chooses to. And
 * `size-5` is 20px against this build's 44pt target floor, which is the same defect §6.95
 * found on the density chips, on a control nothing had measured because nothing owned it. That is §6.138's seventh finding one control over — two platforms, two kinds of
 * mark — and §6.111's Expo-scaffold-navy in a different costume.
 *
 * The comment above the phone's Switch reads *"this is the only Switch in the app"*: somebody
 * measured it for target size and did not look at its colour.
 *
 * ## Why it is a mark and not a switch
 *
 * A sliding switch is a fill with a knob travelling in it. §6.90 spent 822 sites turning
 * fills into rules because `docs/design/direction.md` asks for a printed artefact you mark
 * up, and `choice.ts` states the rule this build settled on: *selection is a rule and a step
 * in the ink, never a fill and never a third mark*. A switch is the one shape that cannot
 * obey that.
 *
 * So a toggle is **the mark this product already makes**: the same `size.target` box, the
 * same `TICK_PATH`, the same `working` amber, drawn the way `CrossOff` draws a watched
 * episode. It is not `CrossOff` — that says *watched*, and a preference is not an episode —
 * but it is the same alphabet, which is the whole point of having one.
 *
 * ## The row is the control, and this is only the mark
 *
 * The phone had already reasoned its way to the better shape and the web had not: on the
 * phone the whole settings row is a `Pressable` with `role="switch"`, and the visual switch
 * beside it is `aria-hidden` and `pointerEvents="none"` — one control in the reading order
 * instead of a label and a separate unlabelled switch, and a target the size of the row.
 * On the web the row was a `<label>` wrapping a 20px input.
 *
 * So this component is the **mark**, presentational on both platforms, and the row around it
 * carries the role, the name, the hint and the press. `toggleState` is what both rows put in
 * `aria-checked` / `accessibilityState`, so the one thing they must agree about has one owner.
 *
 * `role="switch"` and not `checkbox`: a checkbox is one of several things you might tick, a
 * switch is a setting that takes effect when you change it. This one takes effect on press.
 */
import { border, radius, size } from '../tokens.ts';

/**
 * The box, and the two states of it.
 *
 * `size.target` because it is the house floor and §6.95 is the entry about a control that
 * was the exception. The off state is a hairline square — the same "not yet" a `RING` draws
 * for an unaired episode, and for the same reason: an empty outline reads as *not done*,
 * where a faded fill reads as *broken*.
 */
export const TOGGLE = {
  size: size.target,
  /**
   * The tick inside the target, and the same 20 `CrossOff` draws.
   *
   * Named here rather than left to each renderer, because "the same size as the other mark"
   * is exactly the sort of agreement two files reach by hand and then lose.
   */
  mark: 20,
  stroke: border.icon,
  radius: radius.plate,
  /**
   * Off has a border and nothing else, and the absence is written as an absence.
   *
   * The first draft gave it `fill: 'transparent'` and `mark: 'transparent'` so the two states
   * would have the same shape — and `transparent` is not a colour in `tokens.ts`, so it would
   * have been a name that looks like a token and is not. Exactly the drift this file exists
   * to prevent, in the file itself.
   */
  off: { border: 'strokeSignal' },
  on: { border: 'workingFill', fill: 'workingFill', mark: 'workingOnFill' },
  /** The border when the setting cannot be changed: "not available", never "broken". */
  unavailable: 'strokeHairline',
} as const;

export interface ToggleContract {
  value: boolean;
  /** Drawn in the hairline rather than faded: "not available", never "broken". */
  disabled?: boolean;
}

/**
 * What a screen reader is told about the state, by the **row**, on both platforms.
 *
 * The mark below is `aria-hidden`; this is what the control around it announces. Named here
 * so the two platforms cannot reach different answers about which way round it goes — which
 * is not hypothetical, since the entire subject of this file is exactly that.
 */
export const toggleState = (value: boolean) => ({ checked: value });
