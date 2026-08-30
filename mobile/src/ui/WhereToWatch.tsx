import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { getProvidersCached } from '@reviewies/core/metadata/index';
import { Attribution } from './Attribution';
import { getRegion, REGIONS, regionName, setRegion } from '@reviewies/core/metadata/region';
import type { CachedProviders } from '@reviewies/core/domain/types';
import { REACH, leadingOf, radius, tap, theme } from './theme';
import { COPY } from '@reviewies/core/copy';
import { text, type, leading } from '@reviewies/core/tokens';
import { Section } from './Section';
import { Note } from './Note';
import { Choice } from './Choice';

/**
 * Where a title can be watched right now.
 *
 * Item 3 on doc 4's MVP list, and the reason people open a tracker at all when they
 * have decided *what* to watch but not *how*. It belongs on a phone more than anywhere:
 * "can I watch this tonight" is asked standing in front of a television, holding the
 * thing that can answer it. The web has had this since it shipped and the phone had
 * nothing, which the parity audit found and this closes.
 *
 * The country picker is not a nicety. Availability differs completely between
 * countries, so a section that silently answered for the United States would be
 * confidently wrong for most of the world.
 *
 * Attribution to JustWatch is a licence condition of TMDB's availability data, not a
 * courtesy, so it renders whenever any availability does.
 */
export function WhereToWatch({ titleId }: { titleId: string }) {
  const [region, setRegionState] = useState(getRegion);
  const [providers, setProviders] = useState<CachedProviders | null>();
  /** Told apart from "nowhere to watch it", which is what this used to say. §6.58. */
  const [failed, setFailed] = useState(false);
  /**
   * And apart from both: nothing was asked, because there is nothing to ask about.
   *
   * An imported title has no provider ID until matching gives it one. The fixture
   * provider answered for any ID at all, so this section named a streaming service, in
   * the reader's country, credited to JustWatch, for a show nothing had identified.
   */
  const [unmatched, setUnmatched] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setProviders(undefined);
    setFailed(false);
    setUnmatched(false);
    void getProvidersCached(titleId, region).then((result) => {
      if (cancelled) return;
      setUnmatched(!!result.unmatched);
      setProviders(result.unmatched ? null : (result.providers ?? null));
      setFailed(!!result.failed && !result.providers);
    });
    return () => {
      cancelled = true;
    };
  }, [titleId, region]);

  function choose(code: string) {
    setRegion(code);
    setRegionState(code);
    setPicking(false);
  }

  const nothing =
    providers === null ||
    (providers && !providers.flatrate.length && !providers.rent.length && !providers.buy.length);

  return (
    <View style={styles.block}>
      <View style={styles.header}>
        <Section>{COPY.whereToWatch.heading}</Section>
        <Pressable
          onPress={() => setPicking(!picking)}
          hitSlop={REACH.inline}
          accessibilityRole="button"
          // The label belonged to the Text, which is not the thing you press.
          accessibilityLabel={`Change country — currently ${regionName(region)}`}
          aria-expanded={picking}
          style={tap}
        >
          <Text style={styles.region}>{regionName(region)}</Text>
        </Pressable>
      </View>

      {/*
        * `Choice`, rather than a second radio group with its own fill and its own box.
        *
        * Hand-rolled before `Choice` existed and never migrated: `chipOn` was
        * `backgroundColor: theme.actionFill` against the house rule `Choice.tsx` states in
        * its own source — selection is a rule, never a fill. Twenty-four of them, and every
        * one under the 44 floor: the web's copy of this control measured 34.75–40.77 × 32
        * on the built page at 390px, which is the same box this drew at `paddingHorizontal:
        * 12, paddingVertical: 6` around `text.s12`. Through `Choice` the phone export
        * measures 44 × 44 for all twenty-four, in a panel 334 × 200 that is only on screen
        * while somebody is picking. `stats.tsx` already carries the epitaph for this exact
        * control: "`Chip` was here — a local radio with its own fill, its own text colours
        * and its own box". It was here too.
        *
        * The `View` around it was not a `radiogroup` either, so a screen reader met
        * twenty-four loose radios with no question attached. `Choice` names the group.
        */}
      {picking && (
        <Choice
          name={COPY.whereToWatch.country}
          options={REGIONS.map((r) => ({ key: r.code, label: r.code, hint: r.name }))}
          value={region}
          onChange={choose}
        />
      )}

      {providers === undefined && <Note>{COPY.waiting.checking}</Note>}

      {unmatched && <Note>{COPY.whereToWatch.unmatched}</Note>}

      {failed && (
        <Text style={styles.failed} accessibilityLiveRegion="polite">
          {COPY.whereToWatch.failed}
        </Text>
      )}

      {!failed && !unmatched && nothing && (
        <Note>
          Not on any service in {regionName(region)} that we can see. Try another country
          above.
        </Note>
      )}

      {providers && !nothing && (
        <>
          <Row label={COPY.whereToWatch.stream} names={providers.flatrate} />
          <Row label={COPY.whereToWatch.rent} names={providers.rent} />
          <Row label={COPY.whereToWatch.buy} names={providers.buy} />

          {providers.link && (
            <Pressable
              onPress={() => void Linking.openURL(providers.link!)}
              hitSlop={REACH.inline}
              accessibilityRole="link"
            >
              <Text style={styles.link}>{COPY.controls.openJustWatch}</Text>
            </Pressable>
          )}

          {/* Licence condition, not a courtesy. */}
          <Attribution of={['justwatch']} />
        </>
      )}
    </View>
  );
}

/**
 * `Stream — Netflix · Now TV`. The web's copy of this carries the rest of the reasoning.
 *
 * **One line, and the names wrap inside it.** This wrapped the *row* rather than the text:
 * `flexWrap: 'wrap'` on the container with the names on `flexShrink: 1` and no `flex`, so
 * flexbox laid the names out at their full intrinsic width, found they did not fit beside
 * the label, and moved the whole run to a second flex line before shrinking was ever
 * considered. The label then sat alone on a line of its own.
 *
 * Which made the same component draw its label in two different places depending on how
 * many services a title had: `r6-title-the-bear.png` has "Stream" alone above five names,
 * and `r6-title-it-s-always-sunny-in-phi.png` has "Stream  Hulu · fuboTV · YouTube TV ·
 * FXNow" on one line and "Buy" alone above two. Three label positions, one component, two
 * screenshots — and the doc comment above has said `Stream — Netflix · Now TV` throughout.
 *
 * So: no wrap on the row, and `flex: 1` on the names, which makes them a flex item sized
 * to what is left rather than to what they want. The text then wraps *within* that width,
 * which is what wrapping should have meant here all along, and the label keeps its place.
 */
function Row({ label, names }: { label: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.serviceText}>{names.join(' · ')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: 16,
    padding: 12,
    borderRadius: radius.plate,
    backgroundColor: theme.groundRaised,
    gap: 8,
  },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  region: { color: theme.inkSecondary, fontSize: text.s12, textDecorationLine: 'underline', fontFamily: type.family.title.name },
  failed: { color: theme.trouble, fontSize: text.s14, lineHeight: leadingOf(text.s14, leading.l143), marginTop: 6, fontFamily: type.family.body.name },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  rowLabel: { color: theme.inkSecondary, fontSize: text.s12, fontFamily: type.family.body.name },
  serviceText: { color: theme.ink, fontSize: text.s14, fontFamily: type.family.body.name, flex: 1 },
  link: { color: theme.inkSecondary, fontSize: text.s12, textDecorationLine: 'underline', fontFamily: type.family.title.name },
});
