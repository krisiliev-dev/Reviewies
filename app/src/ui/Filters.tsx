import { useState } from 'react';
import { COPY } from '@reviewies/core/copy';
import {
  filtering,
  type Filters as FilterSet,
  type KindFilter,
  type StandingFilter,
} from '@reviewies/core/discover/filters';
import { SETTINGS_OPEN } from '@reviewies/core/ui/compose';
import { Button } from './Button';
import { Choice } from './Choice';
import { Chevron } from './Mark';
import { Row as BaseRow } from './Row';
import { Section } from './Section';

/**
 * What Discover is narrowed by, revealed rather than resident.
 *
 * `docs/design/architecture.md` section 6, and `core/src/discover/filters.ts` owns the model — the
 * three groups, what each one keeps, and why the two that were asked for and are not here
 * are refused on a measurement rather than forgotten.
 *
 * ## Revealed, and the sixth time that rule has applied
 *
 * `compose.ts`: *on a screen whose purpose is reading, composing is revealed, not resident*.
 * Three chip groups standing open above a shelf is four hundred points of control over the
 * thing somebody came to look at — §6.134's finding about the calendar's notification panel,
 * on a filter row. `SETTINGS_OPEN` is reused rather than a second constant declared beside
 * it: a filter is a setting in the only sense that rule cares about, which is that it is a
 * control panel rather than content.
 *
 * Shut, the row **states what is on**, so opening it is never the only way to find out —
 * which is the half of §6.134 that makes the closed state honest rather than merely small.
 */
export function Filters({
  value,
  onChange,
  genres,
}: {
  value: FilterSet;
  onChange: (next: FilterSet) => void;
  /** Only the genres something on the shelf actually carries — `genresOf` says why. */
  genres: readonly string[];
}) {
  const [open, setOpen] = useState(SETTINGS_OPEN);
  const on = filtering(value);

  if (!open) {
    return (
      <ul className="mb-4">
        <BaseRow
          density="index"
          title={COPY.discover.filters}
          meta={on ? COPY.discover.filtersOn : COPY.discover.filtersOff}
          open={{
            name: `${COPY.discover.filters} — ${on ? COPY.discover.filtersOn : COPY.discover.filtersOff}`,
            run: () => setOpen(true),
          }}
          trailing={<Chevron points="right" className="ml-2 text-s16 text-ink-secondary" />}
        />
      </ul>
    );
  }

  return (
    <section className="mb-4 rounded-plate bg-ground-raised p-4">
      <Section>{COPY.discover.filterKind}</Section>
      <Choice<KindFilter>
        name={COPY.discover.filterKind}
        options={[
          { key: 'any', label: COPY.discover.anyKind },
          { key: 'show', label: COPY.kinds.show },
          { key: 'film', label: COPY.kinds.film },
        ]}
        value={value.kind}
        onChange={(kind) => onChange({ ...value, kind })}
      />

      {/* Only when there is more than one to choose between. A single-option radiogroup is
          a control that cannot do anything, and on a shelf of unmatched imports — which
          carry no genres at all — this group would otherwise be one chip reading "Any
          genre" with nothing to narrow to. */}
      {genres.length > 1 && (
        <>
          <Section>{COPY.discover.filterGenre}</Section>
          {/* Sideways rather than as many rows as it takes: the length of this group is the
              provider's data rather than the product's, which is exactly the case `scroll`
              was added for on Stats' year chips. */}
          <Choice<string>
            name={COPY.discover.filterGenre}
            scroll
            options={[
              { key: 'any', label: COPY.discover.anyGenre },
              ...genres.map((genre) => ({ key: genre, label: genre })),
            ]}
            value={value.genre}
            onChange={(genre) => onChange({ ...value, genre })}
          />
        </>
      )}

      <Section>{COPY.discover.filterStanding}</Section>
      <Choice<StandingFilter>
        name={COPY.discover.filterStanding}
        options={[
          { key: 'any', label: COPY.discover.anyStanding },
          { key: 'well-rated', label: COPY.discover.wellRated },
        ]}
        value={value.standing}
        onChange={(standing) => onChange({ ...value, standing })}
      />

      <div className="mt-3">
        <Button
          onPress={() => setOpen(false)}
          label={COPY.controls.done}
          name={`${COPY.controls.done} — close ${COPY.discover.filters.toLowerCase()}`}
        />
      </div>
    </section>
  );
}
