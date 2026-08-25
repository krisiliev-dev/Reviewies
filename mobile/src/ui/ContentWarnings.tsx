import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { syncConfigured } from '@reviewies/core/sync/auth';
import {
  CONTENT_WARNINGS,
  clearContentWarningVote,
  describeVotes,
  fetchContentWarnings,
  fetchMyWarningVotes,
  voteContentWarning,
  type ContentWarningId,
  type WarningSummary,
} from '@reviewies/core/social/contentWarnings';
import { radius, theme } from './theme';

/**
 * Content warnings, voted on by whoever has seen it.
 *
 * Collapsed by default and never opened on its own. A warning is only useful to
 * someone who wants it; showing it unprompted spoils plot points for everyone who
 * does not — the exact failure people complained about with review sections that lead
 * with what happens.
 *
 * Advisory, never a gate. Nothing here hides anything.
 */
export function ContentWarnings({ titleId }: { titleId: string }) {
  const [open, setOpen] = useState(false);
  const [summaries, setSummaries] = useState<WarningSummary[]>();
  const [mine, setMine] = useState<Map<string, boolean>>(new Map());
  const [voting, setVoting] = useState(false);
  const [note, setNote] = useState<string>();

  const load = useCallback(async () => {
    const [aggregate, own] = await Promise.all([
      fetchContentWarnings(titleId),
      fetchMyWarningVotes(titleId),
    ]);
    setSummaries(aggregate);
    setMine(own);
  }, [titleId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  if (!syncConfigured()) return null;

  async function vote(warning: ContentWarningId, present: boolean) {
    // Tapping the position you already hold withdraws it, rather than leaving you
    // with no way to take back a vote you no longer stand behind.
    if (mine.get(warning) === present) {
      await clearContentWarningVote(titleId, warning);
      setNote(undefined);
    } else {
      const result = await voteContentWarning(titleId, warning, present);
      setNote(result.ok ? undefined : result.reason);
    }
    await load();
  }

  return (
    <View style={styles.wrap}>
      <Pressable onPress={() => setOpen(!open)} style={styles.toggle}>
        <Text style={styles.toggleText}>
          {open ? 'Hide content warnings' : 'Content warnings'}
        </Text>
      </Pressable>

      {open && (
        <View style={styles.panel}>
          {summaries === undefined && <Text style={styles.blurb}>Loading…</Text>}
          {summaries?.length === 0 && (
            <Text style={styles.blurb}>
              Nobody has flagged anything yet. If you have seen it, you can below.
            </Text>
          )}

          {summaries?.map((summary) => (
            <View key={summary.warning} style={styles.row}>
              <View
                style={[
                  styles.dot,
                  summary.verdict === 'yes' && styles.dotYes,
                  summary.verdict === 'contested' && styles.dotContested,
                ]}
              />
              <Text style={[styles.label, summary.verdict === 'no' && styles.labelMuted]}>
                {summary.label}
              </Text>
              <Text style={styles.votes}>
                {summary.verdict === 'contested' ? 'disputed · ' : ''}
                {summary.singleVote ? 'one person · ' : ''}
                {describeVotes(summary)}
              </Text>
            </View>
          ))}

          <Pressable onPress={() => setVoting(!voting)} hitSlop={8}>
            <Text style={styles.link}>{voting ? 'Done' : 'Flag something'}</Text>
          </Pressable>

          {voting &&
            CONTENT_WARNINGS.map((warning) => {
              const own = mine.get(warning.id);
              return (
                <View key={warning.id} style={styles.row}>
                  <Text style={styles.label}>{warning.label}</Text>
                  <Pressable
                    onPress={() => vote(warning.id, true)}
                    style={[styles.vote, own === true && styles.voteOn]}
                  >
                    <Text style={[styles.voteText, own === true && styles.voteTextOn]}>Yes</Text>
                  </Pressable>
                  {/* A "no" vote is what lets a wrong flag be argued down, instead of
                      warnings only ever accumulating. */}
                  <Pressable
                    onPress={() => vote(warning.id, false)}
                    style={[styles.vote, own === false && styles.voteOn]}
                  >
                    <Text style={[styles.voteText, own === false && styles.voteTextOn]}>No</Text>
                  </Pressable>
                </View>
              );
            })}

          {note && <Text style={styles.error}>{note}</Text>}

          <Text style={styles.blurb}>
            Community-reported, so treat it as a heads-up rather than a guarantee.
            Nothing here hides anything.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  toggle: {
    alignSelf: 'flex-start',
    backgroundColor: theme.surface,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toggleText: { color: theme.muted, fontSize: 12 },
  panel: { backgroundColor: theme.surface, borderRadius: radius.lg, padding: 12, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.surface2 },
  dotYes: { backgroundColor: theme.accent },
  dotContested: { backgroundColor: theme.muted },
  label: { color: theme.text, fontSize: 13, flex: 1 },
  labelMuted: { color: theme.muted },
  votes: { color: theme.muted, fontSize: 11 },
  vote: {
    backgroundColor: theme.surface2,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  voteOn: { backgroundColor: theme.accent },
  voteText: { color: theme.muted, fontSize: 12 },
  voteTextOn: { color: theme.ink, fontWeight: '600' },
  link: { color: theme.muted, fontSize: 12, textDecorationLine: 'underline' },
  blurb: { color: theme.muted, fontSize: 11, lineHeight: 16 },
  error: { color: theme.accent, fontSize: 12 },
});
