import {
  POSTER_GLYPH,
  POSTER_PLATE,
  POSTER_SIZE,
  posterInitials,
  type PosterSize,
} from '@reviewies/core/ui/poster';

/**
 * The Tailwind renderer of `core/src/ui/poster.ts`. The decisions are there.
 *
 * Posters are loaded straight from the provider CDN rather than cached locally — iOS caps
 * the Cache API at roughly 50 MB per partition, and artwork would crowd out the data that
 * actually needs to survive.
 *
 * The sizes are class literals because Tailwind v4 compiles from source text; `poster.test.ts`
 * holds them to the table, which is what caught the row poster being two points short of the
 * 2:3 its own row height was built from.
 */

const SIZE_CLASS = {
  row: 'h-[66px] w-11',
  detail: 'h-36 w-24',
} as const satisfies Record<PosterSize, string>;

const PLATE = 'rounded-plate border-b-ground shrink-0 overflow-hidden';

/**
 * The band along the foot, from the direction: a 4pt strip in the ground at the bottom edge,
 * which is what makes a poster read as something mounted rather than something floating.
 *
 * An inline width from the token rather than a utility, because there is no utility to have.
 * `border-b-s4` was the obvious spelling and it generates **nothing**: the space scale is
 * emitted into Tailwind's `--spacing` namespace and border widths come from
 * `--border-width-*`, which holds strokes only. The band would simply not have appeared, in
 * silence, which is §6.85's trap — a class with no rule behind it looks exactly like a class.
 * `Progress` reads its width the same way for the same reason.
 */
const BAND = { borderBottomWidth: POSTER_PLATE.band };

export function Poster({
  url,
  name,
  size = 'row',
  className = '',
}: {
  url?: string;
  name: string;
  size?: PosterSize;
  className?: string;
}) {
  const box = `${PLATE} ${SIZE_CLASS[size]} ${className}`;
  if (!url) {
    return (
      <div
        style={{ ...BAND, fontSize: POSTER_GLYPH[size] }}
        className={`${box} flex items-center justify-center bg-ground-well text-center font-title font-semibold leading-l120 text-ink-secondary`}
        aria-hidden="true"
      >
        {/*
          A monogram, not the title. The plate used to print `name`, which every call site
          already prints twelve points to the right — and printed it broken: "Kitchen
          Nightshi / ft" on Up Next, in a 44pt plate that holds one short word. §6.137, and
          `core/ui/poster.ts` has the rule. Two glyphs never break, so no clamp is needed.
        */}
        {posterInitials(name)}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      style={BAND}
      className={`${box} bg-ground-well object-cover`}
      width={POSTER_SIZE[size].width}
      height={POSTER_SIZE[size].height}
    />
  );
}
