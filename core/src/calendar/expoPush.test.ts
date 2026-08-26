import { describe, expect, it } from 'vitest';
import {
  EXPO_BATCH_SIZE,
  batch,
  buildMessages,
  mergeOutcomes,
  readTickets,
  type ExpoTicket,
} from './expoPush.ts';

const notification = {
  title: 'The Long Dark',
  body: 'S2E1 airs today',
  url: '/title/tmdb:tv:1',
  targetId: 'tmdb:ep:9',
};

describe('buildMessages', () => {
  it('addresses one message to each device', () => {
    const messages = buildMessages(['ExponentPushToken[a]', 'ExponentPushToken[b]'], notification);
    expect(messages.map((m) => m.to)).toEqual(['ExponentPushToken[a]', 'ExponentPushToken[b]']);
    expect(messages[0].title).toBe('The Long Dark');
    expect(messages[0].body).toBe('S2E1 airs today');
  });

  it('carries what the app needs to open the right screen', () => {
    const [message] = buildMessages(['ExponentPushToken[a]'], notification);
    expect(message.data).toEqual({ url: '/title/tmdb:tv:1', targetId: 'tmdb:ep:9' });
  });

  it('falls back to the home screen rather than to nothing', () => {
    // A notification that opens a blank screen is worse than one that opens the app.
    const [message] = buildMessages(['ExponentPushToken[a]'], { title: 'x', body: 'y' });
    expect(message.data.url).toBe('/');
  });

  it('sends nothing when nobody has a device registered', () => {
    expect(buildMessages([], notification)).toEqual([]);
  });
});

describe('batch', () => {
  it('splits into requests Expo will accept', () => {
    const messages = Array.from({ length: 250 }, (_, i) => i);
    const batches = batch(messages);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(EXPO_BATCH_SIZE);
    expect(batches[2]).toHaveLength(50);
    expect(batches.flat()).toEqual(messages);
  });

  it('does not send an empty request', () => {
    expect(batch([])).toEqual([]);
  });
});

describe('readTickets', () => {
  const ok: ExpoTicket = { status: 'ok', id: 'ticket-1' };
  const dead: ExpoTicket = {
    status: 'error',
    message: 'not registered',
    details: { error: 'DeviceNotRegistered' },
  };
  const broken: ExpoTicket = { status: 'error', message: 'message too big' };

  it('counts a delivery when any device accepted it', () => {
    const outcome = readTickets(['a', 'b'], [dead, ok]);
    expect(outcome.delivered).toBe(true);
    expect(outcome.expired).toEqual(['a']);
  });

  it('singles out tokens that will never work again', () => {
    // DeviceNotRegistered means stop, not try again. Treating it as transient is how a
    // queue fills with sends that can never succeed.
    const outcome = readTickets(['a', 'b'], [dead, dead]);
    expect(outcome.delivered).toBe(false);
    expect(outcome.expired).toEqual(['a', 'b']);
    expect(outcome.errors).toEqual([]);
  });

  it('keeps other failures as errors rather than as dead tokens', () => {
    const outcome = readTickets(['a'], [broken]);
    expect(outcome.expired).toEqual([]);
    expect(outcome.errors).toEqual(['message too big']);
  });

  it('treats a missing ticket as unaccounted for, not as success', () => {
    // Expo returns one ticket per message. If it ever does not, the honest reading is
    // that those messages did not arrive — not that they silently did.
    const outcome = readTickets(['a', 'b'], [ok]);
    expect(outcome.delivered).toBe(true);
    expect(outcome.errors).toEqual(['no ticket returned for b']);
  });

  it('reports nothing delivered when the whole response is missing', () => {
    const outcome = readTickets(['a', 'b'], []);
    expect(outcome.delivered).toBe(false);
    expect(outcome.errors).toHaveLength(2);
  });
});

describe('mergeOutcomes', () => {
  it('is delivered if any batch was', () => {
    const merged = mergeOutcomes([
      { delivered: false, expired: ['a'], errors: [] },
      { delivered: true, expired: [], errors: ['later'] },
    ]);
    expect(merged).toEqual({ delivered: true, expired: ['a'], errors: ['later'] });
  });

  it('is not delivered when there were no batches at all', () => {
    expect(mergeOutcomes([])).toEqual({ delivered: false, expired: [], errors: [] });
  });
});
