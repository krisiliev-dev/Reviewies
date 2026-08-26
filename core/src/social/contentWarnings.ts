import { getClient, getSession } from '../sync/auth.ts';

/**
 * Community-voted content warnings.
 *
 * From research doc 4 §2.2: several threads asked for something like doesthedogdie
 * built into the tracker, so you can decide before pressing play rather than after.
 *
 * Two rules shape this module. Warnings are **advisory, never a gate** — nothing is
 * hidden, the point is to inform a choice. And a vote can be `false` as well as
 * `true`, so a wrong flag can be argued down instead of only ever accumulating.
 */

/**
 * A fixed vocabulary, matching the `check` constraint in migration 0007.
 *
 * Free text was the obvious alternative and is the wrong one: arbitrary tags become a
 * second, unmoderated comment field, and the entire value of a warning is that it
 * means the same thing on every title.
 */
export const CONTENT_WARNINGS = [
  { id: 'animal-harm', label: 'An animal is harmed' },
  { id: 'child-harm', label: 'A child is harmed' },
  { id: 'sexual-violence', label: 'Sexual violence' },
  { id: 'domestic-abuse', label: 'Domestic abuse' },
  { id: 'suicide', label: 'Suicide' },
  { id: 'self-harm', label: 'Self-harm' },
  { id: 'eating-disorder', label: 'Disordered eating' },
  { id: 'graphic-violence', label: 'Graphic violence' },
  { id: 'gore', label: 'Gore' },
  { id: 'vomit', label: 'Vomiting' },
  { id: 'medical', label: 'Medical procedures' },
  { id: 'flashing-lights', label: 'Flashing lights' },
] as const;

export type ContentWarningId = (typeof CONTENT_WARNINGS)[number]['id'];

const LABELS = new Map<string, string>(CONTENT_WARNINGS.map((w) => [w.id, w.label]));

export const warningLabel = (id: string): string => LABELS.get(id) ?? id;

export interface WarningVotes {
  warning: string;
  yesVotes: number;
  noVotes: number;
}

/** `yes` and `no` are settled; `contested` means the minority is too large to ignore. */
export type Verdict = 'yes' | 'no' | 'contested';

export interface WarningSummary extends WarningVotes {
  label: string;
  verdict: Verdict;
  /**
   * One vote is one person's opinion, not a finding. Surfaced so the UI can say so
   * rather than presenting a single stranger's click as established fact.
   */
  singleVote: boolean;
}

/** A quarter of voters disagreeing is a disagreement, not noise. */
const CONTESTED_SHARE = 0.25;

export function summariseWarnings(rows: WarningVotes[]): WarningSummary[] {
  const summaries = rows
    .filter((r) => r.yesVotes + r.noVotes > 0)
    .map((r) => {
      const total = r.yesVotes + r.noVotes;
      const minority = Math.min(r.yesVotes, r.noVotes);
      const verdict: Verdict =
        minority / total >= CONTESTED_SHARE
          ? 'contested'
          : r.yesVotes > r.noVotes
            ? 'yes'
            : 'no';
      return {
        ...r,
        label: warningLabel(r.warning),
        verdict,
        singleVote: total === 1,
      };
    });

  // Confirmed first, then contested, and warnings that were argued down last —
  // they still appear, because "people checked and it isn't in this" is useful too.
  const order: Record<Verdict, number> = { yes: 0, contested: 1, no: 2 };
  return summaries.sort(
    (a, b) =>
      order[a.verdict] - order[b.verdict] ||
      b.yesVotes + b.noVotes - (a.yesVotes + a.noVotes) ||
      a.label.localeCompare(b.label),
  );
}

/** Plain-language vote counts; the numbers matter more than any badge. */
export function describeVotes(s: WarningSummary): string {
  const say = (n: number) => `${n} ${n === 1 ? 'says' : 'say'}`;
  if (s.noVotes === 0) return `${say(s.yesVotes)} yes`;
  if (s.yesVotes === 0) return `${say(s.noVotes)} no`;
  return `${say(s.yesVotes)} yes · ${say(s.noVotes)} no`;
}

/**
 * What came back, and whether asking worked.
 *
 * The two have to be told apart here more than anywhere else in this codebase. "Nobody
 * has flagged anything" is what this screen said when the query failed, and somebody
 * avoiding a trigger would read that as an answer. An empty list because there are no
 * votes and an empty list because the request did not arrive are the same array and
 * opposite facts.
 */
export interface WarningsResult {
  warnings: WarningSummary[];
  /** Set when the aggregate could not be read. Absent means it was read and was empty. */
  failed?: string;
}

/**
 * Fetch the aggregate for a title.
 *
 * Signed-out users get nothing rather than an error: like every shared feature, this
 * is additive, and the title page must render fully without it. That is not a failure
 * and does not set `failed` — there was nothing to ask.
 */
export async function fetchContentWarnings(titleId: string): Promise<WarningsResult> {
  const client = getClient();
  if (!client || !(await getSession())) return { warnings: [] };

  const { data, error } = await client.rpc('content_warnings', { p_title: titleId });
  if (error) return { warnings: [], failed: error.message };
  if (!data) return { warnings: [] };

  return summariseResult(
    (data as Array<Record<string, unknown>>).map((row) => ({
      warning: String(row.warning),
      yesVotes: Number(row.yes_votes),
      noVotes: Number(row.no_votes),
    })),
  );
}

const summariseResult = (rows: WarningVotes[]): WarningsResult => ({
  warnings: summariseWarnings(rows),
});

/** Which warnings the signed-in user has voted on, so the UI can show their position. */
export async function fetchMyWarningVotes(titleId: string): Promise<Map<string, boolean>> {
  const client = getClient();
  const session = await getSession();
  if (!client || !session) return new Map();

  const { data, error } = await client
    .from('content_warning_votes')
    .select('warning, present')
    .eq('title_id', titleId)
    .eq('user_id', session.user.id);

  if (error || !data) return new Map();
  return new Map(data.map((row) => [String(row.warning), Boolean(row.present)]));
}

/**
 * Record or change a vote.
 *
 * Upserted on the primary key, so voting again corrects your earlier answer rather
 * than stacking — one person cannot outvote a crowd by clicking repeatedly.
 */
export async function voteContentWarning(
  titleId: string,
  warning: ContentWarningId,
  present: boolean,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const client = getClient();
  const session = await getSession();
  if (!client || !session) return { ok: false, reason: 'Sign in to flag content.' };

  const { error } = await client
    .from('content_warning_votes')
    .upsert(
      { user_id: session.user.id, title_id: titleId, warning, present },
      { onConflict: 'user_id,title_id,warning' },
    );

  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/** Withdraw a vote entirely, which is different from voting "no". */
export async function clearContentWarningVote(
  titleId: string,
  warning: ContentWarningId,
): Promise<void> {
  const client = getClient();
  const session = await getSession();
  if (!client || !session) return;

  await client
    .from('content_warning_votes')
    .delete()
    .eq('user_id', session.user.id)
    .eq('title_id', titleId)
    .eq('warning', warning);
}
