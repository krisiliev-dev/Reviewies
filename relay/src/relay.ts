/**
 * Pairing logic for the bridge relay.
 *
 * The relay is deliberately dumb: it pairs an app session with a bridge by shared
 * token and forwards bytes. It never inspects commands, never stores state, and holds
 * nothing that would be worth stealing.
 *
 * Kept separate from the server so the pairing rules — which is where a mistake would
 * let a stranger drive someone's television — can be tested without sockets.
 */

export type Role = 'app' | 'bridge';

export interface Peer {
  id: string;
  role: Role;
  token: string;
  send(data: string): void;
  close(reason?: string): void;
}

/** One token's pair. At most one of each role: a second replaces the first. */
interface Room {
  app?: Peer;
  bridge?: Peer;
}

export class Relay {
  private rooms = new Map<string, Room>();

  /**
   * Attach a peer to its token's room.
   *
   * A new connection for a role that is already occupied replaces the old one, and
   * the old socket is closed. Reconnecting after a dropped connection is the common
   * case, and leaving a stale peer would silently swallow every message.
   */
  join(peer: Peer): void {
    const room = this.rooms.get(peer.token) ?? {};
    const existing = room[peer.role];

    if (existing && existing.id !== peer.id) {
      existing.close('replaced by a newer connection');
    }

    room[peer.role] = peer;
    this.rooms.set(peer.token, room);
  }

  leave(peer: Peer): void {
    const room = this.rooms.get(peer.token);
    if (!room) return;

    // Only clear the slot if it is still this peer; a reconnect may already have
    // taken it, and clearing then would orphan the live connection.
    if (room[peer.role]?.id === peer.id) delete room[peer.role];
    if (!room.app && !room.bridge) this.rooms.delete(peer.token);
  }

  /** The peer on the other side of this token, if connected. */
  counterpart(peer: Peer): Peer | undefined {
    const room = this.rooms.get(peer.token);
    if (!room) return undefined;
    return peer.role === 'app' ? room.bridge : room.app;
  }

  /**
   * Forward a message to the counterpart.
   *
   * Returns whether it was delivered, so the sender can be told the other side is
   * absent rather than assuming a silent success.
   */
  forward(from: Peer, data: string): boolean {
    const to = this.counterpart(from);
    if (!to) return false;
    to.send(data);
    return true;
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  peersFor(token: string): Room | undefined {
    return this.rooms.get(token);
  }
}

/**
 * Tokens must be long enough that guessing is hopeless — the token is the only thing
 * standing between a relay connection and someone's living room.
 */
export const MIN_TOKEN_LENGTH = 20;

export function isValidToken(token: unknown): token is string {
  return typeof token === 'string' && token.length >= MIN_TOKEN_LENGTH && /^[\w-]+$/.test(token);
}

export function isValidRole(role: unknown): role is Role {
  return role === 'app' || role === 'bridge';
}

/** Parse the query string of an incoming connection. */
export function parseConnectionParams(
  url: string,
): { role: Role; token: string } | { error: string } {
  let params: URLSearchParams;
  try {
    params = new URL(url, 'ws://relay.local').searchParams;
  } catch {
    return { error: 'Malformed URL' };
  }

  const role = params.get('role');
  const token = params.get('token');

  if (!isValidRole(role)) return { error: 'role must be app or bridge' };
  if (!isValidToken(token)) {
    return { error: `token must be at least ${MIN_TOKEN_LENGTH} url-safe characters` };
  }

  return { role, token };
}
