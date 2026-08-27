import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import {
  getPreference,
  getUpcoming,
  groupByDay,
  KIND_LABEL,
  NOTIFY_OPTIONS,
  notificationsSupported,
  requestPermission,
  setPreference,
  type NotifyPreference,
  type UpcomingEntry,
} from '@reviewies/core/calendar/upcoming';
import { requestRefresh } from '@reviewies/core/calendar/refresh';
import { Poster } from '../ui/Poster';
import { disablePush, enablePush, pushSupported, syncPreference, vapidPublicKey } from '../calendar/push';
import { COPY } from '@reviewies/core/copy';
import { formatDay } from '@reviewies/core/time';

export function Calendar() {
  const entries = useLiveQuery(() => getUpcoming(), [], undefined);

  // Opening the calendar is the one moment somebody definitely wants it current. The
  // refresh is throttled in the core, so arriving here repeatedly costs nothing, and
  // the live query picks up whatever it writes without this screen waiting on it.
  useEffect(() => void requestRefresh(), []);
  // Lazy, like the phone's: the initial value is only wanted on the first render, and
  // calling it on every one reads the stored preference for nothing.
  const [preference, setPref] = useState<NotifyPreference>(getPreference);
  const [permission, setPermissionState] = useState<NotificationPermission | undefined>(
    typeof Notification !== 'undefined' ? Notification.permission : undefined,
  );

  const [pushNote, setPushNote] = useState<string>();
  const [syncNote, setSyncNote] = useState<string>();

  async function choose(next: NotifyPreference) {
    setPref(next);
    setPreference(next);
    // Mirror the choice server-side so it can filter before spending a send, and say so
    // when that fails: `void` here meant a setting that looked saved and was not. §6.66.
    const mirrored = await syncPreference(next);
    setSyncNote(mirrored.ok ? undefined : mirrored.reason);

    if (next === 'off') {
      await disablePush();
      setPushNote(undefined);
      return;
    }

    setPermissionState(await requestPermission());

    // Only attempt a real subscription when push is actually configured; without
    // a VAPID key this build can still show the calendar.
    if (vapidPublicKey() && pushSupported()) {
      const result = await enablePush();
      setPushNote(result.ok ? undefined : result.reason);
    }
  }

  const grouped = entries ? groupByDay(entries) : [];

  return (
    <div className="p-4">
      <h1 className="mb-4 px-1 text-2xl font-semibold">Upcoming</h1>

      <section className="mb-6 rounded-plate bg-ground-raised p-4">
        <h2 className="mb-2 text-sm font-semibold">Tell me about</h2>
        <div role="radiogroup" aria-label="Tell me about" className="flex flex-wrap gap-1.5">
          {NOTIFY_OPTIONS.map((p) => (
            <button
              key={p.key}
              onClick={() => choose(p.key)}
              role="radio"
              aria-checked={preference === p.key}
              className={`rounded-plate px-3 py-1.5 text-xs ${
                preference === p.key ? 'bg-action-fill text-action-label' : 'bg-ground-well text-ink-secondary'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-secondary">
          {NOTIFY_OPTIONS.find((p) => p.key === preference)?.hint}
        </p>

        {preference !== 'off' && !notificationsSupported() && (
          <p className="mt-2 text-xs text-trouble">
            This browser cannot show notifications. The calendar below still works.
          </p>
        )}
        {pushNote && <p className="mt-2 text-xs text-ink-secondary">{pushNote}</p>}
        {syncNote && (
          <p className="mt-2 text-xs text-ink-secondary" role="status">
            {syncNote}
          </p>
        )}
        {preference !== 'off' && !vapidPublicKey() && (
          <p className="mt-2 text-xs text-ink-secondary">
            Push delivery is not configured on this build, so alerts will not arrive.
            The calendar below still works.
          </p>
        )}
        {preference !== 'off' && permission === 'denied' && (
          <p className="mt-2 text-xs text-trouble">
            Notifications are blocked in browser settings.
          </p>
        )}
        {preference !== 'off' && permission === 'default' && (
          // On iOS the Push API only exists once installed to the Home Screen —
          // a Safari tab can never grant this.
          <p className="mt-2 text-xs text-ink-secondary">
            On iPhone, add Reviewies to your Home Screen first — Safari tabs cannot receive
            notifications.
          </p>
        )}
      </section>

      {entries === undefined && <p className="px-1 text-ink-secondary">Loading…</p>}
      {entries?.length === 0 && (
        <div className="flex flex-col items-start gap-3 px-1">
          {/* Doc 10 §8: this said nothing was on and stopped, with Discover a tap away.
              A screen whose job is "what shall I watch" should not be a dead end — and
              the phone's version of this sentence already said what to do about it, so
              this is the phone's copy rather than a third one. */}
          <p className="text-ink-secondary">{COPY.calendar.empty}</p>
          <Link
            to="/discover"
            className="rounded-pill border border-stroke-signal px-4 py-2 text-sm"
          >
            {COPY.calendar.findSomething}
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-5">
        {grouped.map(([day, dayEntries]) => (
          <section key={day}>
            <h2 className="mb-2 px-1 text-sm font-semibold tracking-wide text-ink-secondary uppercase">
              {formatDay(day)}
            </h2>
            <ul className="flex flex-col gap-1.5">
              {dayEntries.map((entry) => (
                <Row key={entry.episode.id} entry={entry} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function Row({ entry }: { entry: UpcomingEntry }) {
  const label = KIND_LABEL[entry.kind];

  return (
    <li className="flex items-center gap-3 rounded-plate bg-ground-raised p-3">
      <Link
        to={`/title/${encodeURIComponent(entry.seriesId)}`}
        aria-label={`Open ${entry.seriesName}`}
        className="shrink-0"
      >
        <Poster url={entry.posterUrl} name={entry.seriesName} className="h-16 w-11 rounded-plate" />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{entry.seriesName}</p>
        <p className="truncate text-xs text-ink-secondary">
          S{entry.episode.season}E{entry.episode.number} · {entry.episode.name}
        </p>
      </div>
      {label && (
        <span className="shrink-0 rounded-plate bg-ground-well px-2 py-1 text-[0.625rem] font-semibold text-ink-secondary">
          {label}
        </span>
      )}
    </li>
  );
}

