import { describe, expect, it, vi } from 'vitest';
import { isVideoLike, MprisAdapter, playerName, toPlayback, type MprisTransport } from './mpris.ts';
import { parseClientMessage, PROTOCOL_VERSION, tokensMatch, isValidCommand } from './protocol.ts';
import type { Device } from '@reviewies/core/devices/types';

describe('MPRIS', () => {
  const player = {
    busName: 'org.mpris.MediaPlayer2.vlc',
    identity: 'VLC media player',
    status: 'Playing',
    positionUs: 754_000_000,
    metadata: { 'xesam:title': 'The Long Dark', 'mpris:length': 3_000_000_000 },
  };

  it('converts microseconds to seconds', () => {
    const playback = toPlayback(player);
    expect(playback?.positionSec).toBe(754);
    expect(playback?.durationSec).toBe(3000);
  });

  it('reads title and player name', () => {
    expect(toPlayback(player)?.title).toBe('The Long Dark');
    expect(toPlayback(player)?.source).toBe('VLC media player');
  });

  it('treats anything but Playing as paused', () => {
    expect(toPlayback({ ...player, status: 'Paused' })?.paused).toBe(true);
    expect(toPlayback({ ...player, status: 'Stopped' })?.paused).toBe(true);
  });

  it('returns nothing without a position', () => {
    expect(toPlayback({ ...player, positionUs: undefined })).toBeUndefined();
  });

  it('derives a name from the bus name when identity is missing', () => {
    expect(playerName({ busName: 'org.mpris.MediaPlayer2.mpv' })).toBe('Mpv');
  });

  it('filters out music players by duration', () => {
    // Syncing Watching Mode to a track change would be worse than not syncing.
    // 3.5 minutes is a song; 50 minutes is an episode.
    expect(isVideoLike({ busName: 'x', metadata: { 'mpris:length': 210_000_000 } })).toBe(false);
    expect(isVideoLike({ busName: 'x', metadata: { 'mpris:length': 3_000_000_000 } })).toBe(true);
  });

  it('rejects even a long song, which a two-minute bar would have allowed', () => {
    // An eight-minute prog track still is not television.
    expect(isVideoLike({ busName: 'x', metadata: { 'mpris:length': 480_000_000 } })).toBe(false);
  });

  it('accepts a short-form episode', () => {
    // A 22-minute comedy must still qualify.
    expect(isVideoLike({ busName: 'x', metadata: { 'mpris:length': 1_320_000_000 } })).toBe(true);
  });

  it('keeps players of unknown length', () => {
    expect(isVideoLike({ busName: 'x' })).toBe(true);
  });

  it('seeks rather than pressing a key for skip commands', async () => {
    const seek = vi.fn(async () => {});
    const transport: MprisTransport = {
      listPlayers: async () => [],
      read: async () => undefined,
      call: vi.fn(async () => {}),
      seek,
    };
    const device: Device = { id: 'mpris:x', adapter: 'mpris', name: 'VLC', address: 'x' };

    await new MprisAdapter(transport).send(device, 'forward');
    expect(seek).toHaveBeenCalledWith('x', 15_000_000);
    await new MprisAdapter(transport).send(device, 'back');
    expect(seek).toHaveBeenCalledWith('x', -15_000_000);
  });

  it('ignores commands with no MPRIS equivalent instead of erroring', async () => {
    const call = vi.fn(async () => {});
    const transport: MprisTransport = {
      listPlayers: async () => [],
      read: async () => undefined,
      call,
      seek: async () => {},
    };
    const device: Device = { id: 'mpris:x', adapter: 'mpris', name: 'VLC', address: 'x' };

    // The remote UI is shared across adapters; an inapplicable button should do
    // nothing rather than raise an error dialog.
    await expect(new MprisAdapter(transport).send(device, 'volumeUp')).resolves.toBeUndefined();
    expect(call).not.toHaveBeenCalled();
  });

  it('returns no devices when D-Bus is unavailable', async () => {
    const transport: MprisTransport = {
      listPlayers: async () => {
        throw new Error('no dbus');
      },
      read: async () => undefined,
      call: async () => {},
      seek: async () => {},
    };
    expect(await new MprisAdapter(transport).discover()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Protocol
// ---------------------------------------------------------------------------

describe('protocol validation', () => {
  it('accepts a well-formed command', () => {
    const msg = parseClientMessage(
      JSON.stringify({ type: 'command', deviceId: 'roku:1.2.3.4', command: 'play' }),
    );
    expect(msg).toMatchObject({ type: 'command', command: 'play' });
  });

  it('rejects an unknown command', () => {
    // The bridge can drive someone's television, so the vocabulary is explicit.
    expect(
      parseClientMessage(JSON.stringify({ type: 'command', deviceId: 'x', command: 'factoryReset' })),
    ).toEqual({ error: 'Unsupported command' });
  });

  it('rejects a command with no device', () => {
    expect(
      parseClientMessage(JSON.stringify({ type: 'command', command: 'play' })),
    ).toEqual({ error: 'Missing deviceId' });
  });

  it('rejects malformed JSON', () => {
    expect(parseClientMessage('{oh no')).toEqual({ error: 'Malformed JSON' });
  });

  it('rejects an unknown message type', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'runShellCommand' }))).toEqual({
      error: 'Unknown message type',
    });
  });

  it('rejects a hello without a token', () => {
    expect(
      parseClientMessage(JSON.stringify({ type: 'hello', version: PROTOCOL_VERSION })),
    ).toEqual({ error: 'Missing token' });
  });

  it('rejects a mismatched protocol version', () => {
    const result = parseClientMessage(JSON.stringify({ type: 'hello', version: 99, token: 't' }));
    expect(result).toMatchObject({ error: expect.stringContaining('Unsupported protocol version') });
  });

  it('validates the command vocabulary directly', () => {
    expect(isValidCommand('mute')).toBe(true);
    expect(isValidCommand('rm -rf')).toBe(false);
    expect(isValidCommand(42)).toBe(false);
  });
});

describe('token comparison', () => {
  it('matches identical tokens', () => {
    expect(tokensMatch('abc123', 'abc123')).toBe(true);
  });

  it('rejects different tokens of equal length', () => {
    expect(tokensMatch('abc123', 'abc124')).toBe(false);
  });

  it('rejects tokens of different lengths', () => {
    expect(tokensMatch('abc', 'abcd')).toBe(false);
  });

  it('rejects an empty token against a real one', () => {
    expect(tokensMatch('', 'secret')).toBe(false);
  });
});
