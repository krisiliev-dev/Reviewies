import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPreference, notificationsSupported, setPreference } from './upcoming.ts';
import { deviceTimeZone } from './preference.ts';
import { setStorage } from '../data/storage.ts';

/**
 * The notification setting, and the timezone that rides with it.
 *
 * All three of these came back with zero executions when §6.68 measured coverage for the
 * first time. `getPreference` carries a *default* — the choice somebody gets without
 * choosing — which §6.55 spent a whole sprint arguing is a decision like any other, and
 * nothing checked it. `deviceTimeZone` was written last sprint (§6.66) and never run.
 */

const freshStore = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
};

beforeEach(() => setStorage(freshStore()));

describe('how loudly to announce an episode', () => {
  it('defaults to milestones', () => {
    // Useful without being the thing people complain about — the sentence is in
    // `upcoming.ts` and this is what makes it true.
    expect(getPreference()).toBe('milestones');
  });

  it('remembers each of the three choices', () => {
    for (const choice of ['off', 'milestones', 'all'] as const) {
      setPreference(choice);
      expect(getPreference()).toBe(choice);
    }
  });

  it('falls back to the default rather than serving a value that is not one', () => {
    // Storage is shared with everything else on the origin and survives every upgrade;
    // a stale or hand-edited value must not reach `shouldNotify` as a fourth case.
    setStorage({ ...freshStore(), getItem: () => 'loud' });
    expect(getPreference()).toBe('milestones');
  });

  it('survives a store that refuses to write', () => {
    // Safari in a private window, or a full quota. Losing a preference is acceptable;
    // throwing where somebody taps a radio button is not.
    setStorage({
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    });
    expect(() => setPreference('all')).not.toThrow();
    expect(getPreference()).toBe('milestones');
  });
});

describe('whether notifications are possible here', () => {
  it('says no where the API does not exist', () => {
    // jsdom has no Notification, which is the same answer a phone's WebView gives.
    expect(notificationsSupported()).toBe(false);
  });

  it('says yes where it does', () => {
    vi.stubGlobal('Notification', class {});
    expect(notificationsSupported()).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe('the timezone sent with the setting', () => {
  it('is an IANA name the server can resolve', () => {
    // Not an offset: an offset is wrong for half the year anywhere with daylight saving,
    // and Postgres resolves a name against the date. §6.66.
    expect(deviceTimeZone()).toMatch(/^[A-Za-z]+(\/[A-Za-z_+-]+)+$|^UTC$/);
  });

  it('falls back to UTC rather than throwing where the runtime cannot say', () => {
    // Which is what everybody had before the column existed, so an upgrade cannot stop
    // notifying somebody whose runtime has no Intl data.
    vi.stubGlobal('Intl', {
      DateTimeFormat: () => {
        throw new Error('no ICU');
      },
    });
    expect(deviceTimeZone()).toBe('UTC');
    vi.unstubAllGlobals();
  });

  it('falls back to UTC when the runtime answers with nothing', () => {
    vi.stubGlobal('Intl', { DateTimeFormat: () => ({ resolvedOptions: () => ({}) }) });
    expect(deviceTimeZone()).toBe('UTC');
    vi.unstubAllGlobals();
  });
});
