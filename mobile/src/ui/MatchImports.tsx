import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  acceptMatch,
  runMatching,
  type Proposal,
  type RunProgress,
} from '@reviewies/core/data/reconcile';
import { Poster } from './Poster';
import { radius, tap, theme } from './theme';

/**
 * Finishing a migration.
 *
 * An export carries names and dates and no provider IDs, so an import lands under local
 * ones the provider has never heard of — no artwork, no air dates, no episode list
 * beyond what was watched. This is what turns those into real shows.
 *
 * The design turns on one asymmetry. An unmatched row is visibly unfinished and costs
 * nothing; a wrong match silently moves somebody's history onto the wrong show and there
 * is no way for them to notice. So the run takes only what it is sure of, and the rest
 * become questions shown with posters and years rather than a yes/no on a name.
 */
export function MatchImports({ onDone }: { onDone?: () => void }) {
  const [progress, setProgress] = useState<RunProgress>();
  const [running, setRunning] = useState(false);
  const [asks, setAsks] = useState<Proposal[]>([]);

  async function start() {
    setRunning(true);
    setAsks([]);
    try {
      const result = await runMatching({ onProgress: setProgress });
      setAsks(result.asks);
    } finally {
      setRunning(false);
      onDone?.();
    }
  }

  async function choose(proposal: Proposal, providerId: string) {
    await acceptMatch(proposal.localId, providerId);
    setAsks((current) => current.filter((a) => a.localId !== proposal.localId));
    onDone?.();
  }

  return (
    <View style={styles.block}>
      {!running && asks.length === 0 && (
        <Pressable style={styles.primary} onPress={start} accessibilityRole="button">
          <Text style={styles.primaryText}>Match imported shows</Text>
        </Pressable>
      )}

      {running && (
        <Text style={styles.status} accessibilityLiveRegion="polite">
          Matching… {progress?.done ?? 0} of {(progress?.done ?? 0) + (progress?.left ?? 0)},{' '}
          {progress?.matched ?? 0} matched so far.
        </Text>
      )}

      {!running && progress && (
        <Text style={styles.status}>
          Matched {progress.matched} of {progress.done}.
          {asks.length > 0 ? ` ${asks.length} need a decision.` : ''}
        </Text>
      )}

      {asks.map((ask) => (
        <View key={ask.localId} style={styles.card}>
          <Text style={styles.name}>{ask.name}</Text>
          {/* The honest reason to ask is not "we failed" — it is that more than one
              answer looked right, and picking one would be a guess about a history. */}
          <Text style={styles.status}>
            More than one show could be this. Picking the wrong one would move your
            history onto it.
          </Text>
          {ask.candidates.map((candidate) => (
            <Pressable
              key={candidate.id}
              style={styles.candidate}
              onPress={() => choose(ask, candidate.id)}
              accessibilityRole="button"
              accessibilityLabel={`${ask.name} is ${candidate.name}${
                candidate.year ? `, ${candidate.year}` : ''
              }`}
            >
              <Poster url={candidate.posterUrl} name={candidate.name} width={40} height={56} />
              <View style={styles.candidateBody}>
                <Text numberOfLines={1} style={styles.candidateName}>
                  {candidate.name}
                </Text>
                <Text style={styles.status}>{candidate.year ?? 'Year unknown'}</Text>
              </View>
            </Pressable>
          ))}
          <Pressable
            onPress={() =>
              // Left unmatched rather than guessed at. It stays in the list for next
              // time, which is the whole point of not forcing a choice.
              setAsks((current) => current.filter((a) => a.localId !== ask.localId))
            }
            hitSlop={8}
            style={tap}
            accessibilityRole="button"
            accessibilityLabel={`Leave ${ask.name} unmatched`}
          >
            <Text style={styles.skip}>None of these</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10 },
  primary: {
    backgroundColor: theme.accent,
    borderRadius: radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { color: theme.ink, fontSize: 15, fontWeight: '700' },
  status: { color: theme.muted, fontSize: 13, lineHeight: 18 },
  card: { backgroundColor: theme.surface, borderRadius: radius.lg, padding: 12, gap: 8 },
  name: { color: theme.text, fontSize: 15, fontWeight: '600' },
  candidate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.surface2,
    borderRadius: radius.md,
    padding: 8,
  },
  candidateBody: { flex: 1, minWidth: 0 },
  candidateName: { color: theme.text, fontSize: 14 },
  skip: { color: theme.muted, fontSize: 12, textDecorationLine: 'underline' },
});
