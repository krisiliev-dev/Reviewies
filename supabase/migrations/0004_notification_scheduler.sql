-- Populate the notification queue from upcoming episodes, and run the sender.
--
-- Deliberately server-side: a client-scheduled notification only fires when the app
-- happens to be open, which defeats the purpose of telling you an episode aired.

-- Episodes the server knows are coming. The client owns metadata caching, so this
-- is a thin mirror of just what scheduling needs — populated by the client on sync
-- rather than by a server-side TMDB crawl, which the licence would not permit.
create table if not exists upcoming_episodes (
  target_id  text primary key,
  series_id  text not null,
  series_name text not null,
  season     int not null,
  number     int not null,
  name       text,
  air_date   date not null,
  kind       text not null default 'regular'
    check (kind in ('premiere', 'finale', 'series-finale', 'regular')),
  updated_at timestamptz not null default now()
);
create index if not exists upcoming_episodes_air_date on upcoming_episodes (air_date);

alter table upcoming_episodes enable row level security;

-- Readable by anyone signed in; only the service role writes. This holds no personal
-- data — it is broadcast schedule information.
drop policy if exists upcoming_episodes_select on upcoming_episodes;
create policy upcoming_episodes_select on upcoming_episodes for select
  using (auth.uid() is not null);

/**
 * Queue notifications for episodes airing today, for everyone tracking the show.
 *
 * Respects each user's granularity, skips anything they have already watched, and
 * relies on the queue's unique (user_id, target_id) constraint so repeat runs are
 * harmless.
 */
create or replace function queue_todays_notifications()
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
  where ue.air_date = current_date
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

revoke all on function queue_todays_notifications() from public;
