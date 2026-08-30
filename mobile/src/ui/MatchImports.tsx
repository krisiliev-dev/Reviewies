import { SCREEN } from '@reviewies/core/ui/screen';
import { ROW } from '@reviewies/core/ui/row';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  acceptMatch,
  runMatching,
  type Proposal,
  type RunProgress,
} from '@reviewies/core/data/reconcile';
import { Poster } from './Poster';
import { REACH, tap, theme, space} from './theme';
import { Button } from './Button';
import { Row as BaseRow } from './Row';

import { text, type } from '@reviewies/core/tokens';
import { COPY } from '@reviewies/core/copy';
import { Note } from './Note';

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
/**
 * Once per session, not once per visit.
 *
 * Up Next mounts this whenever anything is unmatched, which includes every return to
 * the tab. Matching asks the provider once per show, so re-running it per visit would
 * be a burst of requests answering a question already answered. Module scope because
 * remounting is exactly what has to stop mattering.
 */
let startedThisSession = false;

/** Only for tests, which need each case to look like a fresh launch. */
export function resetAutoMatch(): void {
  startedThisSession = false;
}

export function MatchImports({
  onDone,
  /** Off for the panel shown right after an import, which explains itself first. */
  autoStart = true,
}: {
  onDone?: () => void;
  autoStart?: boolean;
}) {
  const [progress, setProgress] = useState<RunProgress>();
  const [running, setRunning] = useState(false);
  const [asks, setAsks] = useState<Proposal[]>([]);
  const [error, setError] = useState<string>();

  const startRef = useRef<() => Promise<void>>(undefined);

  async function start() {
    setRunning(true);
    setError(undefined);
    setAsks([]);
    try {
      const result = await runMatching({ onProgress: setProgress });
      // From the result, not only from the progress callback. A run with nothing left
      // to do never enters its loop, so nothing was ever reported and the screen went
      // back to offering the button as though it had not been pressed.
      setProgress(result);
      setAsks(result.asks);
    } catch (e) {
      // Said rather than thrown out of a handler: silently returning to the button
      // looks identical to a run that found nothing, and nothing said the provider
      // was unreachable.
      setError(e instanceof Error ? e.message : COPY.import.providerFailed);
    } finally {
      setRunning(false);
      onDone?.();
    }
  }

  startRef.current = start;

  /**
   * It starts itself, since doc 10 §4 — which the web has done since then and the
   * phone never did. §6.80 gave both platforms the same sentence, and "Episodes appear
   * as each one is found" is only true where matching actually runs itself.
   */
  useEffect(() => {
    if (!autoStart || startedThisSession) return;
    startedThisSession = true;
    void startRef.current?.();
  }, [autoStart]);

  async function choose(proposal: Proposal, providerId: string) {
    await acceptMatch(proposal.localId, providerId);
    setAsks((current) => current.filter((a) => a.localId !== proposal.localId));
    onDone?.();
  }

  return (
    <View style={styles.block}>
      {!running && asks.length === 0 && (
        <Button
          onPress={start}
          tone="primary"
          label={COPY.import.heading}
          name={COPY.import.heading}
        />
      )}

      {running && (
        <Note accessibilityLiveRegion="polite">
          Matching… {progress?.done ?? 0} of {(progress?.done ?? 0) + (progress?.left ?? 0)},{' '}
          {progress?.matched ?? 0} matched so far.
        </Note>
      )}

      {!running && progress && (
        <Note>
          Matched {progress.matched} of {progress.done}.
          {asks.length > 0 ? ` ${asks.length} need a decision.` : ''}
        </Note>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {asks.map((ask) => (
        <View key={ask.localId} style={styles.card}>
          <Text style={styles.name}>{ask.name}</Text>
          <Note>{COPY.import.ambiguous}</Note>
          {ask.candidates.map((candidate) => (
            <BaseRow
              key={candidate.id}
              title={candidate.name}
              meta={candidate.year ? String(candidate.year) : COPY.import.yearUnknown}
              open={{
                // Pressing this *is* the answer — nothing opens — so there is no `to`
                // and both platforms announce a button rather than a link.
                name: `${ask.name} is ${candidate.name}${candidate.year ? `, ${candidate.year}` : ''}`,
                run: () => choose(ask, candidate.id),
              }}
              lead={
                <Poster
                  url={candidate.posterUrl}
                  name={candidate.name}
                />
              }
            />
          ))}
          <Pressable
            onPress={() =>
              // Left unmatched rather than guessed at. It stays in the list for next
              // time, which is the whole point of not forcing a choice.
              setAsks((current) => current.filter((a) => a.localId !== ask.localId))
            }
            hitSlop={REACH.inline}
            style={tap}
            accessibilityRole="button"
            accessibilityLabel={`Leave ${ask.name} unmatched`}
          >
            <Text style={styles.skip}>{COPY.controls.noneOfThese}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 12 },
  error: { color: theme.trouble, fontSize: text.s14, fontFamily: type.family.body.name },
  /* One proposal among several, which is a list. Ruled, and it bleeds like the rest. */
  card: {
    borderBottomWidth: ROW.rule,
    borderBottomColor: theme[ROW.colour],
    marginHorizontal: SCREEN.bleed,
    paddingHorizontal: SCREEN.edge,
    paddingVertical: space.s12,
    gap: space.s8,
  },
  name: { color: theme.ink, fontSize: text.s16, fontFamily: type.family.title.name },
  skip: { color: theme.inkSecondary, fontSize: text.s12, textDecorationLine: 'underline', fontFamily: type.family.title.name },
});
