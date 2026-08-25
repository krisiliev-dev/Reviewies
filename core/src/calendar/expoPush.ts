/**
 * Talking to Expo's push service.
 *
 * The web receives notifications through Web Push: an endpoint URL and a keypair, with
 * the payload encrypted to them. A phone cannot use any of that — iOS and Android
 * deliver through APNs and FCM, which an Expo app reaches through Expo's service using
 * an opaque token. So the sender needs a second path, and this is the part of it that is
 * pure: building the messages, and reading what comes back.
 *
 * Pure on purpose. The delivery loop runs in an edge function against a real push
 * service and cannot be exercised anywhere else, so everything that can be decided
 * without a network is decided here, where it can be tested.
 */

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Expo rejects a request carrying more than this many messages. */
export const EXPO_BATCH_SIZE = 100;

export interface Notification {
  title: string;
  body: string;
  url?: string;
  targetId?: string;
}

export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  /** Delivered to the app, which uses it to open the right screen. */
  data: { url: string; targetId?: string };
  sound: 'default';
  /** Collapses repeats about the same episode rather than stacking them. */
  channelId: 'upcoming';
}

/**
 * One message per token.
 *
 * Expo accepts an array in a single request, which matters: a person with a phone and a
 * tablet should cost one call, not two, and the queue is drained on a schedule where
 * request count is the thing that adds up.
 */
export function buildMessages(tokens: string[], notification: Notification): ExpoMessage[] {
  return tokens.map((to) => ({
    to,
    title: notification.title,
    body: notification.body,
    data: { url: notification.url ?? '/', targetId: notification.targetId },
    sound: 'default',
    channelId: 'upcoming',
  }));
}

/** Split into requests Expo will accept. */
export function batch<T>(items: T[], size = EXPO_BATCH_SIZE): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

export interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

export interface DeliveryOutcome {
  /** True if at least one device accepted it. */
  delivered: boolean;
  /** Tokens Expo says are dead, to stop trying against. */
  expired: string[];
  /** Anything that failed for some other reason, worth surfacing rather than hiding. */
  errors: string[];
}

/**
 * Read a batch of tickets against the tokens they were sent for.
 *
 * Expo returns one ticket per message, in order, and `DeviceNotRegistered` is the one
 * that means *stop* rather than *try again* — the app was uninstalled, or the token was
 * replaced. Treating it as a transient failure is how a queue fills up with sends that
 * can never succeed.
 *
 * A short or missing array is treated as a failure for the tokens it does not cover,
 * rather than as silent success. Expo is documented to return one ticket per message;
 * if it ever does not, the honest reading is that those messages are unaccounted for.
 */
export function readTickets(tokens: string[], tickets: ExpoTicket[]): DeliveryOutcome {
  const outcome: DeliveryOutcome = { delivered: false, expired: [], errors: [] };

  tokens.forEach((token, index) => {
    const ticket = tickets[index];
    if (!ticket) {
      outcome.errors.push(`no ticket returned for ${token}`);
      return;
    }
    if (ticket.status === 'ok') {
      outcome.delivered = true;
      return;
    }
    if (ticket.details?.error === 'DeviceNotRegistered') {
      outcome.expired.push(token);
      return;
    }
    outcome.errors.push(ticket.message ?? 'unknown push error');
  });

  return outcome;
}

/** Merge the outcomes of several batches into one answer about this notification. */
export function mergeOutcomes(outcomes: DeliveryOutcome[]): DeliveryOutcome {
  return {
    delivered: outcomes.some((o) => o.delivered),
    expired: outcomes.flatMap((o) => o.expired),
    errors: outcomes.flatMap((o) => o.errors),
  };
}
