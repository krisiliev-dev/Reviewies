import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ROW, type RowContract } from '@reviewies/core/ui/row';
import { crossedOffText } from './CrossOff';

/**
 * The DOM renderer of `core/src/ui/row.ts`. The decisions are there.
 *
 * The row is a link only when it has somewhere to go, and then the whole row is that one
 * target — poster and words together, named once. `trailing` sits outside it, so a row is
 * at most two controls and never a control inside a control.
 *
 * Written-out class strings rather than interpolation, for the reason `Button.tsx` gives:
 * Tailwind's scanner reads source text, so a class assembled at runtime is never compiled.
 */
/** The rule is on the block, so a group underneath shares the row's ruled band. */
const BLOCK =
  'flex flex-col gap-1.5 rounded-none border-b border-b-stroke-hairline bg-transparent py-2';
const ROW_CLASS = 'flex items-center gap-3';
const TARGET =
  'flex min-w-0 flex-1 items-center gap-3 rounded-none active:bg-ground-raised';
const TAG =
  'shrink-0 rounded-plate border border-stroke-hairline px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-wider text-ink-secondary';

interface Props extends RowContract {
  /**
   * A real `href` wherever there is one, so middle-click, copy-link and open-in-new-tab
   * keep working; `run` only for a target that has no URL. Either, not neither: the union
   * is what makes a row that goes nowhere a compile error rather than a dead card.
   */
  open?: { name: string } & ({ to: string; run?: never } | { run(): void; to?: never });
  /** `<Poster/>` at row size, a time, or nothing. */
  lead?: ReactNode;
  /** `<CrossOff/>` | `<Button size="row"/>` | a chevron. Names itself. */
  trailing?: ReactNode;
  /**
   * Controls that do not fit beside the words.
   *
   * The direction says a row is "at most one navigation target and one action", and that
   * is a *naming* rule — "because a screen of rows is the same two words repeated down the
   * page" — not a counting one. Three screens genuinely offer three: Search's Track /
   * Watchlist / Seen it, Discover's Track / Save, the watchlist's note and Remove. Each
   * was added deliberately, each already names its own row, and collapsing them into one
   * would take back function the product went and added. What the rule forbids is a
   * control you cannot tell from the one on the row above, and §6.96's collision clause is
   * what actually measures that. So: one target, one `trailing`, and a group underneath
   * when a screen has a group — never a control inside the target.
   */
  under?: ReactNode;
}

export function Row({
  title,
  code,
  meta,
  tag,
  note,
  open,
  struck,
  disabled,
  density = 'listing',
  lead,
  trailing,
  under,
}: Props) {
  const words = (
    <span className="min-w-0 flex-1">
      <span
        className={`block truncate text-sm font-medium ${
          disabled ? 'text-ink-tertiary' : crossedOffText(!!struck)
        }`}
      >
        {title}
      </span>
      {code || meta ? (
        <span
          className={`block truncate text-xs ${disabled ? 'text-ink-tertiary' : 'text-ink-secondary'}`}
        >
          {code}
          {code && meta ? ' · ' : ''}
          {meta}
        </span>
      ) : null}
      {note ? <span className="block truncate text-xs italic text-ink-secondary">{note}</span> : null}
    </span>
  );

  const inside = (
    <>
      {lead}
      {words}
      {/* A word about the row, not a control. `AIRS FRI` is what an unaired episode gets
          instead of a ring, which is the whole reason `disabled` is not a fade. */}
      {tag ? <span className={TAG}>{tag}</span> : null}
    </>
  );

  return (
    <li className={BLOCK}>
      <div
        className={ROW_CLASS}
        style={{ minHeight: density === 'index' ? ROW.minHeight.index : ROW.minHeight.listing }}
      >
        {open ? (
        // A real `<a>` when there is a URL, so middle-click, copy-link and open-in-new-tab
        // all work — a router push behind an `onClick` silently takes those away.
          open.to !== undefined ? (
            <Link to={open.to} aria-label={open.name} className={TARGET}>
              {inside}
            </Link>
          ) : (
            <button type="button" onClick={open.run} aria-label={open.name} className={TARGET}>
              {inside}
            </button>
          )
        ) : (
          <span className={TARGET}>{inside}</span>
        )}
        {/* Outside the target, so the row is at most two controls and never one inside
            another. Whatever goes here names itself. */}
        {trailing}
      </div>
      {under}
    </li>
  );
}
