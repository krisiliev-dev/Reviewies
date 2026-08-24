import type { Command, Device, Playback } from './types';

/**
 * Wire protocol between the app and the bridge.
 *
 * The bridge dials *outbound* to a relay rather than the app finding it on the LAN.
 * That inversion is what makes the whole thing work from a PWA: no mixed content
 * (the browser only ever talks HTTPS/WSS to one host), no mDNS discovery the browser
 * cannot do, no port forwarding, and it works off-network unchanged.
 */

export const PROTOCOL_VERSION = 1;

export type ClientMessage =
  | { type: 'hello'; version: number; token: string }
  | { type: 'listDevices' }
  | { type: 'command'; deviceId: string; command: Command }
  | { type: 'subscribe'; deviceId: string }
  | { type: 'unsubscribe' };

export type BridgeMessage =
  | { type: 'welcome'; version: number; bridgeName: string }
  | { type: 'devices'; devices: Device[] }
  | { type: 'playback'; deviceId: string; playback: Playback; at: number }
  | { type: 'playbackEnded'; deviceId: string; at: number }
  | { type: 'error'; message: string; code?: string };

export function isClientMessage(value: unknown): value is ClientMessage {
  if (!value || typeof value !== 'object') return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === 'hello' ||
    type === 'listDevices' ||
    type === 'command' ||
    type === 'subscribe' ||
    type === 'unsubscribe'
  );
}

/**
 * Validate a command message before it reaches an adapter.
 *
 * The bridge sits on the user's home network and can drive their television, so it
 * accepts only an explicit vocabulary. Anything unrecognised is refused rather than
 * passed through.
 */
const COMMANDS = new Set<Command>([
  'play',
  'pause',
  'playpause',
  'forward',
  'back',
  'up',
  'down',
  'left',
  'right',
  'select',
  'home',
  'volumeUp',
  'volumeDown',
  'mute',
]);

export function isValidCommand(value: unknown): value is Command {
  return typeof value === 'string' && COMMANDS.has(value as Command);
}

export function parseClientMessage(raw: string): ClientMessage | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: 'Malformed JSON' };
  }

  if (!isClientMessage(parsed)) return { error: 'Unknown message type' };

  if (parsed.type === 'command') {
    if (typeof parsed.deviceId !== 'string' || !parsed.deviceId) {
      return { error: 'Missing deviceId' };
    }
    if (!isValidCommand(parsed.command)) return { error: `Unsupported command` };
  }

  if (parsed.type === 'hello') {
    if (typeof parsed.token !== 'string' || !parsed.token) return { error: 'Missing token' };
    if (parsed.version !== PROTOCOL_VERSION) {
      return { error: `Unsupported protocol version ${String(parsed.version)}` };
    }
  }

  if (parsed.type === 'subscribe' && typeof parsed.deviceId !== 'string') {
    return { error: 'Missing deviceId' };
  }

  return parsed;
}

/**
 * Constant-time-ish token comparison.
 *
 * The pairing token is the only thing standing between a relay connection and
 * someone's television, so it should not leak its length or prefix through timing.
 */
export function tokensMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
