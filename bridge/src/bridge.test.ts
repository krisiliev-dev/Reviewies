import { describe, expect, it, vi } from 'vitest';
import {
  commandToKey,
  parseDeviceName,
  parseMediaPlayer,
  parseSsdpLocations,
  RokuAdapter,
  type RokuTransport,
} from './roku';
import { isVideoLike, MprisAdapter, playerName, toPlayback, type MprisTransport } from './mpris';
import { parseClientMessage, PROTOCOL_VERSION, tokensMatch, isValidCommand } from './protocol';
import type { Device } from './types';

// ---------------------------------------------------------------------------
// Roku
// ---------------------------------------------------------------------------

const PLAYING = `<?xml version="1.0"?>
<player error="false" state="play">
  <plugin bandwidth="10000 kbps" id="12" name="Netflix" />
  <format audio="aac" captions="none" container="hls" video="mpeg4_10b" />
  <position>754000 ms</position>
  <duration>3000000 ms</duration>
  <title>The Long Dark</title>
</player>`;

describe('Roku media player parsing', () => {
  it('reads position, duration and title', () => {
    const playback = parseMediaPlayer(PLAYING);
    expect(playback?.positionSec).toBe(754);
    expect(playback?.durationSec).toBe(3000);
    expect(playback?.title).toBe('The Long Dark');
    expect(playback?.source).toBe('Netflix');
    expect(playback?.paused).toBe(false);
  });

  it('treats a paused player as paused', () => {
    expect(parseMediaPlayer(PLAYING.replace('state="play"', 'state="pause"'))?.paused).toBe(true);
  });

  it('treats buffering as not playing', () => {
    // Buffering is not playback; syncing a clock to it would drift.
    expect(parseMediaPlayer(PLAYING.replace('state="play"', 'state="buffer"'))?.paused).toBe(true);
  });

  it('returns nothing when nothing is playing', () => {
    expect(parseMediaPlayer('<player error="false" state="close" />')).toBeUndefined();
  });

  it('returns nothing when there is no position, even if playing', () => {
    // Control without position is the common case with streaming apps.
    expect(parseMediaPlayer('<player state="play"><title>x</title></player>')).toBeUndefined();
  });

  it('survives unexpected XML rather than throwing', () => {
    expect(parseMediaPlayer('not xml at all')).toBeUndefined();
    expect(parseMediaPlayer('')).toBeUndefined();
  });
});

describe('Roku device info parsing', () => {
  it('prefers the friendly name', () => {
    const xml =
      '<device-info><friendly-device-name>Living Room TV</friendly-device-name><model-name>Roku Ultra</model-name></device-info>';
    expect(parseDeviceName(xml)).toBe('Living Room TV');
  });

  it('falls back to the model name', () => {
    expect(parseDeviceName('<device-info><model-name>Roku Ultra</model-name></device-info>')).toBe(
      'Roku Ultra',
    );
  });

  it('returns nothing when no name is present', () => {
    expect(parseDeviceName('<device-info/>')).toBeUndefined();
  });
});

describe('SSDP discovery parsing', () => {
  const response = (ip: string) =>
    `HTTP/1.1 200 OK\r\nCache-Control: max-age=3600\r\nLOCATION: http://${ip}:8060/\r\nST: roku:ecp\r\n`;

  it('extracts host addresses', () => {
    expect(parseSsdpLocations([response('192.168.1.7')])).toEqual(['192.168.1.7']);
  });

  it('deduplicates devices that answer twice', () => {
    // SSDP is UDP multicast; duplicate replies are normal.
    expect(parseSsdpLocations([response('192.168.1.7'), response('192.168.1.7')])).toHaveLength(1);
  });

  it('skips malformed LOCATION headers without losing good ones', () => {
    expect(parseSsdpLocations(['LOCATION: not-a-url', response('10.0.0.5')])).toEqual(['10.0.0.5']);
  });

  it('returns nothing for an empty network', () => {
    expect(parseSsdpLocations([])).toEqual([]);
  });
});

describe('Roku adapter', () => {
  const device: Device = { id: 'roku:1.2.3.4', adapter: 'roku', name: 'TV', address: '1.2.3.4' };

  function transport(over: Partial<RokuTransport> = {}): RokuTransport {
    return {
      get: vi.fn(async () => PLAYING),
      post: vi.fn(async () => {}),
      discover: vi.fn(async () => []),
      ...over,
    };
  }

  it('sends the right ECP key', async () => {
    const t = transport();
    await new RokuAdapter(t).send(device, 'forward');
    expect(t.post).toHaveBeenCalledWith('http://1.2.3.4:8060/keypress/Fwd', undefined);
  });

  it('maps pause onto Play, since ECP has no separate pause', () => {
    expect(commandToKey('pause')).toBe('Play');
    expect(commandToKey('playpause')).toBe('Play');
  });

  it('reports a failed send as a device error rather than a raw network error', async () => {
    const t = transport({
      post: vi.fn(async () => {
        throw new Error('EHOSTUNREACH');
      }),
    });
    await expect(new RokuAdapter(t).send(device, 'play')).rejects.toThrow(/EHOSTUNREACH/);
  });

  it('returns no playback when the device is unreachable', async () => {
    const t = transport({
      get: vi.fn(async () => {
        throw new Error('offline');
      }),
    });
    // A device that vanished mid-poll is normal, not an error.
    expect(await new RokuAdapter(t).getPlayback(device)).toBeUndefined();
  });

  it('returns an empty device list when discovery fails', async () => {
    const t = transport({
      discover: vi.fn(async () => {
        throw new Error('no multicast');
      }),
    });
    expect(await new RokuAdapter(t).discover()).toEqual([]);
  });

  it('skips hosts that answered SSDP but are not reachable Rokus', async () => {
    const t = transport({
      discover: vi.fn(async () => ['LOCATION: http://9.9.9.9:8060/']),
      get: vi.fn(async () => {
        throw new Error('not a roku');
      }),
    });
    expect(await new RokuAdapter(t).discover()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// MPRIS
// ---------------------------------------------------------------------------

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
