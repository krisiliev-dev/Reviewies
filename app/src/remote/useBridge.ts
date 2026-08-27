import { useCallback, useEffect, useRef, useState } from 'react';
import { getConfig } from '@reviewies/core/config';
import { relayConnectionUrl } from '@reviewies/core/devices/relayUrl';
import type { Command } from '@reviewies/core/devices/types';

/**
 * Client half of the bridge connection.
 *
 * The app talks WSS to a relay; the bridge dials the same relay outbound. Neither
 * side needs to find the other on a network, which is what makes this work from a
 * PWA at all — no mixed content, no mDNS, no port forwarding.
 *
 * Everything here degrades to "no remote available" rather than erroring. The remote
 * is an enhancement; a missing bridge must never interfere with tracking.
 */

/**
 * The core's `Command`, not a second copy of it.
 *
 * This union was written out here character for character alongside the one in
 * `core/src/devices/types.ts` — the same list, maintained twice, with nothing checking
 * that they still agreed. Re-exported under the old name so the drawer's imports keep
 * reading naturally.
 */
export type RemoteCommand = Command;

export interface RemoteDevice {
  id: string;
  adapter: string;
  name: string;
  address: string;
}

export interface RemotePlayback {
  positionSec: number;
  durationSec?: number;
  paused: boolean;
  title?: string;
  source?: string;
}

export type BridgeStatus = 'unconfigured' | 'connecting' | 'connected' | 'disconnected';

const PROTOCOL_VERSION = 1;
const RECONNECT_MS = 5000;

export interface BridgeConnection {
  status: BridgeStatus;
  devices: RemoteDevice[];
  selected?: RemoteDevice;
  playback?: RemotePlayback;
  error?: string;
  select: (deviceId: string) => void;
  send: (command: RemoteCommand) => void;
  refresh: () => void;
}

function config(): { url: string; token: string } | undefined {
  const { bridgeRelay: url, bridgeToken: token } = getConfig();
  if (!url || !token) return undefined;
  return { url, token };
}

export function bridgeConfigured(): boolean {
  return config() !== undefined;
}

export function useBridge(): BridgeConnection {
  const [status, setStatus] = useState<BridgeStatus>(
    bridgeConfigured() ? 'connecting' : 'unconfigured',
  );
  const [devices, setDevices] = useState<RemoteDevice[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [playback, setPlayback] = useState<RemotePlayback>();
  const [error, setError] = useState<string>();

  const socketRef = useRef<WebSocket>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout>>(null);

  const send = useCallback((message: unknown) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }, []);

  useEffect(() => {
    const settings = config();
    if (!settings) return;

    let closed = false;

    const connect = () => {
      if (closed) return;
      setStatus('connecting');

      // The relay reads the role and token off the query string and closes anything
      // without them. This used to dial `settings.url` bare and then send a `hello`
      // carrying the token, which the relay never read because the socket was already
      // shut. §6.43.
      //
      // A misspelt `VITE_BRIDGE_RELAY` throws here rather than at connect time — `new
      // URL` is strict — and a bad environment variable must say so on the screen, not
      // take the app down through the error boundary.
      let address: string;
      try {
        address = relayConnectionUrl(settings.url, 'app', settings.token);
      } catch {
        setStatus('disconnected');
        setError(`Cannot dial "${settings.url}" — it is not a valid relay address.`);
        return;
      }

      const socket = new WebSocket(address);
      socketRef.current = socket;

      socket.onopen = () => {
        setStatus('connected');
        setError(undefined);
        socket.send(
          JSON.stringify({ type: 'hello', version: PROTOCOL_VERSION, token: settings.token }),
        );
        socket.send(JSON.stringify({ type: 'listDevices' }));
      };

      socket.onmessage = (event) => {
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return; // Ignore anything unparseable rather than tearing down the socket.
        }

        switch (message.type) {
          case 'devices':
            setDevices((message.devices as RemoteDevice[]) ?? []);
            return;
          case 'playback':
            setPlayback(message.playback as RemotePlayback);
            return;
          case 'playbackEnded':
            setPlayback(undefined);
            return;
          case 'error':
            setError(String(message.message ?? 'Bridge error'));
            return;
        }
      };

      socket.onclose = (event) => {
        socketRef.current = null;
        if (closed) return;
        setStatus('disconnected');
        // Say why, when the relay says why. A refused connection closes with 1008 and a
        // reason — "role must be app or bridge" is the one this app spent its whole life
        // getting — and throwing that away left the drawer showing "disconnected" and
        // retrying every few seconds forever with nothing to act on. 1000 and 1001 are
        // ordinary closes and have nothing to report. §6.43.
        if (event.code !== 1000 && event.code !== 1001) {
          setError(event.reason || `Relay closed the connection (${event.code})`);
        }
        // The bridge is meant to run unattended, so reconnect rather than giving up.
        retryRef.current = setTimeout(connect, RECONNECT_MS);
      };

      socket.onerror = () => {
        /* onclose fires next and handles the retry. */
      };
    };

    connect();

    return () => {
      closed = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  // Subscribing tells the bridge to start polling that device for position.
  useEffect(() => {
    if (!selectedId || status !== 'connected') return;
    send({ type: 'subscribe', deviceId: selectedId });
    return () => send({ type: 'unsubscribe' });
  }, [selectedId, status, send]);

  return {
    status,
    devices,
    selected: devices.find((d) => d.id === selectedId),
    playback,
    error,
    select: setSelectedId,
    send: useCallback(
      (command: RemoteCommand) => {
        if (!selectedId) return;
        send({ type: 'command', deviceId: selectedId, command });
      },
      [selectedId, send],
    ),
    refresh: useCallback(() => send({ type: 'listDevices' }), [send]),
  };
}
