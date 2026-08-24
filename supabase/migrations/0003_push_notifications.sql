-- Web Push subscriptions and the queue that feeds them.
--
-- Delivering a push needs a server, which is why earlier phases deferred it. Supabase
-- edge functions are that server, so the only genuinely missing piece was the schema.
--
-- Two tables rather than one: a subscription is a device, and a queued notification is
-- an intent. Keeping them separate means a failed send can be retried, and a device
-- that has revoked permission can be pruned without losing the notification.

create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  -- The endpoint is the device identity as far as the push service is concerned.
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  -- Set when the push service reports the subscription is gone (404/410), so we
  -- stop trying without deleting the row mid-send.
  expired_at  timestamptz,
  unique (user_id, endpoint)
);
create index if not exists push_subscriptions_user on push_subscriptions (user_id) where expired_at is null;

-- What each user wants to hear about. Mirrors the client-side setting so the
-- server can filter before spending a send.
create table if not exists notification_preferences (
  user_id    uuid primary key references profiles(id) on delete cascade,
  preference text not null default 'milestones'
    check (preference in ('off', 'milestones', 'all')),
  updated_at timestamptz not null default now()
);

create table if not exists notification_queue (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  target_id    text not null,
  title        text not null,
  body         text not null,
  url          text,
  -- premiere | finale | series-finale | regular, matching the client's classifier.
  kind         text not null default 'regular',
  send_after   timestamptz not null default now(),
  sent_at      timestamptz,
  attempts     int not null default 0,
  last_error   text,
  created_at   timestamptz not null default now(),
  -- One notification per user per episode, so a re-run of the scheduler cannot
  -- send the same thing twice.
  unique (user_id, target_id)
);
create index if not exists notification_queue_pending
  on notification_queue (send_after)
  where sent_at is null;

alter table push_subscriptions      enable row level security;
alter table notification_preferences enable row level security;
alter table notification_queue       enable row level security;

-- Subscriptions and preferences belong to their owner in every direction.
drop policy if exists push_subscriptions_all on push_subscriptions;
create policy push_subscriptions_all on push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notification_preferences_all on notification_preferences;
create policy notification_preferences_all on notification_preferences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The queue is readable by its owner so the UI can show what is pending, but only
-- the service role writes to it. A client that could enqueue its own notifications
-- could enqueue them for anyone.
drop policy if exists notification_queue_select on notification_queue;
create policy notification_queue_select on notification_queue for select
  using (user_id = auth.uid());
