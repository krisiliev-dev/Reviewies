-- Reactions spread across an episode, rather than the first N of them.
--
-- The client asked for reactions ordered by timestamp with a limit of two thousand.
-- On an episode with more than that, it got the earliest two thousand: a flurry through
-- the opening minutes and silence for the rest of the hour. Which is precisely backwards
-- — the episodes that exceed the limit are the popular ones, and those are the episodes
-- where watching along with everyone else is worth doing at all.
--
-- The fix is to sample rather than truncate. Reactions are bucketed by time, the
-- liveliest few in each bucket are kept, and if the overall cap still bites it takes the
-- least important reaction from every bucket rather than the whole back half of the
-- episode. Density degrades; coverage does not.
--
-- SECURITY INVOKER — the default, stated here because it is load-bearing rather than
-- incidental. `reactions_select` hides deleted rows and anyone the viewer has blocked or
-- been blocked by. A SECURITY DEFINER function would run as the owner, bypass that
-- policy, and quietly hand back reactions from people the viewer has blocked.

/**
 * A representative sample of an episode's reactions.
 *
 * `p_bucket_ms` and `p_per_bucket` together set the maximum density. The defaults are
 * ten reactions per ten seconds, which is sixty a minute — exactly the top setting of
 * the density control in Watching Mode, so the client can thin what it receives but
 * never has to ask for more.
 */
create or replace function reactions_sample(
  p_target     text,
  p_bucket_ms  int default 10000,
  p_per_bucket int default 10,
  p_limit      int default 2000
)
returns table (
  id         uuid,
  user_id    uuid,
  target_id  text,
  t_ms       int,
  emoji      text,
  created_at timestamptz
)
language sql
stable
as $$
  with ranked as (
    select
      r.id, r.user_id, r.target_id, r.t_ms, r.emoji, r.created_at,
      (r.t_ms / greatest(1, p_bucket_ms))::bigint as bucket,
      row_number() over (
        partition by r.t_ms / greatest(1, p_bucket_ms)
        -- Newest first within a bucket, so a sample of a busy moment is the current
        -- conversation rather than whatever was posted the day it aired. `id` only
        -- breaks ties, so the result is stable across calls.
        order by r.created_at desc, r.id
      ) as bucket_rank
    from reactions r
    where r.target_id = p_target and not r.deleted
  ),
  capped as (
    select * from ranked
    where bucket_rank <= greatest(1, p_per_bucket)
    -- Rank first, so cutting takes the tenth reaction from every bucket before it takes
    -- the ninth from any. Then a scatter, not the clock: ordering by time inside a rank
    -- would reinstate the original bug one level up, keeping every bucket from the first
    -- twenty minutes and none after. A multiplicative hash of the bucket index puts the
    -- survivors all over the episode, and being a pure function of the index it gives
    -- the same answer every call.
    order by bucket_rank, (bucket * 2654435761) % 1000003
    limit greatest(1, p_limit)
  )
  select id, user_id, target_id, t_ms, emoji, created_at
  from capped
  order by t_ms;
$$;

-- Execute stays granted to PUBLIC, as it is for any new function. That is safe here
-- precisely because the function is SECURITY INVOKER: it can return nothing its caller
-- could not already have selected directly.
