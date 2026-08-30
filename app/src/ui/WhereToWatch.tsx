import { useEffect, useState } from 'react';
import { getProvidersCached } from '@reviewies/core/metadata/index';
import { Attribution } from './Attribution';
import { getRegion, REGIONS, regionName, setRegion } from '@reviewies/core/metadata/region';
import type { CachedProviders } from '@reviewies/core/domain/types';
import { COPY } from '@reviewies/core/copy';
import { Section } from './Section';
import { Note } from './Note';

/**
 * Where a title can be watched right now.
 *
 * Item 3 on doc 4's MVP list, and the reason people open a tracker at all when they
 * have decided *what* to watch but not *how*.
 *
 * The country picker is not a nicety. Availability differs completely between
 * countries, so a section that silently answered for the United States would be
 * confidently wrong for most of the world.
 *
 * Attribution to JustWatch is a licence condition of TMDB's availability data, not a
 * courtesy, so it renders whenever any availability does.
 */
export function WhereToWatch({ titleId }: { titleId: string }) {
  const [region, setRegionState] = useState(getRegion);
  const [providers, setProviders] = useState<CachedProviders | null>();
  /** Told apart from "nowhere to watch it", which is what this used to say. §6.58. */
  const [failed, setFailed] = useState(false);
  /**
   * And apart from both: nothing was asked, because there is nothing to ask about.
   *
   * An imported title has no provider ID until matching gives it one. The fixture
   * provider answered for any ID at all, so this section named a streaming service, in
   * the reader's country, credited to JustWatch, for a show nothing had identified.
   */
  const [unmatched, setUnmatched] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setProviders(undefined);
    setFailed(false);
    setUnmatched(false);
    void getProvidersCached(titleId, region).then((result) => {
      if (cancelled) return;
      setUnmatched(!!result.unmatched);
      setProviders(result.unmatched ? null : (result.providers ?? null));
      setFailed(!!result.failed && !result.providers);
    });
    return () => {
      cancelled = true;
    };
  }, [titleId, region]);

  function choose(code: string) {
    setRegion(code);
    setRegionState(code);
    setPicking(false);
  }

  const nothing =
    providers === null ||
    (providers && !providers.flatrate.length && !providers.rent.length && !providers.buy.length);

  return (
    <section className="mb-5 rounded-plate bg-ground-raised p-4">
      {/* Wraps, and the country is allowed to shrink. `shrink-0` beside a heading that
          takes three lines at twice the text size pushed "United Kingdom" out through
          the side of its own card — visible in a screenshot and invisible to the
          viewport check, because it escaped the card and not the screen. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <Section>{COPY.whereToWatch.heading}</Section>
        <button
          onClick={() => setPicking(!picking)}
          aria-expanded={picking}
          aria-label={`Change country — currently ${regionName(region)}`}
          className="tap text-s12 text-ink-secondary underline"
        >
          {regionName(region)}
        </button>
      </div>

      {picking && (
        <div role="radiogroup" aria-label="Country" className="mt-2 flex flex-wrap gap-1.5">
          {REGIONS.map((r) => (
            <button
              key={r.code}
              onClick={() => choose(r.code)}
              role="radio"
              aria-checked={r.code === region}
              // Two-letter country codes read aloud as words: "de", "gb".
              aria-label={`Show availability in ${r.name}`}
              className={`rounded-pill px-3 py-1.5 text-s12 font-title font-semibold ${
                r.code === region ? 'bg-action-fill text-action-label' : 'border border-stroke-signal text-ink-secondary'
              }`}
            >
              {r.code}
            </button>
          ))}
        </div>
      )}

      {providers === undefined && <Note className="mt-2">{COPY.waiting.checking}</Note>}

      {unmatched && (
        <Note className="mt-2">{COPY.whereToWatch.unmatched}</Note>
      )}

      {failed && (
        <p className="mt-2 text-s14 text-trouble" role="status">
          {COPY.whereToWatch.failed}
        </p>
      )}

      {!failed && !unmatched && nothing && (
        <Note className="mt-2">
          Not on any service in {regionName(region)} that we can see. Try another country
          above.
        </Note>
      )}

      {providers && !nothing && (
        <>
          <Row label={COPY.whereToWatch.stream} names={providers.flatrate} />
          <Row label={COPY.whereToWatch.rent} names={providers.rent} />
          <Row label={COPY.whereToWatch.buy} names={providers.buy} />

          {providers.link && (
            <a
              href={providers.link}
              target="_blank"
              rel="noreferrer noopener"
              className="tap mt-2 inline-block text-s12 text-ink-secondary underline"
            >{COPY.controls.openJustWatch}</a>
          )}

          {/* Licence condition, not a courtesy. */}
          <Attribution of={['justwatch']} />
        </>
      )}
    </section>
  );
}

/**
 * `Stream — Netflix · Now TV`. A label, then the names, as facts.
 *
 * They were `rounded-plate bg-ground-well` plates: the sunken ground, painted inside a
 * card that is `groundRaised`, so a service name sat **two steps darker than its own
 * container** — the only element in a hundred and thirty screenshots darker than the
 * thing it sits in, and it read as a hole punched in the card. `15-title.png`.
 *
 * The fill was the whole mistake, not its colour. `surface.ts` says the sunken ground is
 * *held down, or the inside of a plate*, and a service name is neither: it is not
 * pressable and nothing sits in it. What it is is a fact, and this build already draws a
 * run of facts one way — `Film · 2024`, `2025-11-22 · 22m`, `S1E6 · Episode 6`. So does
 * this now. No box means no shape to misread as a control, which is `Choice`'s job.
 */
function Row({ label, names }: { label: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <Note level="footnote" as="span">{label}</Note>
      <span className="text-s14">{names.join(' · ')}</span>
    </div>
  );
}
