import { useCallback, useEffect, useRef, useState } from 'react';
import * as Network from 'expo-network';
import {
  createDirectRokuAdapter,
  discoverRokus,
} from '@reviewies/core/devices/direct';
import { subnetHosts } from '@reviewies/core/devices/scan';
import { scanFailure } from './scanFailure';
import type { Command, Device, Playback } from '@reviewies/core/devices/types';
import { readPreference, writePreference } from '@reviewies/core/data/storage';

/**
 * The remote, talking to the television directly.
 *
 * No bridge and no relay: those existed only because a web page cannot reach a LAN
 * address. This sends the request itself.
 *
 * The last device used is remembered, because the common case by a wide margin is the
 * same television every evening, and making someone scan the network before they can
 * press pause would make the feature not worth opening.
 */
const LAST_DEVICE = 'reviewies.remote.device';

export interface Remote {
  devices: Device[];
  device?: Device;
  playback?: Playback;
  scanning: boolean;
  progress: number;
  error?: string;
  scan: () => Promise<void>;
  select: (device: Device) => void;
  send: (command: Command) => Promise<void>;
}

export function useRemote(): Remote {
  const [devices, setDevices] = useState<Device[]>([]);
  const [device, setDevice] = useState<Device>();
  const [playback, setPlayback] = useState<Playback>();
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  const adapter = useRef(createDirectRokuAdapter()).current;

  // Restore the last device without touching the network, so the remote is usable
  // the instant it opens.
  useEffect(() => {
    const saved = readPreference(LAST_DEVICE);
    if (!saved) return;
    try {
      const restored = JSON.parse(saved) as Device;
      setDevice(restored);
      setDevices([restored]);
    } catch {
      // A malformed value is not worth surfacing; scanning replaces it.
    }
  }, []);

  const scan = useCallback(async () => {
    setScanning(true);
    setError(undefined);
    setProgress(0);
    try {
      const state = await Network.getNetworkStateAsync();
      if (!state.isConnected) {
        setError('Not on a network.');
        return;
      }

      const localAddress = await Network.getIpAddressAsync();
      // Counted here rather than inferred from the result, so the screen can tell an
      // empty subnet from an empty answer. `discoverRokus` computes the same list.
      const hostCount = subnetHosts(localAddress).length;
      const found = await discoverRokus({
        localAddress,
        onProgress: (done, total) => setProgress(done / total),
      });

      setDevices(found);
      if (found.length === 0) {
        setError(scanFailure(localAddress, hostCount));
      } else if (!device) {
        setDevice(found[0]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  }, [device]);

  const select = useCallback((next: Device) => {
    setDevice(next);
    writePreference(LAST_DEVICE, JSON.stringify(next));
  }, []);

  const send = useCallback(
    async (command: Command) => {
      if (!device) return;
      setError(undefined);
      try {
        await adapter.send(device, command);
        // Read the position back straight after: it is how the drift correction in
        // Watching Mode gets a real number instead of a guess.
        setPlayback(await adapter.getPlayback(device));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The TV did not respond.');
      }
    },
    [adapter, device],
  );

  return { devices, device, playback, scanning, progress, error, scan, select, send };
}
