import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setConfig } from '@reviewies/core/config';
import { decodeVapidKey, pushSupported, subscriptionKeys, vapidPublicKey } from './push';

describe('VAPID key decoding', () => {
  it('decodes a base64url key to raw bytes', () => {
    // A real uncompressed P-256 public key is 65 bytes starting with 0x04.
    const key =
      'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
    const bytes = decodeVapidKey(key);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(0x04);
  });

  it('handles keys needing base64 padding', () => {
    // base64url strips '=' padding; decoding must put it back or atob throws.
    expect(() => decodeVapidKey('QQ')).not.toThrow();
    expect(decodeVapidKey('QQ').length).toBe(1);
  });

  it('translates the url-safe alphabet', () => {
    // '-' and '_' are base64url's replacements for '+' and '/'.
    expect(Array.from(decodeVapidKey('--__'))).toEqual(
      Array.from(Uint8Array.from(atob('++//'), (c) => c.charCodeAt(0))),
    );
  });

  it('produces a buffer the Push API will accept', () => {
    // applicationServerKey rejects a SharedArrayBuffer-backed view.
    expect(decodeVapidKey('QQ').buffer).toBeInstanceOf(ArrayBuffer);
  });
});

describe('subscription keys', () => {
  const fake = (keys?: Record<string, string>) =>
    ({ toJSON: () => ({ keys }) }) as unknown as PushSubscription;

  it('extracts both keys', () => {
    expect(subscriptionKeys(fake({ p256dh: 'a', auth: 'b' }))).toEqual({ p256dh: 'a', auth: 'b' });
  });

  it('returns nothing when a key is missing', () => {
    // A partial subscription is unusable; sending it to the server would create a
    // row that can never receive anything.
    expect(subscriptionKeys(fake({ p256dh: 'a' }))).toBeUndefined();
    expect(subscriptionKeys(fake())).toBeUndefined();
  });
});

describe('capability detection', () => {
  it('reports unsupported in jsdom, which lacks PushManager', () => {
    // The important property is that it answers rather than throwing.
    expect(typeof pushSupported()).toBe('boolean');
  });

  /**
   * All four conditions, and each one on its own.
   *
   * The check above only ever sees `false`, because jsdom has no `PushManager` — so
   * §6.77 could invert any single condition and it stayed false and stayed green. A
   * function that can only be observed returning one value is not being observed.
   *
   * The phone has the same shape in `mobile/src/notifications.ts` and the same tests
   * now. Two platforms deciding the same thing differently is §6.51's subject, and the
   * only way to notice is to drive both.
   */
  describe('with a browser that has everything', () => {
    const absent = Symbol('absent');
    const globals = globalThis as unknown as Record<string, unknown>;
    const saved = new Map<string, unknown>();

    const give = (name: string, value: unknown) => {
      if (!saved.has(name)) saved.set(name, name in globals ? globals[name] : absent);
      globals[name] = value;
    };
    const take = (name: string) => {
      if (!saved.has(name)) saved.set(name, name in globals ? globals[name] : absent);
      delete globals[name];
    };

    beforeEach(() => {
      give('PushManager', function PushManager() {});
      give('Notification', function Notification() {});
      Object.defineProperty(navigator, 'serviceWorker', {
        value: {},
        configurable: true,
      });
    });

    afterEach(() => {
      for (const [name, value] of saved) {
        if (value === absent) delete globals[name];
        else globals[name] = value;
      }
      saved.clear();
    });

    it('says yes', () => {
      expect(pushSupported()).toBe(true);
    });

    it('says no without a Push API', () => {
      take('PushManager');
      expect(pushSupported()).toBe(false);
    });

    it('says no without notifications', () => {
      take('Notification');
      expect(pushSupported()).toBe(false);
    });

    it('says no without a service worker', () => {
      Reflect.deleteProperty(navigator, 'serviceWorker');
      expect(pushSupported()).toBe(false);
    });
  });

  it('returns undefined when no key is configured', () => {
    // Driven through the injected config rather than the ambient environment.
    // Asserting that a real .env happens to lack the key made this pass until the key
    // was actually set, then fail for a reason unrelated to the code.
    setConfig({});
    expect(vapidPublicKey()).toBeUndefined();
  });

  it('returns the key when one is configured', () => {
    setConfig({ vapidPublicKey: 'BExample' });
    expect(vapidPublicKey()).toBe('BExample');
    setConfig({});
  });
});
