/**
 * The bridge's device abstraction.
 *
 * Universal device control is not achievable through one protocol — Matter Casting
 * was the only vendor-neutral candidate and Apple and Google both declined it. Every
 * universal remote is a pile of per-vendor adapters behind one UI, and so is this.
 *
 * What makes that tolerable is confining the mess here: the app only ever sees
 * listDevices, sendCommand and getPosition. Adding a device type is one new adapter
 * shipped in the bridge, with no app change.
 */

export type Command =
  | 'play'
  | 'pause'
  | 'playpause'
  | 'forward'
  | 'back'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'select'
  | 'home'
  | 'volumeUp'
  | 'volumeDown'
  | 'mute';

export interface Device {
  /** Stable within a bridge run; `adapter:address`. */
  id: string;
  adapter: string;
  name: string;
  address: string;
}

export interface Playback {
  /** Seconds into the media. */
  positionSec: number;
  durationSec?: number;
  paused: boolean;
  title?: string;
  /** Which app or player reported this, when known. */
  source?: string;
}

export interface DeviceAdapter {
  readonly name: string;
  /** Find devices this adapter can drive. Must not throw on an empty network. */
  discover(signal?: AbortSignal): Promise<Device[]>;
  send(device: Device, command: Command, signal?: AbortSignal): Promise<void>;
  /**
   * Current playback, when the device reports it.
   *
   * Control and position are separate problems: a device can accept commands while
   * telling us nothing about what is playing. Netflix inside a smart-TV app is the
   * common case. Returning undefined is normal, not an error.
   */
  getPlayback(device: Device, signal?: AbortSignal): Promise<Playback | undefined>;
}

export class DeviceError extends Error {
  readonly device: string;
  constructor(device: string, message: string) {
    super(message);
    this.name = 'DeviceError';
    this.device = device;
  }
}
