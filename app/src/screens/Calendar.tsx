import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import {
  getPreference,
  getUpcoming,
  groupByDay,
  KIND_LABEL,
  notificationsSupported,
  requestPermission,
  setPreference,
  type NotifyPreference,
  type UpcomingEntry,
} from '@reviewies/core/calendar/upcoming';
import { Poster } from '../ui/Poster';
import { disablePush, enablePush, pushSupported, syncPreference, vapidPublicKey } from '../calendar/push';

const PREFS: Array<{ key: NotifyPreference; label: string; hint: string }> = [
  { key: 'off', label: 'Nothing', hint: 'No alerts at all.' },
  {
    key: 'milestones',
    label: 'Premieres & finales',
    hint: 'The moments worth knowing about, without a ping per episode.',
  },
  { key: 'all', label: 'Every episode', hint: 'One alert for everything you track.' },
];

export function Calendar() {
  const entries = useLiveQuery(() => getUpcoming(60), [], undefined);
  const [preference, setPref] = useState<NotifyPreference>(getPreference());
  const [permission, setPermissionState] = useState<NotificationPermission | undefined>(
    typeof Notification !== 'undefined' ? Notification.permission : undefined,
  );

  const [pushNote, setPushNote] = useState<string>();

  async function choose(next: NotifyPreference) {
    setPref(next);
    setPreference(next);
    // Mirror the choice server-side so it can filter before spending a send.
    void syncPreference(next);

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

      <section className="mb-6 rounded-2xl bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold">Tell me about</h2>
        <div className="flex flex-wrap gap-1.5">
          {PREFS.map((p) => (
            <button
              key={p.key}
              onClick={() => choose(p.key)}
              className={`rounded-full px-3 py-1.5 text-xs ${
                preference === p.key ? 'bg-accent text-ink' : 'bg-surface-2 text-muted'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          {PREFS.find((p) => p.key === preference)?.hint}
        </p>

        {preference !== 'off' && !notificationsSupported() && (
          <p className="mt-2 text-xs text-accent">
            This browser cannot show notifications. The calendar below still works.
          </p>
        )}
        {pushNote && <p className="mt-2 text-xs text-accent">{pushNote}</p>}
        {preference !== 'off' && !vapidPublicKey() && (
          <p className="mt-2 text-xs text-muted">
            Push delivery is not configured on this build, so alerts will not arrive.
            The calendar below still works.
          </p>
        )}
        {preference !== 'off' && permission === 'denied' && (
          <p className="mt-2 text-xs text-accent">
            Notifications are blocked in browser settings.
          </p>
        )}
        {preference !== 'off' && permission === 'default' && (
          // On iOS the Push API only exists once installed to the Home Screen —
          // a Safari tab can never grant this.
          <p className="mt-2 text-xs text-muted">
            On iPhone, add Reviewies to your Home Screen first — Safari tabs cannot receive
            notifications.
          </p>
        )}
      </section>

      {entries === undefined && <p className="px-1 text-muted">Loading…</p>}
      {entries?.length === 0 && (
        <p className="px-1 text-muted">
          Nothing airing in the next two months from the shows you are watching.
        </p>
      )}

      <div className="flex flex-col gap-5">
        {grouped.map(([day, dayEntries]) => (
          <section key={day}>
            <h2 className="mb-2 px-1 text-sm font-semibold tracking-wide text-muted uppercase">
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
    <li className="flex items-center gap-3 rounded-xl bg-surface p-2.5">
      <Link to={`/title/${encodeURIComponent(entry.seriesId)}`} className="shrink-0">
        <Poster url={entry.posterUrl} name={entry.seriesName} className="h-16 w-11 rounded-md" />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{entry.seriesName}</p>
        <p className="truncate text-xs text-muted">
          S{entry.episode.season}E{entry.episode.number} · {entry.episode.name}
        </p>
      </div>
      {label && (
        <span className="shrink-0 rounded-full bg-accent/20 px-2 py-1 text-[10px] font-semibold text-accent">
          {label}
        </span>
      )}
    </li>
  );
}

function formatDay(day: string): string {
  const date = new Date(`${day}T00:00:00`);
  const today = new Date();
  const diffDays = Math.round((date.getTime() - today.setHours(0, 0, 0, 0)) / 86_400_000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
