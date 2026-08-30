import { useCallback, useEffect, useState } from 'react';
import { COPY } from '@reviewies/core/copy';
import { syncConfigured } from '@reviewies/core/sync/auth';
import { Button } from '../ui/Button';

import { Note } from '../ui/Note';
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

/**
 * Content warnings on a title, voted on by whoever has seen it.
 *
 * Collapsed by default and never expanded automatically. A warning is only useful to
 * someone who wants it; opening it unprompted would spoil plot points for everyone
 * who does not, which is the exact failure people complained about with review
 * sections that lead with what happens.
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
    // Clicking the position you already hold withdraws it, rather than leaving you
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
    <section className="mb-5">
      <Button
        size="inline"
        onPress={() => setOpen(!open)}
        label={open ? 'Hide content warnings' : 'Content warnings'}
        name={open ? 'Hide content warnings' : 'Show content warnings'}
      />

      {open && (
        <div className="mt-2 rounded-plate bg-ground-raised p-3">
          {summaries === undefined && <Note level="footnote">Loading…</Note>}

          {/* Two states, two sentences, and the reason is in `COPY.warnings.failed`:
              a request that did not arrive is not an answer, and this is the one screen
              where being told the wrong one has a cost. The pair of comments that used
              to say this on both platforms was itself the duplication. */}
          {failed && (
            <p className="text-s12 text-trouble" role="status">{COPY.warnings.failed}</p>
          )}

          {!failed && summaries?.length === 0 && (
            <Note level="footnote">{COPY.warnings.empty}</Note>
          )}

          {summaries && summaries.length > 0 && (
            <ul className="mb-3 flex flex-col gap-1.5">
              {summaries.map((s) => (
                <li key={s.warning} className="flex items-center gap-2">
                  {/* `working-mark` rather than the accent fill. This dot is not a
                      control and never was: the accent is the app's one filled shape and
                      it means "the thing on this screen worth pressing", which a verdict
                      is not. `working-mark` is what the rest of the app already uses for
                      "affirmed" — it is `CHOSEN.colour` and the cross-off's pen. */}
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-pill ${
                      s.verdict === 'yes'
                        ? 'bg-working-mark'
                        : s.verdict === 'contested'
                          ? 'bg-stroke-signal'
                          : 'border border-stroke-signal'
                    }`}
                    aria-hidden
                  />
                  <span className={`text-s14 ${s.verdict === 'no' ? 'text-ink-secondary' : ''}`}>
                    {s.label}
                  </span>
                  <Note level="footnote" as="span" className="ml-auto shrink-0">
                    {s.verdict === 'contested' && 'disputed · '}
                    {s.singleVote && 'one person · '}
                    {describeVotes(s)}
                  </Note>
                </li>
              ))}
            </ul>
          )}

          {/* The third instance of §6.129's reveal rule, and it was here before the rule
              was written: a panel that stands closed and a control that folds it away
              again. `SETTINGS.close` is that word, shared with the calendar's, so a fourth
              screen does not invent a fifth spelling. §6.134. */}
          <Button
            size="inline"
            tone="quiet"
            onPress={() => setVoting(!voting)}
            label={voting ? COPY.controls.done : 'Flag something'}
            name={voting ? `${COPY.controls.done} flagging` : 'Flag something'}
          />

          {voting && (
            <ul className="mt-2 flex flex-col gap-1">
              {CONTENT_WARNINGS.map((w) => {
                const own = mine.get(w.id);
                return (
                  <li key={w.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-s14">{w.label}</span>
                    <Button
                      size="inline"
                      label="Yes"
                      // Twelve warnings, twelve pairs of these. Read aloud in order,
                      // "Yes button, No button, Yes button" says nothing about what is
                      // being voted on.
                      name={`Yes, this has ${w.label.toLowerCase()}`}
                      // Not a `Choice`: a warning has three states — yes, no, and not
                      // voted on — and a radio group has no way to say the third. Two
                      // toggles that can both be off is what this actually is.
                      selected={own === true}
                      onPress={() => vote(w.id, true)}
                    />
                    {/* A "no" vote is what lets a wrong flag be argued down, instead of
                        warnings only ever accumulating. */}
                    <Button
                      size="inline"
                      label="No"
                      name={`No, this does not have ${w.label.toLowerCase()}`}
                      selected={own === false}
                      onPress={() => vote(w.id, false)}
                    />
                  </li>
                );
              })}
            </ul>
          )}

          {note && <p className="mt-2 text-s12 text-trouble">{note}</p>}

          <Note level="footnote" className="mt-3">{COPY.warnings.provenance}</Note>
        </div>
      )}
    </section>
  );
}
