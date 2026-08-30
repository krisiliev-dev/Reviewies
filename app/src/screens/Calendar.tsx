import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  getPreference,
  getUpcoming,
  groupByDay,
  runsOf,
  KIND_LABEL,
  NOTIFY_OPTIONS,
  notificationsSupported,
  requestPermission,
  setPreference,
  type NotifyPreference,
  type UpcomingRun,
} from '@reviewies/core/calendar/upcoming';
import { requestRefresh } from '@reviewies/core/calendar/refresh';
import { unmatchedImportCount } from '@reviewies/core/data/repo';
import { Poster } from '../ui/Poster';
import { disablePush, enablePush, pushSupported, syncPreference, vapidPublicKey } from '../calendar/push';
import { COPY } from '@reviewies/core/copy';
import { formatDay } from '@reviewies/core/time';
import { Choice } from '../ui/Choice';
import { Row as BaseRow } from '../ui/Row';
import { Chevron } from '../ui/Mark';
import { Section } from '../ui/Section';
import { Note } from '../ui/Note';
import { Masthead } from '../ui/Masthead';
import { Button } from '../ui/Button';
import { SETTINGS_OPEN } from '@reviewies/core/ui/compose';
import { episodeName, runCode } from '@reviewies/core/ui/episode';

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
  // Revealed, not resident: `core/src/ui/compose.ts` and §6.134.
  const [tuning, setTuning] = useState(SETTINGS_OPEN);

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
    <div className="p-s16">
      <Masthead level="page" className="px-1">Upcoming</Masthead>

      {/* Closed, this whole panel is one row that says what the setting currently is.
          
          It used to stand open on arrival — three options with a sub-line each, a
          paragraph about the iPhone Home Screen and up to four conditional notes, 470
          points of a 900-point screen called *Upcoming*, above the thing you came for.
          §6.129's rule, on a setting rather than a form. §6.134. */}
      {!tuning ? (
        <ul className="mb-6">
          <BaseRow
            density="index"
            title={COPY.calendar.tellMeAbout}
            meta={NOTIFY_OPTIONS.find((o) => o.key === preference)?.label}
            open={{
              name: `${COPY.calendar.tellMeAbout} — ${
                NOTIFY_OPTIONS.find((o) => o.key === preference)?.label ?? ''
              }`,
              run: () => setTuning(true),
            }}
            trailing={
              <Chevron points="right" className="ml-2 text-s16 text-ink-secondary" />
            }
          />
        </ul>
      ) : (
      <section className="mb-6 rounded-plate bg-ground-raised p-4">
        {/* The eyebrow, at the step §6.108 chose for it on Stats: uppercase with
            letter-spacing reads a size larger than its number, and the phone has drawn
            this heading at 12 since it was written while the web drew it at 14 in
            sentence case. One treatment, on both. */}
        <Section>{COPY.calendar.tellMeAbout}</Section>
        {/* Rows, and every hint visible, which is what the phone did and the web did not:
            the web showed one hint in a paragraph underneath, so choosing between three
            options meant selecting each in turn to read what it does. §6.51's rule is
            that the better version wins regardless of which platform had it. */}
        <Choice<NotifyPreference>
          name={COPY.calendar.tellMeAbout}
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
        {pushNote && <Note level="footnote" className="mt-2">{pushNote}</Note>}
        {syncNote && (
          <Note level="footnote" className="mt-2" role="status">
            {syncNote}
          </Note>
        )}
        {preference !== 'off' && !vapidPublicKey() && (
          <Note level="footnote" className="mt-2">
            Push delivery is not configured on this build, so alerts will not arrive.
            The calendar below still works.
          </Note>
        )}
        {preference !== 'off' && permission === 'denied' && (
          <p className="mt-2 text-s12 text-trouble">
            Notifications are blocked in browser settings.
          </p>
        )}
        {preference !== 'off' && permission === 'default' && (
          // On iOS the Push API only exists once installed to the Home Screen —
          // a Safari tab can never grant this.
          <Note level="footnote" className="mt-2">
            On iPhone, add Reviewies to your Home Screen first — Safari tabs cannot receive
            notifications.
          </Note>
        )}
        <div className="mt-3">
          <Button
            onPress={() => setTuning(false)}
            label={COPY.controls.done}
            name={`${COPY.controls.done} — close ${COPY.calendar.tellMeAbout.toLowerCase()}`}
          />
        </div>
      </section>
      )}

      {entries === undefined && <Note className="px-1">Loading…</Note>}
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
          <Note>
            {unmatched ? COPY.calendar.emptyUnmatched(unmatched) : COPY.calendar.empty}
          </Note>
          <Button
            to="/discover"
            label={COPY.calendar.findSomething}
            name={COPY.calendar.findSomething}
          />
        </div>
      )}

      {/*
        The section the day headings sit inside, which only the phone had.
        Sixty days on both platforms; the phone said so above the list and the web did
        not, so the web's day headings opened onto nothing. §6.51's rule — the better
        version wins whichever platform had it — and it is also what makes `group` below
        mean something rather than being a second treatment of the same depth.
      */}
      <Section className="px-1">{COPY.calendar.horizon}</Section>

      <div className="flex flex-col gap-5">
        {grouped.map(([day, dayEntries]) => (
          <section key={day}>
            {/* `group`, not `section`: this sits *inside* "Next two months" and the phone
                drew the two identically — the same five properties in the same file. task #156. */}
            <Section level="group" className="px-1">
              {formatDay(day)}
            </Section>
            <ul className="flex flex-col gap-1.5">
              {runsOf(dayEntries).map((run) => (
                <Row key={run.episodes[0].id} run={run} />
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
function Row({ run }: { run: UpcomingRun }) {
  const first = run.episodes[0];
  const code = runCode(first.season, run.episodes.map((e) => e.number));
  // A run has no single name, and a count is what the row is about. One episode keeps the
  // name it always had.
  const named =
    run.episodes.length > 1
      ? `${run.episodes.length} episodes`
      : episodeName(first.name, first.number);
  return (
    <BaseRow
      title={run.seriesName}
      code={code}
      meta={named}
      tag={KIND_LABEL[run.kind]}
      open={{
        name: [`Open ${run.seriesName}`, code, named].filter(Boolean).join(', '),
        to: `/title/${encodeURIComponent(run.seriesId)}`,
      }}
      lead={
        <Poster
          url={run.posterUrl}
          name={run.seriesName}
         
        />
      }
    />
  );
}

