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
import { unmatchedImportCount } from '@reviewies/core/data/repo';
import { Poster } from '../ui/Poster';
import { disablePush, enablePush, pushSupported, syncPreference, vapidPublicKey } from '../calendar/push';
import { COPY } from '@reviewies/core/copy';
import { formatDay } from '@reviewies/core/time';
import { Choice } from '../ui/Choice';
import { Row as BaseRow } from '../ui/Row';
import { Section } from '../ui/Section';

export function Calendar() {
  const entries = useLiveQuery(() => getUpcoming(), [], undefined);
  // Why the screen is empty, not only that it is. An imported show has no air dates
  // until matching gives it a provider ID.
  const unmatched = useLiveQuery(() => unmatchedImportCount(), [], undefined);

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
      <h1 className="mb-4 px-1 text-s24 font-title font-semibold">Upcoming</h1>

      <section className="mb-6 rounded-plate bg-ground-raised p-4">
        {/* The eyebrow, at the step §6.108 chose for it on Stats: uppercase with
            letter-spacing reads a size larger than its number, and the phone has drawn
            this heading at 12 since it was written while the web drew it at 14 in
            sentence case. One treatment, on both. */}
        <Section>Tell me about</Section>
        {/* Rows, and every hint visible, which is what the phone did and the web did not:
            the web showed one hint in a paragraph underneath, so choosing between three
            options meant selecting each in turn to read what it does. §6.51's rule is
            that the better version wins regardless of which platform had it. */}
        <Choice<NotifyPreference>
          name="Tell me about"
          density="rows"
          value={preference}
          options={NOTIFY_OPTIONS}
          onChange={choose}
        />

        {preference !== 'off' && !notificationsSupported() && (
          <p className="mt-2 text-s12 text-trouble">
            This browser cannot show notifications. The calendar below still works.
          </p>
        )}
        {pushNote && <p className="mt-2 text-s12 text-ink-secondary">{pushNote}</p>}
        {syncNote && (
          <p className="mt-2 text-s12 text-ink-secondary" role="status">
            {syncNote}
          </p>
        )}
        {preference !== 'off' && !vapidPublicKey() && (
          <p className="mt-2 text-s12 text-ink-secondary">
            Push delivery is not configured on this build, so alerts will not arrive.
            The calendar below still works.
          </p>
        )}
        {preference !== 'off' && permission === 'denied' && (
          <p className="mt-2 text-s12 text-trouble">
            Notifications are blocked in browser settings.
          </p>
        )}
        {preference !== 'off' && permission === 'default' && (
          // On iOS the Push API only exists once installed to the Home Screen —
          // a Safari tab can never grant this.
          <p className="mt-2 text-s12 text-ink-secondary">
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
              this is the phone's copy rather than a third one.

              And which sentence it is depends on *why* it is empty. An imported show has
              no air dates until matching gives it a provider ID, so somebody who has just
              brought in eleven shows was being told to track one. */}
          {/* It had no size and inherited 16; the phone's `blurb` is 14. */}
          <p className="text-s14 text-ink-secondary">
            {unmatched ? COPY.calendar.emptyUnmatched(unmatched) : COPY.calendar.empty}
          </p>
          <Link
            to="/discover"
            className="rounded-pill border border-stroke-signal px-4 py-2 text-s14"
          >
            {COPY.calendar.findSomething}
          </Link>
        </div>
      )}

      {/*
        The section the day headings sit inside, which only the phone had.
        Sixty days on both platforms; the phone said so above the list and the web did
        not, so the web's day headings opened onto nothing. §6.51's rule — the better
        version wins whichever platform had it — and it is also what makes `group` below
        mean something rather than being a second treatment of the same depth.
      */}
      <Section className="px-1">Next two months</Section>

      <div className="flex flex-col gap-5">
        {grouped.map(([day, dayEntries]) => (
          <section key={day}>
            {/* `group`, not `section`: this sits *inside* "Next two months" and the phone
                drew the two identically — the same five properties in the same file. task #156. */}
            <Section level="group" className="px-1">
              {formatDay(day)}
            </Section>
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

/**
 * One row, one target, one name that says which episode.
 *
 * The poster was its own link and the words were not a link at all, both under
 * `Open {name}` — so the episode code and name were announced twice or not at all, on the
 * one screen where every row is a different episode of a show you may already be watching.
 * Doc 6 §5 named this row specifically; §6.96's collision clause is what stopped it being
 * possible to write the next one the same way.
 */
function Row({ entry }: { entry: UpcomingEntry }) {
  const code = `S${entry.episode.season}E${entry.episode.number}`;
  return (
    <BaseRow
      title={entry.seriesName}
      code={code}
      meta={entry.episode.name}
      tag={KIND_LABEL[entry.kind]}
      open={{
        name: `Open ${entry.seriesName}, ${code}, ${entry.episode.name}`,
        to: `/title/${encodeURIComponent(entry.seriesId)}`,
      }}
      lead={
        <Poster
          url={entry.posterUrl}
          name={entry.seriesName}
          className="h-16 w-11 shrink-0 rounded-plate"
        />
      }
    />
  );
}

