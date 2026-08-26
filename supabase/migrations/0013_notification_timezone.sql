-- Notify people on *their* today, not UTC's.
--
-- `queue_todays_notifications` compared an episode's air date against `current_date`,
-- which on Supabase is UTC. So "S2E4 airs today" was sent on UTC's today for everybody:
-- fourteen hours into the day for somebody in Kiritimati, and ten hours before their day
-- began for somebody in Honolulu — who would be told an episode airs today, on the
-- evening of the day before. Research doc 9 §6.66.
--
-- The fix needs to know where a person is. The client already writes one row about
-- notifications and now writes the timezone into it; anybody who has not touched the
-- setting since this shipped falls back to UTC, which is exactly what they had before.

alter table notification_preferences
  add column if not exists time_zone text not null default 'UTC';

-- A name rather than an offset, because an offset is wrong for half the year anywhere
-- that observes daylight saving. Postgres resolves the name against the date, so
-- 'Europe/London' means +0 in January and +1 in July without the client re-reporting.
comment on column notification_preferences.time_zone is
  'IANA timezone of the device that last changed this setting. Used to decide which day '
  'is "today" for this person. Defaults to UTC, which is what everyone had before.';

create or replace function queue_todays_notifications(local_hour_from int default 8)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer;
begin
  insert into notification_queue (user_id, target_id, title, body, url, kind)
  select
    lib.user_id,
    ue.target_id,
    ue.series_name,
    case
      when ue.kind = 'premiere' then 'Season ' || ue.season || ' starts today'
      when ue.kind = 'finale' then 'Season finale airs today'
      when ue.kind = 'series-finale' then 'The final episode airs today'
      else 'S' || ue.season || 'E' || ue.number || ' airs today'
    end,
    '/title/' || lib.title_id,
    ue.kind
  from upcoming_episodes ue
  join library lib
    on lib.title_id = ue.series_id
   and lib.status = 'watching'
   and not lib.deleted
  left join notification_preferences np on np.user_id = lib.user_id
  -- The person's today. An unknown timezone means UTC, the previous behaviour.
  where ue.air_date = (now() at time zone coalesce(np.time_zone, 'UTC'))::date
    -- ...and not before breakfast where they are. A once-a-day run at a fixed UTC hour
    -- is the right hour in exactly one timezone; run this hourly instead and each
    -- person is queued when their own morning reaches 8am. The queue's unique
    -- (user_id, target_id) makes the other twenty-three runs harmless.
    and extract(hour from (now() at time zone coalesce(np.time_zone, 'UTC'))) >= local_hour_from
    -- Granularity, applied before anything is queued.
    and coalesce(np.preference, 'milestones') <> 'off'
    and (coalesce(np.preference, 'milestones') = 'all' or ue.kind <> 'regular')
    -- Never announce something they have already seen.
    and not exists (
      select 1 from watches w
      where w.user_id = lib.user_id and w.target_id = ue.target_id and not w.deleted
    )
  on conflict (user_id, target_id) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function queue_todays_notifications(int) from public;
-- The old no-argument signature would otherwise linger beside the new one, callable
-- and out of date.
drop function if exists queue_todays_notifications();
