/**
 * A line budget as Tailwind classes, written out, for the whole web app.
 *
 * The phone reads a number straight — `numberOfLines={ROW_LINES.note}` — and the web cannot
 * do the same thing, because Tailwind generates the utilities it can *see* and a class built
 * at runtime is a class that does not exist. A static map is how the web reads a number
 * without lying to the compiler: every literal is in the source, so every one is generated,
 * and the number itself still comes from one place. §6.179.
 *
 * It lived inside `Row.tsx` for exactly one sprint. §6.180 needed the same lookup for
 * `Button`'s label and a second copy of a three-entry map is how the forty-five button
 * styles this design system replaced got started — so it is a module, and the guards in
 * `row.test.ts` and `button.test.ts` both read it here.
 */
export const CLAMP = { 1: 'truncate', 2: 'line-clamp-2' } as const;

/** The budgets the map can spell. A number outside it is a compile error, not a blank class. */
export type ClampLines = keyof typeof CLAMP;
