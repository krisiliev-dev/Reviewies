import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { getClient, getSession } from '@reviewies/core/sync/auth';
import { syncPreference as syncPreferenceToServer } from '@reviewies/core/calendar/preference';
import { setPreference, type NotifyPreference } from '@reviewies/core/calendar/upcoming';

/**
 * Registering this phone to be notified.
 *
 * The phone has offered notification granularity settings since it shipped and had
 * nothing that could ever act on them — the backend speaks Web Push, which a phone
 * cannot receive. Announcing a choice about notifications that can never arrive is
 * worse than announcing none, so this is the half that makes the setting mean something.
 *
 * ## What is verified and what is not
 *
 * The decisions live in `@reviewies/core/calendar/expoPush` and are tested there. The
 * schema and its policy are tested against real Postgres. Getting a token cannot be
 * tested anywhere but a device: a simulator has no push token, and
 * `getExpoPushTokenAsync` needs a project id and a real build to return one. It is
 * written to fail into an explanation rather than an exception, because the state it
 * will most often be in during development is "not possible here".
 *
 * That last sentence used to read "this file cannot be tested anywhere but a device",
 * which was true of half of it and got applied to all of it. §6.77 mutated the file and
 * all nineteen changes survived — including every branch of the sentence somebody reads
 * when the answer is no, which is the part §6.50 existed to get right. `pushSupported`
 * and `whyNotSupported` are pure functions of the platform, whether this is a real
 * device, and whether the build has a project id; all three are imports, and
 * `notifications.test.ts` replaces them. What is still device-only is everything past
 * the permission prompt.
 */

/** How a notification behaves when it lands while the app is open. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    // Nobody needs to be told about an episode by the app they are currently holding.
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export type RegisterResult =
  | { ok: true; token: string }
  | { ok: false; reason: string };

/** The Expo project this build belongs to, which the push service keys tokens against. */
function projectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId
  );
}

/**
 * True when a token could plausibly be obtained here.
 *
 * Checked before asking for permission rather than after, so a simulator does not
 * produce a permission prompt it can do nothing with.
 */
export function pushSupported(): boolean {
  return Device.isDevice && Platform.OS !== 'web' && !!projectId();
}

export function whyNotSupported(): string {
  if (Platform.OS === 'web') return 'Notifications on the web come from the browser, not from here.';
  if (!Device.isDevice) return 'A simulator cannot receive push notifications. Try a real device.';
  if (!projectId()) return 'This build has no Expo project id, so no push token can be issued.';
  return '';
}

/**
 * Ask for permission, get a token, and record it against the signed-in account.
 *
 * Idempotent: the same device registering twice replaces its row rather than adding
 * one, so a token that survives a reinstall does not accumulate duplicates that would
 * each receive a copy of every notification.
 */
export async function registerForPush(): Promise<RegisterResult> {
  if (!pushSupported()) return { ok: false, reason: whyNotSupported() };

  const session = await getSession();
  const client = getClient();
  if (!client || !session) {
    return { ok: false, reason: 'Sign in first — a notification has to be addressed to someone.' };
  }

  const existing = await Notifications.getPermissionsAsync();
  const granted = existing.granted
    ? existing
    : await Notifications.requestPermissionsAsync();
  if (!granted.granted) {
    return { ok: false, reason: 'Notifications are turned off for this app in Settings.' };
  }

  if (Platform.OS === 'android') {
    // Android requires a channel before anything can be delivered, and the id has to
    // match what the sender puts on each message.
    await Notifications.setNotificationChannelAsync('upcoming', {
      name: 'Upcoming episodes',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  let token: string;
  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    token = result.data;
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'Could not get a push token.' };
  }

  const { error } = await client.from('push_tokens').upsert(
    {
      user_id: session.user.id,
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      device: Device.modelName ?? undefined,
      expired_at: null,
    },
    { onConflict: 'user_id,token' },
  );

  if (error) return { ok: false, reason: error.message };
  return { ok: true, token };
}

/** Stop notifying this device, without touching anyone else's. */
export async function unregisterFromPush(): Promise<void> {
  const client = getClient();
  const session = await getSession();
  if (!client || !session || !pushSupported()) return;

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    await client
      .from('push_tokens')
      .delete()
      .eq('user_id', session.user.id)
      .eq('token', data);
  } catch {
    /* No token to remove, which is the same outcome. */
  }
}

/**
 * Mirror the local granularity setting to the server, which filters before sending.
 *
 * The server half is the core's, shared with the web — it was the same six lines here
 * and there. The phone additionally writes the choice to its own store first, which the
 * web does at its call site. §6.66.
 */
export async function syncPreference(preference: NotifyPreference) {
  setPreference(preference);
  return syncPreferenceToServer(preference);
}
