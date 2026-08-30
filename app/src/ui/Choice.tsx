import { announce, type ChoiceContract } from '@reviewies/core/ui/choice';
import { Note } from './Note';

/**
 * The DOM renderer of `core/src/ui/choice.ts`. The decisions are there.
 *
 * Written-out class strings rather than interpolation, for the reason `Button.tsx` gives:
 * Tailwind's scanner reads source text, so a class assembled at runtime is never compiled.
 */
/*
 * `text-s14`, from `CHOICE_SIZE.chips.label` in the core.
 *
 * Neither of these carried a size, so the web's chips inherited the body's 16 while the
 * phone's were 14 — the same control, one step apart, on all five screens that use it.
 */
/**
 * `CHOICE_SIZE` as classes, written out, and `choice.test.ts` binds every one to the table.
 *
 * The comment above and its twin in the phone's renderer both said the web *reads* the
 * table. It did not — it wrote five of the table's numbers as literals with nothing holding
 * them to it, which §6.181 measured and found already parted: `CHOICE_SIZE.rows.gap` is 2
 * and the web put **nothing** between one radio row and the next, because the class list
 * for a column of rows had no `gap` in it at all. The four box numbers happened to be
 * right, which is the state a guard exists to stop being luck.
 */
const CHIP = 'rounded-plate border border-stroke-signal min-h-target min-w-target px-s12 text-s14 font-title font-semibold';
const CHIP_ON = 'border-b-tally border-b-working-mark text-ink';
const CHIP_OFF = 'text-ink-secondary';
const ROW = 'flex w-full items-center rounded-none min-h-target px-s16 text-left text-s14 font-title font-semibold';
const ROW_ON = 'border-l-tally border-l-working-mark text-ink';
const ROW_OFF = 'text-ink-secondary';
/**
 * The gap between one option and the next.
 *
 * The token spelling — `gap-s8`, `gap-s2` — rather than Tailwind's own scale, because the
 * class name then *contains* the key, and `choice.test.ts` rebuilds it from
 * `CHOICE_SIZE[density].gap` and compares. `gap-2` is also eight pixels and says nothing
 * about where eight came from.
 */
const GAP = { chips: 'gap-s8', rows: 'gap-s2' } as const;

export function Choice<T extends string | number>({
  name,
  options,
  value,
  onChange,
  density = 'chips',
  scroll = false,
  continues = false,
}: ChoiceContract<T>) {
  const rows = density === 'rows';
  return (
    <div
      /* The rest of a group declared around this one, so it names nothing and is not a
         group. The core's contract has why. */
      role={continues ? undefined : 'radiogroup'}
      aria-label={continues ? undefined : name}
      /* Written out rather than assembled, for the reason at the top of this file:
         Tailwind's scanner reads source text, so a class built at runtime never compiles. */
      className={
        rows
          ? `flex flex-col ${GAP.rows}`
          : scroll
            ? `flex flex-nowrap items-center ${GAP.chips} overflow-x-auto`
            : `flex flex-wrap items-center ${GAP.chips}`
      }
    >
      {options.map((option) => {
        const on = option.key === value;
        return (
          <button
            key={String(option.key)}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={announce(option)}
            onClick={() => onChange(option.key)}
            /* `shrink-0` only matters in the scrolling arrangement, where flex would
               otherwise squeeze thirteen chips into the width it has. */
            className={`${rows ? ROW : CHIP} ${scroll ? 'shrink-0' : ''} ${on ? (rows ? ROW_ON : CHIP_ON) : rows ? ROW_OFF : CHIP_OFF} active:bg-ground-well`}
          >
            <span className={rows ? 'flex-1' : undefined}>
              <span className="block">{option.label}</span>
              {rows && option.hint ? (
                <Note level="footnote" as="span" className="block">{option.hint}</Note>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

