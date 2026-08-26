import { beforeEach, describe, expect, it } from 'vitest';
import { detectRegion, getRegion, regionFromLocale, regionName, setRegion } from './region.ts';
import { setStorage } from '../data/storage.ts';

/** A store per case: the module-level default is shared, and a leak here reads as flake. */
const freshStore = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
};

describe('reading a region from a locale', () => {
  it('takes the region from a full tag', () => {
    expect(regionFromLocale('en-GB')).toBe('GB');
    expect(regionFromLocale('pt-BR')).toBe('BR');
  });

  it('handles a script subtag in the middle', () => {
    expect(regionFromLocale('zh-Hant-TW')).toBe('TW');
  });

  it('upper-cases a lower-case region', () => {
    expect(regionFromLocale('en-gb')).toBe('GB');
  });

  it('refuses to guess from a bare language', () => {
    // Reading US out of "en" is exactly how everyone outside the US ends up looking
    // at the wrong catalogue.
    expect(regionFromLocale('en')).toBeUndefined();
    expect(regionFromLocale('de')).toBeUndefined();
  });

  it('ignores a UN macro-region, which is not a country', () => {
    expect(regionFromLocale('es-419')).toBeUndefined();
  });

  it('copes with nothing at all', () => {
    expect(regionFromLocale(undefined)).toBeUndefined();
    expect(regionFromLocale('')).toBeUndefined();
  });
});

describe('detecting a region', () => {
  it('uses the first language that names one', () => {
    expect(detectRegion(['en', 'en-AU', 'ja-JP'])).toBe('AU');
  });

  it('falls back to US when nothing says where you are', () => {
    expect(detectRegion(['en', 'fr'])).toBe('US');
    expect(detectRegion([])).toBe('US');
  });
});

/**
 * The two that read and write the stored choice, which nothing had ever called.
 *
 * §6.68 found them by measuring: every pure function around them is tested and these
 * two, the ones the *screen* actually calls, had zero executions. Where-to-watch is
 * entirely a statement about one country, so a region that does not survive being saved
 * makes the whole feature quietly wrong for anybody who changed it.
 */
describe('the region somebody chose', () => {
  beforeEach(() => {
    setStorage(freshStore());
  });

  it('comes back', () => {
    setRegion('GB');
    expect(getRegion()).toBe('GB');
  });

  it('is stored upper-case however it was typed', () => {
    setRegion('gb');
    expect(getRegion()).toBe('GB');
  });

  it('falls back to detection when nothing has been chosen', () => {
    expect(getRegion()).toBe(detectRegion());
  });

  it('ignores a stored value that is not a country, rather than serving it', () => {
    // A UN macro-region, or anything else that ended up in storage. Handing "419" to
    // TMDB returns nothing at all, which reads as "not streaming anywhere".
    setRegion('419');
    expect(getRegion()).toBe(detectRegion());
  });
});

describe('naming a region', () => {
  it('names the ones in the picker', () => {
    expect(regionName('GB')).toBe('United Kingdom');
  });

  it('still names one that is not', () => {
    // The picker is a shortlist, not the set of valid answers.
    expect(regionName('BE')).not.toBe('BE');
  });
});
