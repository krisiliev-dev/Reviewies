import { SURFACE } from '@reviewies/core/ui/surface';
import { COPY } from '@reviewies/core/copy';
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
import { REACH, border, leadingOf, radius, theme } from './theme';
import { text, type, leading } from '@reviewies/core/tokens';
import { Note } from './Note';

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
  const [failed, setFailed] = useState<string>();

  const load = useCallback(async () => {
    const [aggregate, own] = await Promise.all([
      fetchContentWarnings(titleId),
      fetchMyWarningVotes(titleId),
    ]);
    setSummaries(aggregate.warnings);
    setFailed(aggregate.failed);
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
      const cleared = await clearContentWarningVote(titleId, warning);
      setNote(cleared.ok ? undefined : cleared.reason);
    } else {
      const result = await voteContentWarning(titleId, warning, present);
      setNote(result.ok ? undefined : result.reason);
    }
    await load();
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => setOpen(!open)}
        style={styles.toggle}
        accessibilityRole="button"
        aria-expanded={open}
      >
        <Text style={styles.toggleText}>
          {open ? COPY.controls.hideWarnings : COPY.warnings.heading}
        </Text>
      </Pressable>

      {open && (
        <View style={styles.panel}>
          {summaries === undefined && <Note level="footnote">{COPY.waiting.loading}</Note>}
          {/* Two states, two sentences — the reason lives with the words now, in
              `COPY.warnings.failed`, rather than in a comment on each platform saying
              "see the web's copy of this". */}
          {failed && (
            <Text style={styles.warningFailed} accessibilityLiveRegion="polite">{COPY.warnings.failed}</Text>
          )}
          {!failed && summaries?.length === 0 && (
            <Note level="footnote">{COPY.warnings.empty}</Note>
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

          <Pressable
            onPress={() => setVoting(!voting)}
            hitSlop={REACH.inline}
            accessibilityRole="button"
            aria-expanded={voting}
            accessibilityLabel={voting ? 'Done flagging' : COPY.controls.flagSomething}
          >
            <Text style={styles.link}>{voting ? COPY.controls.done : COPY.controls.flagSomething}</Text>
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
                    accessibilityRole="button"
                    aria-selected={own === true}
                    // Twelve warnings, twelve pairs of these. Read aloud in order,
                    // "Yes button, No button, Yes button" says nothing about what is
                    // being voted on.
                    accessibilityLabel={`Yes, this has ${warning.label.toLowerCase()}`}
                  >
                    <Text style={[styles.voteText, own === true && styles.voteTextOn]}>Yes</Text>
                  </Pressable>
                  {/* A "no" vote is what lets a wrong flag be argued down, instead of
                      warnings only ever accumulating. */}
                  <Pressable
                    onPress={() => vote(warning.id, false)}
                    style={[styles.vote, own === false && styles.voteOn]}
                    accessibilityRole="button"
                    aria-selected={own === false}
                    accessibilityLabel={`No, this does not have ${warning.label.toLowerCase()}`}
                  >
                    <Text style={[styles.voteText, own === false && styles.voteTextOn]}>No</Text>
                  </Pressable>
                </View>
              );
            })}

          {note && <Text style={styles.error}>{note}</Text>}

          <Note level="footnote">{COPY.warnings.provenance}</Note>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  warningFailed: { color: theme.trouble, fontSize: text.s14, lineHeight: leadingOf(text.s14, leading.l143), fontFamily: type.family.body.name },
  wrap: { gap: 8 },
  toggle: {
    alignSelf: 'flex-start',
    backgroundColor: theme.groundRaised,
    borderRadius: radius.plate,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toggleText: { color: theme.inkSecondary, fontSize: text.s12, fontFamily: type.family.title.name },
  panel: { backgroundColor: theme[SURFACE.card], borderRadius: radius.plate, padding: 12, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: theme.strokeSignal },
  dotYes: { backgroundColor: theme.workingMark },
  dotContested: { backgroundColor: theme.inkTertiary },
  label: { color: theme.ink, fontSize: text.s14, flex: 1, fontFamily: type.family.body.name },
  labelMuted: { color: theme.inkSecondary },
  votes: { color: theme.inkSecondary, fontSize: text.s12, fontFamily: type.family.body.name },
  vote: {
    borderWidth: border.hairline, borderColor: theme.strokeSignal, backgroundColor: 'transparent',
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  voteOn: { backgroundColor: theme.actionFill },
  voteText: { color: theme.inkSecondary, fontSize: text.s12, fontFamily: type.family.title.name },
  voteTextOn: { color: theme.actionLabel },
  link: { color: theme.inkSecondary, fontSize: text.s12, textDecorationLine: 'underline', fontFamily: type.family.title.name },
  error: { color: theme.trouble, fontSize: text.s14, fontFamily: type.family.body.name },
});
