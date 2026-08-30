import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { getProvidersCached } from '@reviewies/core/metadata/index';
import { Attribution } from './Attribution';
import { getRegion, REGIONS, regionName, setRegion } from '@reviewies/core/metadata/region';
import type { CachedProviders } from '@reviewies/core/domain/types';
import { border, leadingOf, radius, tap, theme } from './theme';
import { COPY } from '@reviewies/core/copy';
import { text, type, leading } from '@reviewies/core/tokens';
import { Section } from './Section';
import { Note } from './Note';

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
        <Section>Where to watch</Section>
        <Pressable
          onPress={() => setPicking(!picking)}
          hitSlop={8}
          accessibilityRole="button"
          // The label belonged to the Text, which is not the thing you press.
          accessibilityLabel={`Change country — currently ${regionName(region)}`}
          accessibilityState={{ expanded: picking }}
          style={tap}
        >
          <Text style={styles.region}>{regionName(region)}</Text>
        </Pressable>
      </View>

      {picking && (
        <View style={styles.regions}>
          {REGIONS.map((r) => (
            <Pressable
              key={r.code}
              onPress={() => choose(r.code)}
              style={[styles.chip, r.code === region && styles.chipOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected: r.code === region, checked: r.code === region }}
              accessibilityLabel={`Show availability in ${r.name}`}
            >
              <Text style={[styles.chipText, r.code === region && styles.chipTextOn]}>
                {r.code}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {providers === undefined && <Note>Checking…</Note>}

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
          <Row label="Stream" names={providers.flatrate} />
          <Row label="Rent" names={providers.rent} />
          <Row label="Buy" names={providers.buy} />

          {providers.link && (
            <Pressable
              onPress={() => void Linking.openURL(providers.link!)}
              hitSlop={8}
              accessibilityRole="link"
            >
              <Text style={styles.link}>Open on JustWatch</Text>
            </Pressable>
          )}

          {/* Licence condition, not a courtesy. */}
          <Attribution of={['justwatch']} />
        </>
      )}
    </View>
  );
}

/** `Stream — Netflix · Now TV`. The web's copy of this carries the reasoning. */
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
  regions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.plate,
    borderWidth: border.hairline, borderColor: theme.strokeSignal, backgroundColor: 'transparent',
  },
  chipOn: { backgroundColor: theme.actionFill },
  chipText: { color: theme.inkSecondary, fontSize: text.s12, fontFamily: type.family.title.name },
  chipTextOn: { color: theme.actionLabel },
  failed: { color: theme.trouble, fontSize: text.s14, lineHeight: leadingOf(text.s14, leading.l143), marginTop: 6, fontFamily: type.family.body.name },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 6 },
  rowLabel: { color: theme.inkSecondary, fontSize: text.s12, fontFamily: type.family.body.name },
  serviceText: { color: theme.ink, fontSize: text.s14, fontFamily: type.family.body.name, flexShrink: 1 },
  link: { color: theme.inkSecondary, fontSize: text.s12, textDecorationLine: 'underline', fontFamily: type.family.title.name },
});
