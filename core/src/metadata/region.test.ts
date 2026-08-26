import { describe, expect, it } from 'vitest';
import { detectRegion, regionFromLocale, regionName } from './region.ts';

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

describe('naming a region', () => {
  it('names the ones in the picker', () => {
    expect(regionName('GB')).toBe('United Kingdom');
  });

  it('still names one that is not', () => {
    // The picker is a shortlist, not the set of valid answers.
    expect(regionName('BE')).not.toBe('BE');
  });
});
