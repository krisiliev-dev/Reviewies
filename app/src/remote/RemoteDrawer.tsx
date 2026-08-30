import { useState } from 'react';
import { bridgeConfigured, useBridge, type RemoteCommand } from './useBridge';
import { useDialog } from '../ui/useDialog';
import { DPAD, HOME, TRANSPORT, VOLUME } from '@reviewies/core/ui/key';
import { Key } from '../ui/Key';
import { Data } from '../ui/Data';
import { Chevron } from '../ui/Mark';
import { Note } from '../ui/Note';

/**
 * The remote, hidden in a drawer to the side.
 *
 * Deliberately out of the way. Reddit was emphatic that people punish trackers for
 * feature bloat — "I don't want an app that has 100 features i won't use" — so a
 * remote control has to cost nothing in perceived complexity until it is summoned.
 * A tab on the edge, and otherwise invisible.
 */

/*
 * The fascia used to be three arrays right here, and the phone had three of its own. They
 * disagreed: Back-15 was `↺` on the web and `⏪ 15s` on the phone, Select was `●` here and
 * `OK` there, and one press of skip moved fifteen seconds on the phone and whatever a
 * single `Fwd` does here. `core/src/ui/key.ts` is the table now.
 */

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

  // The repeat count comes from the fascia table. Skip sent one press here and three on
  // the phone, so the same key moved a different distance depending on which screen you
  // pressed it from — nobody decided that either.
  const press = (command: RemoteCommand, repeat = 1) => {
    for (let i = 0; i < repeat; i++) bridge.send(command);
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
        /* Was `bg-ground-well/90 text-ink-secondary backdrop-blur` — the same 1.21:1 handle the
           phone had, plus a blur. Both platforms hid the drawer's only affordance the
           same way and independently, which is the argument for one owner rather than
           two palettes that agree. Solid now, in the stroke that means something.
           Reading generated utilities rather than inline hexes since the generator
           landed; the stacking order stays a custom property because Tailwind has no
           namespace for one. */
        style={{ zIndex: 'var(--z-drawer-handle)' }}
        className={`fixed top-1/2 right-0 -translate-y-1/2 rounded-l-none bg-stroke-signal py-4 pr-1 pl-1.5 text-ground transition-opacity ${
          open ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {/* Left, the way the panel arrives. It was `⇤` here and `⌇` on the phone — an
            arrow against a drag grip, for a drawer that opens on a tap. §6.144. */}
        <Chevron points="left" className="block text-s20" />
      </button>

      {open && (
        <div
          style={{ zIndex: 'var(--z-drawer-scrim)' }}
          className="fixed inset-0 bg-black/40"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        ref={drawer}
        // Always mounted so the connection is not torn down each time it closes.
        style={{ zIndex: 'var(--z-drawer)' }}
        className={`safe-top safe-bottom fixed inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto border-l border-stroke-hairline bg-ground p-4 transition-transform duration-200 outline-none ${
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
          <h2 className="text-s16 font-title font-semibold">Remote</h2>
          {/* Named, because Watching Mode has a "Close" of its own. */}
          <button
            onClick={() => setOpen(false)}
            aria-label="Close remote"
            className="text-s14 text-ink-secondary"
          >
            Close
          </button>
        </div>

        <Status bridge={bridge} />

        {bridge.devices.length > 0 && (
          <label className="flex flex-col gap-1 text-s12 text-ink-secondary">
            Device
            <select
              value={bridge.selected?.id ?? ''}
              onChange={(e) => bridge.select(e.target.value)}
              /*
                Not a `Field` — a `select` is a different control — but it had the same two
                defects. `outline-none` removed the focus ring at the one control in the
                drawer a keyboard reaches, and `text-white` is a colour the palette does not
                contain: pure white against every ink in the table, on a screen whose whole
                argument is that it is printed matter rather than a lit rectangle.
              */
              className="rounded-none bg-ground-raised px-3 py-2 text-s16 text-ink"
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
          <div className="-mx-s16 border-b border-b-stroke-hairline px-s16 py-s12">
            {bridge.playback.title && (
              <p className="truncate text-s14 font-title font-semibold">{bridge.playback.title}</p>
            )}
            {/*
              Two timecodes and a state, as three things rather than one string.
              `font-data` on the whole line was the last hand-written use of the face, and
              keeping it would have meant a written exemption in the guard — which is the
              §6.59 shape, an excuse that outlives what it excuses. Written out, each
              timecode is a figure and `paused` is a word, which is what they are.
            */}
            <Note level="footnote">
              <Data value={formatTime(bridge.playback.positionSec)} size="s12" />
              {bridge.playback.durationSec ? (
                <>
                  {' / '}
                  <Data value={formatTime(bridge.playback.durationSec)} size="s12" />
                </>
              ) : null}
              {bridge.playback.paused ? ' · paused' : ''}
            </Note>
          </div>
        )}

        {/* Each key carries its own disabled state rather than a `fieldset` at 40% opacity
            over the lot. The fade was the one `appearance.test.ts` bans, and it was doing
            the work of telling somebody there is no television yet. */}
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-2">
            {TRANSPORT.map((spec) => (
              <Key key={spec.command} spec={spec} disabled={!bridge.selected} onPress={press} />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {DPAD.map((spec, i) =>
              spec ? (
                <Key key={spec.command} spec={spec} disabled={!bridge.selected} onPress={press} />
              ) : (
                <div key={`gap-${i}`} />
              ),
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {VOLUME.map((spec) => (
              <Key key={spec.command} spec={spec} disabled={!bridge.selected} onPress={press} />
            ))}
          </div>

          <Key spec={HOME} disabled={!bridge.selected} onPress={press} />
        </div>

      </aside>
    </>
  );
}

/**
 * What the drawer says about its connection — in **one** place, in one register.
 *
 * The panel used to say it twice. This block, at the top, read `bridge.status` and said
 * *"Bridge offline. It will reconnect on its own."* in secondary ink; and nine hundred
 * points below, under thirteen keys, `{bridge.error && ...}` printed the raw transport
 * error in `trouble` red. Both conditions hold at once, and `dark-11-remote.png` — the
 * first photograph this drawer has ever had, because `bridgeConfigured()` gated it out of
 * every design pass — shows exactly that: *"It will reconnect on its own"* at the top and
 * *"Relay closed the connection (1006)"* in red at the bottom. §6.104's shape: the screen
 * telling you it is fine and telling you it is not.
 *
 * The calm sentence is the one somebody decided and it is the true headline — this
 * connection does retry. The error is not deleted, because a person whose bridge will not
 * come up has this one screen to work it out on, and *"relay closed the connection"* and
 * *"could not reach the relay"* point at different halves of their network. It is a
 * footnote under the sentence it qualifies, in the ink of the state it is part of.
 *
 * What is **not** decided here, and is said in §6.170 rather than papered over: a relay
 * that rejects a token will not reconnect on its own, and this component cannot tell that
 * apart from a relay that is merely down. The headline is optimistic in a case it cannot
 * currently detect.
 */
function Status({ bridge }: { bridge: ReturnType<typeof useBridge> }) {
  if (bridge.status === 'connected' && bridge.devices.length === 0) {
    return (
      <div className="rounded-plate bg-ground-raised p-3 text-s12 text-ink-secondary">
        <p>Bridge connected, but no devices found.</p>
        <button onClick={bridge.refresh} className="mt-2 text-ink">
          Scan again
        </button>
      </div>
    );
  }

  if (bridge.status !== 'connected') {
    return (
      <div className="rounded-plate bg-ground-raised p-3 text-s12 text-ink-secondary">
        <p>
          {bridge.status === 'connecting'
            ? 'Connecting to your bridge…'
            : 'Bridge offline. It will reconnect on its own.'}
        </p>
        {/* The detail, under the sentence it belongs to rather than under the keys. */}
        {bridge.error && <p className="mt-1 text-ink-tertiary">{bridge.error}</p>}
      </div>
    );
  }

  return null;
}
