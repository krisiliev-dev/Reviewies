-- Community-voted content warnings.
--
-- From research doc 4: people asked for something like doesthedogdie, where the
-- community flags what a title contains so you can decide before watching rather
-- than after.
--
-- Votes are per user so nobody can stuff the ballot, and the aggregate is what gets
-- displayed. Warnings are advisory, never a gate: the point is to inform a choice,
-- not to hide things from adults.

create table if not exists content_warning_votes (
  user_id    uuid not null references profiles(id) on delete cascade,
  title_id   text not null,
  -- A fixed vocabulary rather than free text: arbitrary tags would become a second,
  -- unmoderated comment field, and the whole value is in consistency.
  warning    text not null check (warning in (
    'animal-harm', 'sexual-violence', 'suicide', 'self-harm', 'child-harm',
    'graphic-violence', 'gore', 'flashing-lights', 'vomit', 'medical',
    'domestic-abuse', 'eating-disorder'
  )),
  -- true = "yes, this is in it"; false = "no, it isn't", so a wrong flag can be
  -- argued down rather than only ever accumulating.
  present    boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, title_id, warning)
);
create index if not exists content_warning_votes_title on content_warning_votes (title_id);

alter table content_warning_votes enable row level security;

-- Everyone signed in can read the votes, because the aggregate is the product.
-- Rows carry a user_id, so this does reveal who flagged what — acceptable for a
-- factual "is X in this" signal, and it is what makes vote-stuffing visible.
drop policy if exists content_warning_votes_select on content_warning_votes;
create policy content_warning_votes_select on content_warning_votes for select
  using (auth.uid() is not null and not is_blocked(user_id));

drop policy if exists content_warning_votes_write on content_warning_votes;
create policy content_warning_votes_write on content_warning_votes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

/**
 * Aggregate votes for a title.
 *
 * Returns the net position for each warning anyone has voted on. The UI decides what
 * to surface; this deliberately does not filter, so a contested warning stays visible
 * as contested rather than silently disappearing.
 */
create or replace function content_warnings(p_title text)
returns table (warning text, yes_votes bigint, no_votes bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.warning,
    count(*) filter (where v.present) as yes_votes,
    count(*) filter (where not v.present) as no_votes
  from content_warning_votes v
  where v.title_id = p_title
  group by v.warning
  order by count(*) filter (where v.present) desc;
$$;
