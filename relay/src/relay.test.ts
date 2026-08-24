import { describe, expect, it, vi } from 'vitest';
import {
  isValidRole,
  isValidToken,
  MIN_TOKEN_LENGTH,
  parseConnectionParams,
  Relay,
  type Peer,
  type Role,
} from './relay';

const TOKEN = 'a'.repeat(MIN_TOKEN_LENGTH);

function peer(role: Role, token = TOKEN, id = `${role}-${Math.random()}`): Peer {
  return { id, role, token, send: vi.fn(), close: vi.fn() };
}

describe('pairing', () => {
  it('forwards from app to bridge', () => {
    const relay = new Relay();
    const app = peer('app');
    const bridge = peer('bridge');
    relay.join(app);
    relay.join(bridge);

    expect(relay.forward(app, 'hello')).toBe(true);
    expect(bridge.send).toHaveBeenCalledWith('hello');
  });

  it('forwards from bridge to app', () => {
    const relay = new Relay();
    const app = peer('app');
    const bridge = peer('bridge');
    relay.join(app);
    relay.join(bridge);

    expect(relay.forward(bridge, 'playback')).toBe(true);
    expect(app.send).toHaveBeenCalledWith('playback');
  });

  it('reports failure when the other side is absent', () => {
    // The app must be able to say "your bridge is offline" rather than having the
    // message vanish.
    const relay = new Relay();
    const app = peer('app');
    relay.join(app);
    expect(relay.forward(app, 'hello')).toBe(false);
  });

  it('never crosses tokens', () => {
    // The property that matters most: one household's app must not reach another's
    // bridge.
    const relay = new Relay();
    const app = peer('app', 'a'.repeat(MIN_TOKEN_LENGTH));
    const otherBridge = peer('bridge', 'b'.repeat(MIN_TOKEN_LENGTH));
    relay.join(app);
    relay.join(otherBridge);

    expect(relay.forward(app, 'command')).toBe(false);
    expect(otherBridge.send).not.toHaveBeenCalled();
  });

  it('does not echo a message back to its sender', () => {
    const relay = new Relay();
    const app = peer('app');
    relay.join(app);
    relay.forward(app, 'hello');
    expect(app.send).not.toHaveBeenCalled();
  });
});

describe('reconnection', () => {
  it('replaces an existing peer of the same role and closes the old socket', () => {
    // Reconnecting after a drop is the common case; a stale peer would silently
    // swallow every message.
    const relay = new Relay();
    const first = peer('bridge', TOKEN, 'first');
    const second = peer('bridge', TOKEN, 'second');
    const app = peer('app');

    relay.join(app);
    relay.join(first);
    relay.join(second);

    expect(first.close).toHaveBeenCalled();
    relay.forward(app, 'x');
    expect(second.send).toHaveBeenCalledWith('x');
    expect(first.send).not.toHaveBeenCalled();
  });

  it('does not close a peer rejoining with the same id', () => {
    const relay = new Relay();
    const bridge = peer('bridge', TOKEN, 'same');
    relay.join(bridge);
    relay.join({ ...bridge, send: vi.fn(), close: vi.fn() });
    expect(bridge.close).not.toHaveBeenCalled();
  });

  it('leaving does not evict a newer peer that already took the slot', () => {
    // A late close event from the old socket must not orphan the live connection.
    const relay = new Relay();
    const app = peer('app');
    const old = peer('bridge', TOKEN, 'old');
    const fresh = peer('bridge', TOKEN, 'fresh');

    relay.join(app);
    relay.join(old);
    relay.join(fresh);
    relay.leave(old);

    expect(relay.forward(app, 'x')).toBe(true);
    expect(fresh.send).toHaveBeenCalledWith('x');
  });

  it('drops the room once both sides leave', () => {
    const relay = new Relay();
    const app = peer('app');
    const bridge = peer('bridge');
    relay.join(app);
    relay.join(bridge);
    relay.leave(app);
    relay.leave(bridge);
    expect(relay.roomCount).toBe(0);
  });

  it('keeps the room while one side remains', () => {
    const relay = new Relay();
    const app = peer('app');
    const bridge = peer('bridge');
    relay.join(app);
    relay.join(bridge);
    relay.leave(bridge);
    expect(relay.roomCount).toBe(1);
  });
});

describe('token validation', () => {
  it('accepts a long url-safe token', () => {
    expect(isValidToken(TOKEN)).toBe(true);
    expect(isValidToken('abc-DEF_123456789012345')).toBe(true);
  });

  it('rejects a short token', () => {
    // The token is the only thing between a connection and someone's living room.
    expect(isValidToken('short')).toBe(false);
  });

  it('rejects tokens with characters that could confuse routing', () => {
    expect(isValidToken(`${'a'.repeat(20)}/../x`)).toBe(false);
    expect(isValidToken(`${'a'.repeat(20)}?x=1`)).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isValidToken(null)).toBe(false);
    expect(isValidToken(12345678901234567890)).toBe(false);
  });

  it('validates roles', () => {
    expect(isValidRole('app')).toBe(true);
    expect(isValidRole('bridge')).toBe(true);
    expect(isValidRole('admin')).toBe(false);
  });
});

describe('connection parameters', () => {
  it('parses a valid connection', () => {
    expect(parseConnectionParams(`/?role=bridge&token=${TOKEN}`)).toEqual({
      role: 'bridge',
      token: TOKEN,
    });
  });

  it('rejects a missing role', () => {
    expect(parseConnectionParams(`/?token=${TOKEN}`)).toEqual({
      error: 'role must be app or bridge',
    });
  });

  it('rejects a short token with an explanatory message', () => {
    const result = parseConnectionParams('/?role=app&token=nope');
    expect(result).toMatchObject({ error: expect.stringContaining('at least') });
  });

  it('rejects an unknown role rather than defaulting', () => {
    expect(parseConnectionParams(`/?role=superuser&token=${TOKEN}`)).toMatchObject({
      error: expect.stringContaining('role'),
    });
  });
});
