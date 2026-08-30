import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { Chevron } from '../src/ui/Mark';
import {
  getPreference,
  getUpcoming,
  groupByDay,
  runsOf,
  KIND_LABEL,
  NOTIFY_OPTIONS,
  type NotifyPreference,
  type UpcomingEntry,
  type UpcomingRun,
} from '@reviewies/core/calendar/upcoming';
import { requestRefresh } from '@reviewies/core/calendar/refresh';
import { unmatchedImportCount } from '@reviewies/core/data/repo';
import { Poster } from '../src/ui/Poster';
import { theme } from '../src/ui/theme';
import { SCREEN } from '@reviewies/core/ui/screen';
import {
  pushSupported,
  registerForPush,
  syncPreference,
  unregisterFromPush,
  whyNotSupported,
} from '../src/notifications';
import { COPY } from '@reviewies/core/copy';
import { formatDay } from '@reviewies/core/time';
import { Button } from '../src/ui/Button';
import { Row } from '../src/ui/Row';
import { Section } from '../src/ui/Section';

import { Choice } from '../src/ui/Choice';
import { Note } from '../src/ui/Note';
import { SETTINGS_OPEN } from '@reviewies/core/ui/compose';
import { episodeName, runCode } from '@reviewies/core/ui/episode';

/**
 * What is coming, and how much you want to hear about it.
 *
 * Notification granularity was the top request on Trakt's roadmap, and milestones is
 * the default because "every episode of everything" is what makes people turn
 * notifications off entirely — after which the feature may as well not exist. The
 * three options and their wording live in the core now (§6.51) — both screens had
 * their own copy of the list and all three hints had drifted apart.
 */
export default function CalendarScreen() {
  const [entries, setEntries] = useState<UpcomingEntry[]>();
  const [preference, setPref] = useState<NotifyPreference>(getPreference);
  const [delivery, setDelivery] = useState<string>();
  const [syncNote, setSyncNote] = useState<string>();
  const [registered, setRegistered] = useState(false);
  // Revealed, not resident: `core/src/ui/compose.ts` and §6.134.
  const [tuning, setTuning] = useState(SETTINGS_OPEN);
  // Why the screen is empty, not only that it is.
  const [unmatched, setUnmatched] = useState(0);

  useEffect(() => {
    void getUpcoming().then(setEntries);
    void unmatchedImportCount().then(setUnmatched);
    // Opening the calendar is the one moment somebody definitely wants it current.
    // Throttled in the core, so arriving here repeatedly costs nothing; the list is
    // re-read after, because nothing on this platform is watching the table.
    void requestRefresh().then((report) => {
      if (report?.refreshed) void getUpcoming().then(setEntries);
    });
  }, []);

  const days = groupByDay(entries ?? []);

  return (
    <>
      <Stack.Screen options={{ title: 'Upcoming' }} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Closed, this whole panel is one row that says what the setting currently is —
            three options with a sub-line each, a delivery block and up to four notes used
            to stand open above the calendar on a screen called *Upcoming*. §6.129's rule,
            on a setting rather than a form. §6.134. */}
        {!tuning ? (
          <Row
            density="index"
            title={COPY.calendar.tellMeAbout}
            meta={NOTIFY_OPTIONS.find((o) => o.key === preference)?.label}
            open={{
              name: `${COPY.calendar.tellMeAbout} — ${
                NOTIFY_OPTIONS.find((o) => o.key === preference)?.label ?? ''
              }`,
              // `run` and no `to`: it opens the panel it names, in place, so both
              // platforms call it a button. This used to need a `does: 'act'` flag that
              // only the phone read — the phone announced the row as a link without it,
              // and the smoke suite's `getByRole('button', …)` found nothing, which is how
              // it was noticed (§6.134). #170 deleted the flag; the union says it now.
              run: () => setTuning(true),
            }}
            trailing={<Chevron points="right" color={theme.inkSecondary} size={16} />}
          />
        ) : (
          <>
        <Section>{COPY.calendar.tellMeAbout}</Section>
        {/* This control is where `Choice` came from. It was the only one of five that
            said `radiogroup`/`radio` and put the hint in the announced name; the other
            four were buttons carrying a `selected` flag. The component is this one,
            generalised, and the reasoning below travelled with it. */}
        <Choice<(typeof NOTIFY_OPTIONS)[number]['key']>
          name={COPY.calendar.tellMeAbout}
          density="rows"
          value={preference}
          options={NOTIFY_OPTIONS}
          onChange={async (key) => {
            setPref(key);
            // Mirrored to the server, which filters before sending — a stale setting
            // there would cost a delivery, or send one nobody asked for. Bound rather
            // than fired and forgotten: a mirror that failed used to be silent on both
            // platforms. §6.66.
            const mirrored = await syncPreference(key);
            setSyncNote(mirrored.ok ? undefined : mirrored.reason);
            if (key === 'off') void unregisterFromPush();
          }}
        />

        {syncNote && (
          <Note level="footnote" accessibilityLiveRegion="polite">
            {syncNote}
          </Note>
        )}

        {/* Choosing a granularity used to be the whole of it: the phone offered the
            same three options as the web and had nothing that could ever act on them,
            which is worse than offering none. This is where that stops being true. */}
        {preference !== 'off' && (
          <View style={styles.delivery}>
            {pushSupported() ? (
              <>
                <Button
                  label={registered ? 'Notifications on' : 'Notify this device'}
                  // It had `aria-selected={}` and no name at all, so a
                  // reader got the state and the printed words and nothing saying which
                  // device. `selected` is drawn as well as announced now.
                  name={
                    registered
                      ? 'Notifications are on for this device'
                      : 'Notify this device about what is airing'
                  }
                  selected={registered}
                  onPress={async () => {
                    const result = await registerForPush();
                    setRegistered(result.ok);
                    setDelivery(result.ok ? 'This device will be notified.' : result.reason);
                  }}
                />
                {delivery && <Note level="footnote">{delivery}</Note>}
              </>
            ) : (
              // Said plainly rather than left as a control that does nothing. The
              // reason differs — a simulator, the web build, a build with no project
              // id — and each sends someone looking in a different place.
              <Note level="footnote">
                Nothing can be delivered to this device yet. {whyNotSupported()} Your
                choice above is saved and will apply once it can.
              </Note>
            )}
          </View>
        )}

            <Button
              onPress={() => setTuning(false)}
              label={COPY.controls.done}
              name={`${COPY.controls.done} — close ${COPY.calendar.tellMeAbout.toLowerCase()}`}
            />
          </>
        )}

        {/* Sixty days on both platforms now — it was thirty here and sixty on the
            web, the same screen showing a different amount of the future. */}
        <View style={styles.spaced}>
          <Section>Next two months</Section>
        </View>
        {entries === undefined && <ActivityIndicator color={theme.workingMark} />}
        {entries?.length === 0 && (
          <View style={styles.emptyBlock}>
            {/* Which sentence depends on *why* it is empty: an imported show has no air
                dates until matching gives it a provider ID, so somebody who has just
                brought in eleven shows was being told to track one. */}
            <Note>
              {unmatched ? COPY.calendar.emptyUnmatched(unmatched) : COPY.calendar.empty}
            </Note>
            {/* Doc 10 §8 said this of the web's copy: a screen whose job is "what is on"
                should not answer "nothing" and stop, with Discover one tap away. The web
                got the button; the phone, whose sentence the web borrowed, did not. */}
            <Button
              to="/discover"
              tone="primary"
              size="page"
              label={COPY.calendar.findSomething}
              name={COPY.calendar.findSomething}
            />
          </View>
        )}

        {days.map(([day, list]) => (
          <View key={day} style={styles.day}>
            {/* "Today" / "Tomorrow" / "Friday", the same words the web uses — this
                printed the raw `2026-08-26` and left you to work out which day that
                was. §6.66. */}
            {/* `group`: this sits inside "Next two months", and the two styles were
                byte-identical before `Section` had to give them different values. task #156. */}
            <Section level="group">{formatDay(day)}</Section>
            {runsOf(list).map((run) => (
              /* Doc 6 §5 named this row as the one that still got the naming wrong: the
                 whole entry was a single `Pressable` labelled `Open {name}`, so the
                 episode code and the episode name were announced twice or not at all —
                 and on a screen where every row is a different episode of a show you may
                 already be watching, the code is the part that tells them apart.

                 Artwork stays, as the web's copy has had since Calendar shipped: a list
                 of upcoming episodes with no posters is a list of sentences, and
                 recognising a show by its artwork is most of what these screens are
                 for. §6.63.

                 One row per *run*, not per episode: a season that drops at once is one
                 event. §6.149. */
              <CalendarRow key={run.episodes[0].id} run={run} />
            ))}
          </View>
        ))}
      </ScrollView>
    </>
  );
}

/** One run — a single episode, or a whole season landing at once. §6.149. */
function CalendarRow({ run }: { run: UpcomingRun }) {
  const first = run.episodes[0];
  const code = runCode(first.season, run.episodes.map((e) => e.number));
  // A run has no single name, and a count is what the row is about. One episode keeps the
  // name it always had.
  const named =
    run.episodes.length > 1
      ? `${run.episodes.length} episodes`
      : episodeName(first.name, first.number);
  return (
    <Row
      title={run.seriesName}
      code={code}
      meta={named}
      tag={KIND_LABEL[run.kind]}
      lead={<Poster url={run.posterUrl} name={run.seriesName} />}
      open={{
        name: [`Open ${run.seriesName}`, code, named].filter(Boolean).join(', '),
        to: `/title/${encodeURIComponent(run.seriesId)}`,
      }}
    />
  );
}

const styles = StyleSheet.create({
  // The same chevron `more.tsx` draws on its destination rows: this row goes somewhere
  // in the same sense — it opens the panel it names. The web's copy had one from the
  // start and this did not, which is the drift a pair of screenshots catches.
  delivery: { marginTop: 12, gap: 8 },
  // 13 against the web's 12, for the same six status lines under the same control.
  // 13 is one of the two the scale killed.
  content: { padding: SCREEN.edge, gap: 8, backgroundColor: theme.ground, flexGrow: 1, paddingBottom: 48 },
  spaced: { marginTop: 20 },
  emptyBlock: { gap: 16, alignItems: 'flex-start' },

  day: { gap: 6, marginTop: 8 },
  // The same eyebrow as every other section heading in the app, which this was not:
  // the web drew the day as uppercase 14/600 with letter-spacing and the phone drew
  // it as plain 12 — the same role, two entirely different treatments.
});
