-- Crowd-sourced fingerprint reference timelines.
--
-- One reference per episode per audio track. Contributions come from users who synced
-- manually and opted in; only hashes are stored, never audio, because a landmark hash
-- is a one-way digest rather than a reproduction of the work.
--
-- Contributions are held separately from the accepted reference so they can be
-- cross-validated before anyone relies on them. A single bad contribution would
-- misplace every later viewer's reactions, which is a much worse failure than having
-- no reference at all.

create table if not exists fingerprint_contributions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  target_id    text not null,
  -- Distinguishes dubs, director's cuts and regional audio, which do not match
  -- each other even for the same episode.
  audio_track  text not null default 'default',
  -- Packed pairs of (hash, frame) as uint32, base64-encoded.
  hashes       text not null,
  frame_count  int not null check (frame_count > 0),
  hop_size     int not null default 512,
  sample_rate  int not null default 22050,
  created_at   timestamptz not null default now(),
  -- One contribution per user per episode per track: repeated attempts replace
  -- rather than stack, so one enthusiastic user cannot outvote everyone else.
  unique (user_id, target_id, audio_track)
);
create index if not exists fingerprint_contributions_target
  on fingerprint_contributions (target_id, audio_track);

-- The accepted reference, promoted once enough contributions agree.
create table if not exists fingerprint_references (
  target_id      text not null,
  audio_track    text not null default 'default',
  hashes         text not null,
  frame_count    int not null check (frame_count > 0),
  hop_size       int not null default 512,
  sample_rate    int not null default 22050,
  -- How many contributions agreed. Below the threshold this stays unpublished.
  agreement      int not null default 1,
  updated_at     timestamptz not null default now(),
  primary key (target_id, audio_track)
);

alter table fingerprint_contributions enable row level security;
alter table fingerprint_references    enable row level security;

-- You may add and replace your own contribution, and see what you contributed.
-- You may not read anyone else's: a raw unvalidated timeline is exactly what a
-- malicious client would want in order to forge agreement.
drop policy if exists fingerprint_contributions_own on fingerprint_contributions;
create policy fingerprint_contributions_own on fingerprint_contributions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Accepted references are readable by anyone signed in — they are what makes
-- automatic sync work — but only the service role promotes them.
drop policy if exists fingerprint_references_select on fingerprint_references;
create policy fingerprint_references_select on fingerprint_references for select
  using (auth.uid() is not null);

/**
 * Promote contributions into a reference once enough of them agree.
 *
 * Agreement is deliberately crude: contributions whose frame counts fall within a
 * tolerance of each other are treated as describing the same audio. Comparing the
 * hashes themselves would be better and is far more expensive; this is enough to stop
 * an obviously mistimed or wrong-episode contribution being promoted.
 */
create or replace function promote_fingerprint(p_target text, p_track text default 'default')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  required constant int := 2;
  tolerance constant numeric := 0.02;
  chosen fingerprint_contributions%rowtype;
  agree_count int;
begin
  -- The earliest contribution is the candidate; later ones vote on it.
  select * into chosen
  from fingerprint_contributions
  where target_id = p_target and audio_track = p_track
  order by created_at
  limit 1;

  if not found then
    return false;
  end if;

  select count(*) into agree_count
  from fingerprint_contributions c
  where c.target_id = p_target
    and c.audio_track = p_track
    and abs(c.frame_count - chosen.frame_count) <= greatest(1, chosen.frame_count * tolerance);

  if agree_count < required then
    return false;
  end if;

  insert into fingerprint_references (
    target_id, audio_track, hashes, frame_count, hop_size, sample_rate, agreement, updated_at
  )
  values (
    p_target, p_track, chosen.hashes, chosen.frame_count,
    chosen.hop_size, chosen.sample_rate, agree_count, now()
  )
  on conflict (target_id, audio_track) do update
    set hashes = excluded.hashes,
        frame_count = excluded.frame_count,
        agreement = excluded.agreement,
        updated_at = now()
    -- Never replace a better-supported reference with a weaker one.
    where fingerprint_references.agreement <= excluded.agreement;

  return true;
end;
$$;

revoke all on function promote_fingerprint(text, text) from public;
