import { describe, expect, it, vi } from 'vitest';
import {
  commandToKey,
  parseDeviceName,
  parseMediaPlayer,
  parseSsdpLocations,
  RokuAdapter,
  type RokuTransport,
} from './roku.ts';
import type { Device } from './types.ts';

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

