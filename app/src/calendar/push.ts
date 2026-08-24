import { getClient, getSession } from '@reviewies/core/sync/auth';
import type { NotifyPreference } from '@reviewies/core/calendar/upcoming';

/**
 * Web Push subscription management.
 *
 * On iOS this only works once the app is installed to the Home Screen — the Push API
 * does not exist in a Safari tab, and no amount of prompting changes that. Callers
 * must treat a refusal as normal rather than an error state.
 */

/** Base64url VAPID public key, safe to ship: it is the public half. */
export function vapidPublicKey(): string | undefined {
  // An empty value is how an unfilled .env line arrives; treat it as absent rather
  // than handing an empty string to applicationServerKey, which throws.
  const key = import.meta.env?.VITE_VAPID_PUBLIC_KEY as string | undefined;
  return key?.trim() ? key : undefined;
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  );
}

/**
 * The push service needs the key as a Uint8Array, not the base64url string the
 * server hands out.
 */
export function decodeVapidKey(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalised);
  // Backed by a plain ArrayBuffer rather than the ambiguous ArrayBufferLike, which
  // applicationServerKey will not accept.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Extract the two keys the server needs from a PushSubscription. */
export function subscriptionKeys(sub: PushSubscription): { p256dh: string; auth: string } | undefined {
  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) return undefined;
  return { p256dh, auth };
}

/**
 * Subscribe this device and register it with the server.
 *
 * Returns a plain reason string rather than throwing for the ordinary refusals —
 * unsupported browser, permission denied, no key configured — because those are
 * expected outcomes the UI should explain, not failures.
 */
export async function enablePush(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!pushSupported()) {
    return { ok: false, reason: 'This browser cannot receive push notifications.' };
  }

  const key = vapidPublicKey();
  if (!key) return { ok: false, reason: 'Push is not configured on this build.' };

  const client = getClient();
  const session = await getSession();
  if (!client || !session) return { ok: false, reason: 'Sign in to receive notifications.' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, reason: 'Notifications were not allowed.' };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    // userVisibleOnly is required by every browser that implements Push: silent
    // pushes are not permitted.
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(key),
      }));

    const keys = subscriptionKeys(subscription);
    if (!keys) return { ok: false, reason: 'The browser returned an unusable subscription.' };

    const { error } = await client.from('push_subscriptions').upsert(
      {
        user_id: session.user.id,
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: navigator.userAgent.slice(0, 300),
        expired_at: null,
      },
      { onConflict: 'user_id,endpoint' },
    );

    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'Subscription failed.' };
  }
}

/** Unsubscribe this device and drop it server-side. */
export async function disablePush(): Promise<void> {
  const client = getClient();
  const session = await getSession();

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      if (client && session) {
        await client
          .from('push_subscriptions')
          .delete()
          .eq('user_id', session.user.id)
          .eq('endpoint', subscription.endpoint);
      }
      await subscription.unsubscribe();
    }
  } catch {
    /* Already gone, or the service worker is unavailable. */
  }
}

/** Mirror the local granularity setting to the server, which filters before sending. */
export async function syncPreference(preference: NotifyPreference): Promise<void> {
  const client = getClient();
  const session = await getSession();
  if (!client || !session) return;

  await client.from('notification_preferences').upsert(
    { user_id: session.user.id, preference, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
}
