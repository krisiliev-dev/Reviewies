import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { getProvidersCached, JUSTWATCH_ATTRIBUTION } from '@reviewies/core/metadata/index';
import { getRegion, REGIONS, regionName, setRegion } from '@reviewies/core/metadata/region';
import type { CachedProviders } from '@reviewies/core/domain/types';
import { radius, tap, theme } from './theme';
import { COPY } from '@reviewies/core/copy';

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
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setProviders(undefined);
    setFailed(false);
    void getProvidersCached(titleId, region).then((result) => {
      if (cancelled) return;
      setProviders(result.providers ?? null);
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
        <Text style={styles.heading}>Where to watch</Text>
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

      {providers === undefined && <Text style={styles.muted}>Checking…</Text>}

      {failed && (
        <Text style={styles.failed} accessibilityLiveRegion="polite">
          {COPY.whereToWatch.failed}
        </Text>
      )}

      {!failed && nothing && (
        <Text style={styles.muted}>
          Not on any service in {regionName(region)} that we can see. Try another country
          above.
        </Text>
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
          <Text style={styles.attribution}>{JUSTWATCH_ATTRIBUTION}</Text>
        </>
      )}
    </View>
  );
}

function Row({ label, names }: { label: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {names.map((name) => (
        <View key={name} style={styles.service}>
          <Text style={styles.serviceText}>{name}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: 16,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: theme.surface,
    gap: 8,
  },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  heading: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  region: { color: theme.muted, fontSize: 12, textDecorationLine: 'underline' },
  regions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: theme.surface2,
  },
  chipOn: { backgroundColor: theme.accent },
  chipText: { color: theme.muted, fontSize: 12 },
  chipTextOn: { color: theme.ink, fontWeight: '600' },
  failed: { color: theme.accent, fontSize: 13, lineHeight: 19, marginTop: 6 },
  muted: { color: theme.muted, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 6 },
  rowLabel: { color: theme.muted, fontSize: 12 },
  service: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
    backgroundColor: theme.surface2,
  },
  serviceText: { color: theme.text, fontSize: 14 },
  link: { color: theme.muted, fontSize: 12, textDecorationLine: 'underline' },
  attribution: { color: theme.muted, fontSize: 11 },
});
