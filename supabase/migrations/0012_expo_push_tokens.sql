-- Push notifications for the phone.
--
-- The web receives notifications through Web Push: a browser hands back an endpoint URL
-- and two encryption keys, and the sender encrypts a payload to them. A phone cannot use
-- any of that. iOS and Android deliver through APNs and FCM, and an Expo app reaches
-- both through Expo's push service using an opaque token.
--
-- So this is a second table rather than more columns on `push_subscriptions`. The two
-- describe genuinely different things — a Web Push subscription is an endpoint plus a
-- keypair, an Expo token is a string — and modelling them as one row with half its
-- columns null each time would mean every reader has to work out which kind it is
-- holding.
--
-- The phone has offered notification granularity settings since it shipped and had
-- nothing that could ever act on them. This is the half of the fix that can be built
-- and tested away from a device; acquiring a token cannot.

create table if not exists push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  -- `ExponentPushToken[…]`, opaque and device-specific.
  token      text not null,
  platform   text not null check (platform in ('ios', 'android')),
  -- Useful when someone wonders why a particular phone stopped being notified.
  device     text,
  created_at timestamptz not null default now(),
  -- Set when Expo reports the token is dead, so we stop trying without deleting the
  -- row mid-send. Same shape as `push_subscriptions.expired_at`, for the same reason.
  expired_at timestamptz,
  unique (user_id, token)
);
create index if not exists push_tokens_user on push_tokens (user_id) where expired_at is null;

alter table push_tokens enable row level security;

-- Your own tokens and nobody else's. A token is a capability: anyone holding one can
-- send a notification to that device through Expo, so this is not merely private data.
drop policy if exists push_tokens_all on push_tokens;
create policy push_tokens_all on push_tokens for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
