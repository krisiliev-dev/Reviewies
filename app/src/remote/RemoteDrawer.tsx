import { useState } from 'react';
import { bridgeConfigured, useBridge, type RemoteCommand } from './useBridge';
import { useDialog } from '../ui/useDialog';
import { color, z } from '@reviewies/core/tokens';

/**
 * The remote, hidden in a drawer to the side.
 *
 * Deliberately out of the way. Reddit was emphatic that people punish trackers for
 * feature bloat — "I don't want an app that has 100 features i won't use" — so a
 * remote control has to cost nothing in perceived complexity until it is summoned.
 * A tab on the edge, and otherwise invisible.
 */

interface ButtonSpec {
  command: RemoteCommand;
  label: string;
  glyph: string;
  wide?: boolean;
}

const TRANSPORT: ButtonSpec[] = [
  { command: 'back', label: 'Back 15 seconds', glyph: '↺' },
  { command: 'playpause', label: 'Play or pause', glyph: '⏯', wide: true },
  { command: 'forward', label: 'Forward 15 seconds', glyph: '↻' },
];

const DPAD: Array<ButtonSpec | null> = [
  null,
  { command: 'up', label: 'Up', glyph: '▲' },
  null,
  { command: 'left', label: 'Left', glyph: '◀' },
  { command: 'select', label: 'Select', glyph: '●' },
  { command: 'right', label: 'Right', glyph: '▶' },
  null,
  { command: 'down', label: 'Down', glyph: '▼' },
  null,
];

const VOLUME: ButtonSpec[] = [
  { command: 'volumeDown', label: 'Volume down', glyph: '−' },
  { command: 'mute', label: 'Mute', glyph: '🔇' },
  { command: 'volumeUp', label: 'Volume up', glyph: '+' },
];

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function RemoteDrawer() {
  const [open, setOpen] = useState(false);
  const bridge = useBridge();

  // Escape, focus in on open, focus back to the tab on close, and nothing behind it
  // reachable by Tab while it is up.
  const drawer = useDialog<HTMLElement>(open, () => setOpen(false));

  // Nothing configured means no tab at all — an inert control would be worse than
  // no control.
  if (!bridgeConfigured()) return null;

  const press = (command: RemoteCommand) => {
    bridge.send(command);
    navigator.vibrate?.(8);
  };

  return (
    <>
      {/* Mounted whether or not the drawer is open, and merely hidden while it is.
          Unmounting it destroyed the element focus was supposed to come back to: by
          the time the drawer closed there was nothing left to return focus to, so it
          fell to the body and a keyboard was dropped at the top of the page. */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open remote"
        inert={open}
        /* Was `bg-surface-2/90 text-muted backdrop-blur` — the same 1.21:1 handle the
           phone had, plus a blur. Both platforms hid the drawer's only affordance the
           same way and independently, which is the argument for one owner rather than
           two palettes that agree. Solid now, in the stroke that means something.
           Inline because the generated custom properties land in the next sprint; the
           token is the source either way, so there is no hex to find and replace. */
        style={{ backgroundColor: color.dark.strokeSignal, color: color.dark.ground, zIndex: z.drawerHandle }}
        className={`fixed top-1/2 right-0 -translate-y-1/2 rounded-l-xl py-4 pr-1 pl-1.5 transition-opacity ${
          open ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <span aria-hidden="true" className="block text-lg leading-none">
          ⇤
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        ref={drawer}
        // Always mounted so the connection is not torn down each time it closes.
        className={`safe-top safe-bottom fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto border-l border-edge bg-ink p-4 transition-transform duration-200 outline-none ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal={open}
        tabIndex={-1}
        // `inert` rather than `aria-hidden`: it was hidden from the reading order and
        // left in the tab order, so a keyboard walked into a dozen remote buttons that
        // were sitting off the right-hand edge of the screen.
        inert={!open}
        aria-label="Remote control"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Remote</h2>
          {/* Named, because Watching Mode has a "Close" of its own. */}
          <button
            onClick={() => setOpen(false)}
            aria-label="Close remote"
            className="text-sm text-muted"
          >
            Close
          </button>
        </div>

        <Status bridge={bridge} />

        {bridge.devices.length > 0 && (
          <label className="flex flex-col gap-1 text-xs text-muted">
            Device
            <select
              value={bridge.selected?.id ?? ''}
              onChange={(e) => bridge.select(e.target.value)}
              className="rounded-lg bg-surface px-2.5 py-2 text-base text-white outline-none"
            >
              <option value="">Choose…</option>
              {bridge.devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {bridge.playback && (
          <div className="rounded-xl bg-surface p-3">
            {bridge.playback.title && (
              <p className="truncate text-sm font-medium">{bridge.playback.title}</p>
            )}
            <p className="font-mono text-xs tabular-nums text-muted">
              {formatTime(bridge.playback.positionSec)}
              {bridge.playback.durationSec
                ? ` / ${formatTime(bridge.playback.durationSec)}`
                : ''}
              {bridge.playback.paused ? ' · paused' : ''}
            </p>
          </div>
        )}

        <fieldset disabled={!bridge.selected} className="flex flex-col gap-4 disabled:opacity-40">
          <div className="grid grid-cols-4 gap-2">
            {TRANSPORT.map((b) => (
              <Key key={b.command} spec={b} onPress={press} />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {DPAD.map((b, i) =>
              b ? <Key key={b.command} spec={b} onPress={press} /> : <div key={`gap-${i}`} />,
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {VOLUME.map((b) => (
              <Key key={b.command} spec={b} onPress={press} />
            ))}
          </div>

          <button
            onClick={() => press('home')}
            className="rounded-xl bg-surface-2 py-2.5 text-sm text-muted"
          >
            Home
          </button>
        </fieldset>

        {bridge.error && <p className="text-xs text-accent">{bridge.error}</p>}
      </aside>
    </>
  );
}

function Key({ spec, onPress }: { spec: ButtonSpec; onPress: (c: RemoteCommand) => void }) {
  return (
    <button
      onClick={() => onPress(spec.command)}
      aria-label={spec.label}
      // Exactly one aspect utility: emitting both `aspect-square` and `aspect-auto`
      // leaves the winner to stylesheet order rather than intent.
      className={`flex items-center justify-center rounded-xl bg-surface text-xl active:scale-90 ${
        spec.wide ? 'col-span-2' : 'aspect-square'
      }`}
    >
      <span aria-hidden="true">{spec.glyph}</span>
    </button>
  );
}

function Status({ bridge }: { bridge: ReturnType<typeof useBridge> }) {
  if (bridge.status === 'connected' && bridge.devices.length === 0) {
    return (
      <div className="rounded-xl bg-surface p-3 text-xs text-muted">
        <p>Bridge connected, but no devices found.</p>
        <button onClick={bridge.refresh} className="mt-2 text-accent">
          Scan again
        </button>
      </div>
    );
  }

  if (bridge.status !== 'connected') {
    return (
      <p className="rounded-xl bg-surface p-3 text-xs text-muted">
        {bridge.status === 'connecting'
          ? 'Connecting to your bridge…'
          : 'Bridge offline. It will reconnect on its own.'}
      </p>
    );
  }

  return null;
}
