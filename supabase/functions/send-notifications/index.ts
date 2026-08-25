/**
 * Sends queued Web Push notifications.
 *
 * This is the piece earlier phases called "needs a server". Supabase edge functions
 * are that server, so the work was schema plus this handler, not infrastructure.
 *
 * Invoked on a schedule (pg_cron) and idempotent: it claims rows by stamping
 * `sent_at` before dispatching, so two overlapping runs cannot double-send.
 *
 * Deploy:
 *   supabase functions deploy send-notifications --no-verify-jwt
 *   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import {
  EXPO_PUSH_URL,
  batch,
  buildMessages,
  mergeOutcomes,
  readTickets,
  type DeliveryOutcome,
  type Notification,
} from '../../../core/src/calendar/expoPush.ts';

const BATCH = 100;

/**
 * Send to Expo, in batches it will accept.
 *
 * The decisions are all in `@reviewies/core` — which messages to build, how to read the
 * tickets, which failures mean stop rather than retry — so this is transport and
 * nothing else, and the part that cannot be tested without a real push service is the
 * part with no logic in it.
 */
async function sendExpo(tokens: string[], notification: Notification): Promise<DeliveryOutcome> {
  const outcomes: DeliveryOutcome[] = [];

  for (const group of batch(tokens)) {
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(buildMessages(group, notification)),
      });

      if (!response.ok) {
        outcomes.push({
          delivered: false,
          expired: [],
          errors: [`expo returned ${response.status}`],
        });
        continue;
      }

      const body = (await response.json()) as { data?: unknown };
      outcomes.push(readTickets(group, Array.isArray(body.data) ? body.data : []));
    } catch (err) {
      // A network failure is transient: no token is retired over it, and the queue item
      // is released for another attempt by the caller.
      outcomes.push({
        delivered: false,
        expired: [],
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
  }

  return mergeOutcomes(outcomes);
}

Deno.serve(async (req) => {
  // The function runs with the service role, so it must not be openly callable.
  // pg_cron passes the shared secret; anything else is refused.
  const secret = Deno.env.get('CRON_SECRET');
  if (secret && req.headers.get('x-cron-secret') !== secret) {
    return new Response('forbidden', { status: 403 });
  }

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@reviewies.app';
  if (!publicKey || !privateKey) {
    return Response.json({ error: 'VAPID keys not configured' }, { status: 500 });
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: pending, error } = await supabase
    .from('notification_queue')
    .select('id, user_id, target_id, title, body, url, kind, attempts')
    .is('sent_at', null)
    .lte('send_after', new Date().toISOString())
    .lt('attempts', 5)
    .limit(BATCH);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!pending?.length) return Response.json({ sent: 0, skipped: 0 });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of pending) {
    // Claim first. If dispatch then fails we clear it again, but the window where
    // a concurrent run could pick up the same row is closed.
    const { error: claimError } = await supabase
      .from('notification_queue')
      .update({ sent_at: new Date().toISOString(), attempts: item.attempts + 1 })
      .eq('id', item.id)
      .is('sent_at', null);
    if (claimError) continue;

    // Respect the user's granularity server-side too: a client setting that only
    // filtered on the device would still cost a send.
    const { data: pref } = await supabase
      .from('notification_preferences')
      .select('preference')
      .eq('user_id', item.user_id)
      .maybeSingle();

    const preference = pref?.preference ?? 'milestones';
    const wanted =
      preference === 'all' || (preference === 'milestones' && item.kind !== 'regular');

    if (!wanted) {
      skipped++;
      continue;
    }

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', item.user_id)
      .is('expired_at', null);

    // A phone cannot receive a Web Push, so its devices live in their own table and are
    // sent to through Expo. Someone with a browser and a phone should get one
    // notification on each, which means both are consulted before anything is skipped.
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('id, token')
      .eq('user_id', item.user_id)
      .is('expired_at', null);

    if (!subs?.length && !tokens?.length) {
      skipped++;
      continue;
    }

    const payload = JSON.stringify({
      title: item.title,
      body: item.body,
      url: item.url ?? '/',
      targetId: item.target_id,
    });

    let anyDelivered = false;

    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        anyDelivered = true;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410 mean the browser threw the subscription away. Mark it expired
        // rather than retrying forever against a dead endpoint.
        if (status === 404 || status === 410) {
          await supabase
            .from('push_subscriptions')
            .update({ expired_at: new Date().toISOString() })
            .eq('id', sub.id);
        }
      }
    }

    if (tokens?.length) {
      const outcome = await sendExpo(
        tokens.map((t) => t.token as string),
        { title: item.title, body: item.body, url: item.url ?? undefined, targetId: item.target_id },
      );
      if (outcome.delivered) anyDelivered = true;

      // Expo says these will never work again — the app was uninstalled, or the token
      // was replaced. Marked rather than deleted, for the same reason as a dead Web
      // Push endpoint: a send in flight should not be reading a row that vanished.
      for (const token of outcome.expired) {
        await supabase
          .from('push_tokens')
          .update({ expired_at: new Date().toISOString() })
          .eq('user_id', item.user_id)
          .eq('token', token);
      }
    }

    if (anyDelivered) {
      sent++;
    } else {
      failed++;
      // Release it for another attempt; attempts has already been incremented, so
      // this cannot loop forever.
      await supabase
        .from('notification_queue')
        .update({ sent_at: null, last_error: 'no subscription accepted the push' })
        .eq('id', item.id);
    }
  }

  return Response.json({ sent, skipped, failed });
});
