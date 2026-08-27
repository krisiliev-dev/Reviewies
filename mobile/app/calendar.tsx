import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import {
  getPreference,
  getUpcoming,
  groupByDay,
  KIND_LABEL,
  NOTIFY_OPTIONS,
  type NotifyPreference,
  type UpcomingEntry,
} from '@reviewies/core/calendar/upcoming';
import { requestRefresh } from '@reviewies/core/calendar/refresh';
import { Poster } from '../src/ui/Poster';
import { radius, theme } from '../src/ui/theme';
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
import { ROW } from '@reviewies/core/ui/row';
import { Choice } from '../src/ui/Choice';

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
  const router = useRouter();

  useEffect(() => {
    void getUpcoming().then(setEntries);
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
        <Text style={styles.sectionHeading} accessibilityRole="header">
          Tell me about
        </Text>
        {/* This control is where `Choice` came from. It was the only one of five that
            said `radiogroup`/`radio` and put the hint in the announced name; the other
            four were buttons carrying a `selected` flag. The component is this one,
            generalised, and the reasoning below travelled with it. */}
        <Choice<(typeof NOTIFY_OPTIONS)[number]['key']>
          name="Tell me about"
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
          <Text style={styles.deliveryNote} accessibilityLiveRegion="polite">
            {syncNote}
          </Text>
        )}

        {/* Choosing a granularity used to be the whole of it: the phone offered the
            same three options as the web and had nothing that could ever act on them,
            which is worse than offering none. This is where that stops being true. */}
        {preference !== 'off' && (
          <View style={styles.delivery}>
            {pushSupported() ? (
              <>
                <Pressable
                  onPress={async () => {
                    const result = await registerForPush();
                    setRegistered(result.ok);
                    setDelivery(
                      result.ok
                        ? 'This device will be notified.'
                        : result.reason,
                    );
                  }}
                  style={[styles.enable, registered && styles.enableOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: registered }}
                >
                  <Text style={[styles.enableText, registered && styles.enableTextOn]}>
                    {registered ? 'Notifications on' : 'Notify this device'}
                  </Text>
                </Pressable>
                {delivery && <Text style={styles.deliveryNote}>{delivery}</Text>}
              </>
            ) : (
              // Said plainly rather than left as a control that does nothing. The
              // reason differs — a simulator, the web build, a build with no project
              // id — and each sends someone looking in a different place.
              <Text style={styles.deliveryNote}>
                Nothing can be delivered to this device yet. {whyNotSupported()} Your
                choice above is saved and will apply once it can.
              </Text>
            )}
          </View>
        )}

        {/* Sixty days on both platforms now — it was thirty here and sixty on the
            web, the same screen showing a different amount of the future. */}
        <Text style={[styles.sectionHeading, styles.spaced]}>Next two months</Text>
        {entries === undefined && <ActivityIndicator color={theme.workingFill} />}
        {entries?.length === 0 && (
          <View style={styles.emptyBlock}>
            <Text style={styles.blurb}>{COPY.calendar.empty}</Text>
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
            <Text style={styles.dayHeading}>{formatDay(day)}</Text>
            {list.map((entry) => (
              /* Doc 6 §5 named this row as the one that still got the naming wrong: the
                 whole entry was a single `Pressable` labelled `Open {name}`, so the
                 episode code and the episode name were announced twice or not at all —
                 and on a screen where every row is a different episode of a show you may
                 already be watching, the code is the part that tells them apart.

                 Artwork stays, as the web's copy has had since Calendar shipped: a list
                 of upcoming episodes with no posters is a list of sentences, and
                 recognising a show by its artwork is most of what these screens are
                 for. §6.63. */
              <Row
                key={entry.episode.id}
                title={entry.seriesName}
                code={`S${entry.episode.season}E${entry.episode.number}`}
                meta={entry.episode.name}
                tag={KIND_LABEL[entry.kind]}
                lead={
                  <Poster
                    url={entry.posterUrl}
                    name={entry.seriesName}
                    width={ROW.lead.width}
                    height={ROW.lead.height}
                  />
                }
                open={{
                  name: `Open ${entry.seriesName}, S${entry.episode.season}E${entry.episode.number}, ${entry.episode.name}`,
                  run: () => router.push(`/title/${encodeURIComponent(entry.seriesId)}`),
                }}
              />
            ))}
          </View>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  delivery: { marginTop: 12, gap: 8 },
  enable: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: theme.groundRaised,
  },
  enableOn: { backgroundColor: theme.actionFill },
  enableText: { color: theme.ink, fontSize: 14 },
  enableTextOn: { color: theme.actionLabel, fontWeight: '600' },
  deliveryNote: { color: theme.inkSecondary, fontSize: 13, lineHeight: 19 },
  content: { padding: 16, gap: 8, backgroundColor: theme.ground, flexGrow: 1, paddingBottom: 48 },
  sectionHeading: {
    color: theme.inkSecondary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  spaced: { marginTop: 20 },
  emptyBlock: { gap: 16, alignItems: 'flex-start' },
  blurb: { color: theme.inkSecondary, fontSize: 14, lineHeight: 20 },


  day: { gap: 6, marginTop: 8 },
  dayHeading: { color: theme.inkSecondary, fontSize: 12 },
});
