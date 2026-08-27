import { useEffect, useState } from 'react';
import { getProvidersCached, JUSTWATCH_ATTRIBUTION } from '@reviewies/core/metadata/index';
import { getRegion, REGIONS, regionName, setRegion } from '@reviewies/core/metadata/region';
import type { CachedProviders } from '@reviewies/core/domain/types';
import { COPY } from '@reviewies/core/copy';

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
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setProviders(undefined);
    setFailed(false);
    void getProvidersCached(titleId, region).then((result) => {
      if (cancelled) return;
      setProviders(result.providers ?? null);
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
    <section className="mb-5 rounded-plate bg-surface p-4">
      {/* Wraps, and the country is allowed to shrink. `shrink-0` beside a heading that
          takes three lines at twice the text size pushed "United Kingdom" out through
          the side of its own card — visible in a screenshot and invisible to the
          viewport check, because it escaped the card and not the screen. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Where to watch</h2>
        <button
          onClick={() => setPicking(!picking)}
          aria-expanded={picking}
          aria-label={`Change country — currently ${regionName(region)}`}
          className="tap text-xs text-muted underline"
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
              className={`rounded-pill px-3 py-1.5 text-xs ${
                r.code === region ? 'bg-accent font-medium text-ink' : 'bg-surface-2 text-muted'
              }`}
            >
              {r.code}
            </button>
          ))}
        </div>
      )}

      {providers === undefined && <p className="mt-2 text-sm text-muted">Checking…</p>}

      {failed && (
        <p className="mt-2 text-sm text-accent" role="status">
          {COPY.whereToWatch.failed}
        </p>
      )}

      {!failed && nothing && (
        <p className="mt-2 text-sm text-muted">
          Not on any service in {regionName(region)} that we can see. Try another country
          above.
        </p>
      )}

      {providers && !nothing && (
        <>
          <Row label="Stream" names={providers.flatrate} />
          <Row label="Rent" names={providers.rent} />
          <Row label="Buy" names={providers.buy} />

          {providers.link && (
            <a
              href={providers.link}
              target="_blank"
              rel="noreferrer noopener"
              className="tap mt-2 inline-block text-xs text-muted underline"
            >
              Open on JustWatch
            </a>
          )}

          {/* Licence condition, not a courtesy. */}
          <p className="mt-2 text-xs text-muted">{JUSTWATCH_ATTRIBUTION}</p>
        </>
      )}
    </section>
  );
}

function Row({ label, names }: { label: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-baseline gap-1.5">
      <span className="text-xs text-muted">{label}</span>
      {names.map((name) => (
        <span key={name} className="rounded-plate bg-surface-2 px-3 py-1 text-sm">
          {name}
        </span>
      ))}
    </div>
  );
}
