import { useCallback, useEffect, useState } from 'react';
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
    // Clicking the position you already hold withdraws it, rather than leaving you
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
    <section className="mb-5">
      <button
        onClick={() => setOpen(!open)}
        className="rounded-lg bg-surface px-3 py-1.5 text-xs text-muted"
        aria-expanded={open}
      >
        {open ? 'Hide content warnings' : 'Content warnings'}
      </button>

      {open && (
        <div className="mt-2 rounded-xl bg-surface p-3">
          {summaries === undefined && <p className="text-xs text-muted">Loading…</p>}

          {summaries?.length === 0 && (
            <p className="text-xs text-muted">
              Nobody has flagged anything yet. If you have seen it, you can below.
            </p>
          )}

          {summaries && summaries.length > 0 && (
            <ul className="mb-3 flex flex-col gap-1.5">
              {summaries.map((s) => (
                <li key={s.warning} className="flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      s.verdict === 'yes'
                        ? 'bg-accent'
                        : s.verdict === 'contested'
                          ? 'bg-muted'
                          : 'bg-surface-2'
                    }`}
                    aria-hidden
                  />
                  <span className={`text-sm ${s.verdict === 'no' ? 'text-muted' : ''}`}>
                    {s.label}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-muted">
                    {s.verdict === 'contested' && 'disputed · '}
                    {s.singleVote && 'one person · '}
                    {describeVotes(s)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <button
            onClick={() => setVoting(!voting)}
            className="text-xs text-muted underline"
            aria-expanded={voting}
          >
            {voting ? 'Done' : 'Flag something'}
          </button>

          {voting && (
            <ul className="mt-2 flex flex-col gap-1">
              {CONTENT_WARNINGS.map((w) => {
                const own = mine.get(w.id);
                return (
                  <li key={w.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{w.label}</span>
                    <button
                      onClick={() => vote(w.id, true)}
                      aria-pressed={own === true}
                      className={`shrink-0 rounded-lg px-2.5 py-1 text-xs ${
                        own === true ? 'bg-accent font-medium text-ink' : 'bg-surface-2 text-muted'
                      }`}
                    >
                      Yes
                    </button>
                    {/* A "no" vote is what lets a wrong flag be argued down, instead of
                        warnings only ever accumulating. */}
                    <button
                      onClick={() => vote(w.id, false)}
                      aria-pressed={own === false}
                      className={`shrink-0 rounded-lg px-2.5 py-1 text-xs ${
                        own === false ? 'bg-accent font-medium text-ink' : 'bg-surface-2 text-muted'
                      }`}
                    >
                      No
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {note && <p className="mt-2 text-xs text-accent">{note}</p>}

          <p className="mt-3 text-xs text-muted">
            Community-reported, so treat it as a heads-up rather than a guarantee.
            Nothing here hides anything.
          </p>
        </div>
      )}
    </section>
  );
}
