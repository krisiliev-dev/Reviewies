import { useEffect, useState } from 'react';
import { getProvidersCached, JUSTWATCH_ATTRIBUTION } from '@reviewies/core/metadata/index';
import { getRegion, REGIONS, regionName, setRegion } from '@reviewies/core/metadata/region';
import type { CachedProviders } from '@reviewies/core/domain/types';

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
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setProviders(undefined);
    void getProvidersCached(titleId, region).then((found) => {
      if (!cancelled) setProviders(found ?? null);
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
    <section className="mb-5 rounded-2xl bg-surface p-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Where to watch</h2>
        <button
          onClick={() => setPicking(!picking)}
          aria-expanded={picking}
          aria-label={`Change country — currently ${regionName(region)}`}
          className="tap shrink-0 text-xs text-muted underline"
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
              className={`rounded-lg px-2.5 py-1.5 text-xs ${
                r.code === region ? 'bg-accent font-medium text-ink' : 'bg-surface-2 text-muted'
              }`}
            >
              {r.code}
            </button>
          ))}
        </div>
      )}

      {providers === undefined && <p className="mt-2 text-sm text-muted">Checking…</p>}

      {nothing && (
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
        <span key={name} className="rounded-lg bg-surface-2 px-2.5 py-1 text-sm">
          {name}
        </span>
      ))}
    </div>
  );
}
