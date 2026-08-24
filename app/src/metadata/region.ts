/**
 * Which country's streaming availability to show.
 *
 * Availability is per country and wrong by default for anyone outside the US, so this
 * guesses from the browser and lets it be corrected. The guess is never persisted —
 * only a correction is — so a wrong guess does not quietly become permanent.
 */

const KEY = 'reviewies.region';

/**
 * Countries in the picker, in roughly the order most likely to be wanted. A shortlist,
 * not the set of valid answers: `detectRegion` accepts whatever the browser reports.
 */
export const REGIONS = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'IE', name: 'Ireland' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'AR', name: 'Argentina' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'IN', name: 'India' },
  { code: 'ZA', name: 'South Africa' },
] as const;

/**
 * Pull a region out of a BCP 47 language tag.
 *
 * `en-GB` gives GB. `en` gives nothing, because a bare language says nothing about
 * where someone is — reading US out of `en` is exactly how everyone outside the US
 * ends up looking at the wrong catalogue.
 */
export function regionFromLocale(locale: string | undefined): string | undefined {
  if (!locale) return undefined;
  // Handles en-GB, zh-Hant-TW, and the UN macro-regions (es-419) we then reject.
  const match = /^[a-z]{2,3}(?:-[A-Za-z]{4})?-([A-Za-z]{2}|\d{3})\b/i.exec(locale);
  const region = match?.[1];
  return region && /^[A-Za-z]{2}$/.test(region) ? region.toUpperCase() : undefined;
}

export function detectRegion(
  languages: readonly string[] = globalThis.navigator?.languages ??
    [globalThis.navigator?.language].filter((l): l is string => Boolean(l)),
): string {
  for (const locale of languages) {
    const region = regionFromLocale(locale);
    if (region) return region;
  }
  // Last resort, and the region with the widest coverage in TMDB's data.
  return 'US';
}

export function getRegion(): string {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored && /^[A-Z]{2}$/.test(stored)) return stored;
  } catch {
    // Private browsing or blocked storage; the guess is fine.
  }
  return detectRegion();
}

export function setRegion(code: string): void {
  try {
    localStorage.setItem(KEY, code.toUpperCase());
  } catch {
    /* Non-fatal. */
  }
}

export function regionName(code: string): string {
  const known = REGIONS.find((r) => r.code === code);
  if (known) return known.name;
  try {
    return new Intl.DisplayNames(undefined, { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
