import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What the phone says when it cannot do notifications.
 *
 * This file's own header says it "cannot be tested anywhere but a device", and half of
 * that is true: `getExpoPushTokenAsync` needs a real build and a project id, and §7 has
 * said since §6.50 that it has never executed. The other half is not. `pushSupported`
 * and `whyNotSupported` are pure functions of three imports — the platform, whether this
 * is a real device, and whether the build has a project id — and every one of those can
 * be replaced here.
 *
 * §6.77 mutated the file and all nineteen changes survived, including every branch of
 * the sentence somebody reads when the answer is no. §6.50's whole point was that
 * offering a setting that can never work is worse than offering none; the sentence that
 * explains why is the part of that promise this side of the boundary can keep.
 *
 * The module registers a notification handler at import time, so the Expo modules are
 * replaced before it loads rather than after.
 */
const platform = { OS: 'ios' as string };
const device = { isDevice: true };
const constants = { expoConfig: { extra: { eas: { projectId: 'abc-123' } } } as unknown };

vi.mock('react-native', () => ({ Platform: platform }));
vi.mock('expo-device', () => device);
vi.mock('expo-constants', () => ({ default: constants }));
vi.mock('expo-notifications', () => ({
  setNotificationHandler: vi.fn(),
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
  AndroidImportance: { DEFAULT: 3 },
}));
vi.mock('@reviewies/core/sync/auth', () => ({
  getClient: () => undefined,
  getSession: async () => null,
}));
vi.mock('@reviewies/core/calendar/preference', () => ({ syncPreference: vi.fn() }));
vi.mock('@reviewies/core/calendar/upcoming', () => ({ setPreference: vi.fn() }));

const { pushSupported, whyNotSupported, registerForPush } = await import('./notifications.ts');

beforeEach(() => {
  platform.OS = 'ios';
  device.isDevice = true;
  constants.expoConfig = { extra: { eas: { projectId: 'abc-123' } } };
});

describe('whether this phone can be notified at all', () => {
  it('says yes on a real device in a build that has a project id', () => {
    expect(pushSupported()).toBe(true);
    expect(whyNotSupported()).toBe('');
  });

  it('says no on the web, where the browser does it instead', () => {
    platform.OS = 'web';
    expect(pushSupported()).toBe(false);
    expect(whyNotSupported()).toContain('browser');
  });

  it('says no on a simulator, and says which of the three reasons it is', () => {
    device.isDevice = false;
    expect(pushSupported()).toBe(false);
    expect(whyNotSupported()).toContain('simulator');
  });

  it('says no in a build with no project id', () => {
    constants.expoConfig = { extra: {} };
    expect(pushSupported()).toBe(false);
    expect(whyNotSupported()).toContain('project id');
  });

  it('needs all three, not any one of them', () => {
    // The three conditions are joined with `&&`, and §6.77 turned each into an `||`.
    // One good answer out of three must not read as supported.
    platform.OS = 'web';
    device.isDevice = false;
    constants.expoConfig = { extra: {} };
    expect(pushSupported()).toBe(false);

    device.isDevice = true;
    expect(pushSupported()).toBe(false);
  });

  it('reads the project id from the other place Expo puts it', () => {
    // `expoConfig.extra.eas.projectId` in a managed build, `easConfig.projectId` in
    // some others. Falling back matters: without it a real build reports "no project
    // id" and offers nothing.
    constants.expoConfig = undefined;
    (constants as { easConfig?: unknown }).easConfig = { projectId: 'xyz-789' };
    expect(pushSupported()).toBe(true);
    delete (constants as { easConfig?: unknown }).easConfig;
  });
});

describe('registering, when it cannot work', () => {
  it('explains rather than throwing', async () => {
    platform.OS = 'web';
    const result = await registerForPush();
    expect(result).toEqual({ ok: false, reason: whyNotSupported() });
  });

  it('and asks for no permission it could not act on', async () => {
    const notifications = await import('expo-notifications');
    device.isDevice = false;
    await registerForPush();
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});
