import { getClient, getSession } from '../sync/auth.ts';
import type { NotifyPreference } from './upcoming.ts';
import { COPY } from '../copy.ts';

/**
 * The one place a notification setting is mirrored to the server.
 *
 * It was two — the same six lines in `app/src/calendar/push.ts` and
 * `mobile/src/notifications.ts` — which is how the timezone below would have ended up
 * on one platform and not the other.
 */

/**
 * This device's timezone, as an IANA name.
 *
 * An offset would be wrong twice a year: somebody in London is +0 in January and +60 in
 * July, and a notification queued against a stored offset would arrive an hour out for
 * half the year. The name survives that, because Postgres knows what `Europe/London`
 * means on any given date.
 *
 * Falls back to UTC where the runtime cannot say, which is the behaviour the server had
 * for everybody before this existed.
 */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Mirror the local granularity setting to the server, which filters before sending.
 *
 * The timezone rides along because the scheduler needs it and this is the only row the
 * client ever writes about notifications. Sent on every change, so somebody who moves —
 * or travels — is queued against where they are the next time they touch the setting.
 * §6.66 records what that does not cover.
 */
export async function syncPreference(
  preference: NotifyPreference,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const client = getClient();
  const session = await getSession();
  // Nobody signed in is not a failure: the setting is kept locally and there is no
  // server to disagree with it.
  if (!client || !session) return { ok: true };

  const { error } = await client.from('notification_preferences').upsert(
    {
      user_id: session.user.id,
      preference,
      time_zone: deviceTimeZone(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  // Worth saying out loud rather than swallowing. The server filters before it spends a
  // send, so a mirror that failed means somebody who just turned notifications off keeps
  // getting them — the one direction of this that people notice and resent. §6.57's rule,
  // and the reason this function had to stop returning void when it moved into the core.
  if (error) return { ok: false, reason: COPY.calendar.notifySyncFailed };
  return { ok: true };
}
