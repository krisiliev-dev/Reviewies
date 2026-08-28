import { announce, type ChoiceContract } from '@reviewies/core/ui/choice';

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
const CHIP = 'rounded-plate border border-stroke-signal min-h-11 min-w-11 px-3 text-s14';
const CHIP_ON = 'border-b-tally border-b-working-mark font-semibold text-ink';
const CHIP_OFF = 'text-ink-secondary';
const ROW = 'flex w-full items-center gap-2 rounded-none min-h-11 px-4 text-left text-s14';
const ROW_ON = 'border-l-tally border-l-working-mark font-semibold text-ink';
const ROW_OFF = 'text-ink-secondary';

export function Choice<T extends string | number>({
  name,
  options,
  value,
  onChange,
  density = 'chips',
}: ChoiceContract<T>) {
  const rows = density === 'rows';
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className={rows ? 'flex flex-col' : 'flex flex-wrap items-center gap-2'}
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
            className={`${rows ? ROW : CHIP} ${on ? (rows ? ROW_ON : CHIP_ON) : rows ? ROW_OFF : CHIP_OFF} active:bg-ground-raised`}
          >
            <span className={rows ? 'flex-1' : undefined}>
              <span className="block">{option.label}</span>
              {rows && option.hint ? (
                <span className="block text-s12 text-ink-secondary">{option.hint}</span>
              ) : null}
            </span>
            {/* The state is already in `aria-checked`; a readable tick would announce it
                twice. Decorative on purpose. */}
            {rows && on ? (
              <span aria-hidden="true" className="text-working-mark">
                ✓
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

