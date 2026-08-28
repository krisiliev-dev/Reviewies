import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ROW, type RowContract, type RowOpen } from '@reviewies/core/ui/row';
import { crossedOffText } from './CrossOff';
import { Note } from './Note';

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
/**
 * The rule is on the block, so a group underneath shares the row's ruled band — and the
 * block bleeds past its container so the rule reaches the paper's edge.
 *
 * `-mx-s16 px-s16` is the whole of the full-bleed mechanism: cancel the screen's edge, then
 * re-apply it to the row, so the words stay in the column and only the rule runs out. The
 * numbers are `SCREEN.edge` and `SCREEN.bleed`, spelled as literals here because Tailwind
 * compiles from source text and a class assembled at runtime is never generated —
 * `screen.test.ts` is what holds these two to the table.
 */
const BLOCK =
  'flex flex-col gap-1.5 rounded-none border-b border-b-stroke-hairline bg-transparent py-2 -mx-s16 px-s16';
const ROW_CLASS = 'flex items-center gap-3';
/*
 * `text-left`, because one of the two branches below is a `<button>`.
 *
 * A `<button>`'s UA default is `text-align: center` and an `<a>`'s is `start`, and every
 * `Row` call site until §6.131 passed `open.to` — so the `run` branch had been in this
 * component since it was written and had never rendered. The first call site to use it
 * put "People" and its sub-line in the middle of the screen, and the first photograph the
 * web app has ever had is what showed it (§6.132).
 *
 * Measured rather than reasoned: walking up from the text, `textAlign: center` starts at
 * the `<button>` and is `start` on its parent. The first guess — an `<li>` outside a list —
 * was wrong, and putting the list back did not move the words.
 */
const TARGET =
  'flex min-w-0 flex-1 items-center gap-3 rounded-none text-left active:bg-ground-well';
const TAG =
  'shrink-0 rounded-plate border border-stroke-hairline px-1.5 py-0.5 text-s12 font-title font-semibold tracking-t83 text-ink-secondary';

interface Props extends RowContract {
  /**
   * A real `href` wherever there is one, so middle-click, copy-link and open-in-new-tab
   * keep working; `run` only for a target that has no URL. Either, not neither: the union
   * is what makes a row that goes nowhere a compile error rather than a dead card.
   */
  open?: RowOpen & ({ to: string; run?: never } | { run(): void; to?: never });
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
  count,
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
        className={`block truncate text-s14 font-title font-semibold ${
          disabled ? 'text-ink-tertiary' : crossedOffText(!!struck)
        }`}
      >
        {title}
      </span>
      {code || meta ? (
        <span
          className={`block truncate text-s12 ${disabled ? 'text-ink-tertiary' : 'text-ink-secondary'}`}
        >
          {code}
          {code && meta ? ' · ' : ''}
          {meta}
        </span>
      ) : null}
      {/* The row's own words, not a badge — see the contract for what happened when this
          was a `tag`. Same size and ink as the meta line, on a line of its own. */}
      {count ? <Note level="footnote" as="span" className="block truncate">{count}</Note> : null}
      {note ? <span className="block truncate text-s12 font-prose font-regular italic text-ink-secondary">{note}</span> : null}
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
