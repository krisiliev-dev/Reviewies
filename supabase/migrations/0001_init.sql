-- Reviewies core schema.
--
-- Two ideas shape this file:
--
-- 1. The client is the source of truth for a user's own history. These tables are a
--    sync target and a home for the shared/social layer, not the primary store.
--    Every syncable row therefore carries `updated_at` for field-level
--    last-write-wins and a `deleted` tombstone, because a delete has to replicate
--    just like an edit.
--
-- 2. Spoiler safety is enforced by the database, not by application code. Episode
--    comments are readable only by people who have actually watched that episode.
--    Expressing that as a row-level security policy means no forgotten code path can
--    leak a plot twist.

-- gen_random_uuid() is core Postgres since 13, so no pgcrypto extension is needed.

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

create table if not exists profiles (
  id          uuid primary key,
  handle      text unique not null check (handle ~ '^[a-z0-9_]{2,30}$'),
  display_name text,
  created_at  timestamptz not null default now()
);

create table if not exists follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  followee_id uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  -- Following yourself is not meaningful and pollutes feeds.
  constraint no_self_follow check (follower_id <> followee_id)
);

create table if not exists blocks (
  user_id    uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id),
  constraint no_self_block check (user_id <> blocked_id)
);

-- ---------------------------------------------------------------------------
-- Private user data (sync target)
-- ---------------------------------------------------------------------------

-- Watching is an event, never a boolean: repeat rows for the same target are
-- rewatches, which is what makes rewatch counts possible.
create table if not exists watches (
  id          uuid primary key,
  user_id     uuid not null references profiles(id) on delete cascade,
  target_id   text not null,
  series_id   text,
  watched_at  timestamptz not null,
  runtime_min int,
  source      text not null default 'manual',
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);
create index if not exists watches_user_updated on watches (user_id, updated_at);
create index if not exists watches_user_target on watches (user_id, target_id);

create table if not exists ratings (
  user_id    uuid not null references profiles(id) on delete cascade,
  target_id  text not null,
  value      numeric(2,1) not null check (value >= 0.5 and value <= 5.0),
  rated_at   timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false,
  primary key (user_id, target_id)
);
create index if not exists ratings_user_updated on ratings (user_id, updated_at);

create table if not exists watchlist (
  user_id    uuid not null references profiles(id) on delete cascade,
  title_id   text not null,
  kind       text not null check (kind in ('show','film')),
  note       text,
  added_at   timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false,
  primary key (user_id, title_id)
);
create index if not exists watchlist_user_updated on watchlist (user_id, updated_at);

create table if not exists library (
  user_id         uuid not null references profiles(id) on delete cascade,
  title_id        text not null,
  kind            text not null check (kind in ('show','film')),
  status          text not null check (status in ('watching','completed','paused','dropped')),
  poster_override text,
  ordering        text check (ordering in ('aired','absolute')),
  added_at        timestamptz not null,
  updated_at      timestamptz not null default now(),
  deleted         boolean not null default false,
  primary key (user_id, title_id)
);
create index if not exists library_user_updated on library (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- Shared layer
-- ---------------------------------------------------------------------------

-- Reactions are deliberately world-readable.
--
-- Watching Mode replays the full reaction timeline for an episode as your clock
-- reaches each moment, so a first-time viewer must be able to fetch it *before*
-- watching — gating them the way comments are gated would leave every new viewer
-- with an empty screen and kill the feature.
--
-- The tradeoff is accepted knowingly: an emoji at 42:10 reveals that something
-- happened, but not what. Full-text comments carry real spoilers and are gated
-- properly below.
create table if not exists reactions (
  id         uuid primary key,
  user_id    uuid not null references profiles(id) on delete cascade,
  target_id  text not null,
  t_ms       int not null check (t_ms >= 0),
  emoji      text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  -- Required by sync, like every other replicated table: pull filters on
  -- updated_at, and last-write-wins needs a logical clock.
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false
);
create index if not exists reactions_target on reactions (target_id, t_ms) where not deleted;
-- The updated_at index lives in 0002, not here. On an existing database
-- `create table if not exists` above is a no-op, so the column would not yet
-- exist and this file would fail to re-run. 0002 adds column and index together,
-- idempotently, and is a no-op on a database created from this file.

create table if not exists comments (
  id         uuid primary key,
  user_id    uuid not null references profiles(id) on delete cascade,
  target_id  text not null,
  body       text not null check (char_length(body) between 1 and 4000),
  -- Screenshots in comments were core to TV Time's culture and are named
  -- repeatedly as a thing successors dropped.
  image_url  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false
);
create index if not exists comments_target on comments (target_id, created_at) where not deleted;

create table if not exists reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references profiles(id) on delete cascade,
  subject_type text not null check (subject_type in ('comment','reaction','profile')),
  subject_id   text not null,
  reason       text not null,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Has the current user watched this target? Drives spoiler gating.
create or replace function has_watched(p_target text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from watches w
    where w.user_id = auth.uid()
      and w.target_id = p_target
      and not w.deleted
  );
$$;

-- Is there a block in either direction between the current user and p_other?
-- Blocking is symmetric in effect: neither party sees the other.
create or replace function is_blocked(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from blocks b
    where (b.user_id = auth.uid() and b.blocked_id = p_other)
       or (b.user_id = p_other and b.blocked_id = auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table profiles  enable row level security;
alter table follows   enable row level security;
alter table blocks    enable row level security;
alter table watches   enable row level security;
alter table ratings   enable row level security;
alter table watchlist enable row level security;
alter table library   enable row level security;
alter table reactions enable row level security;
alter table comments  enable row level security;
alter table reports   enable row level security;

-- Profiles are public, minus anyone you have blocked or who has blocked you.
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select
  using (id = auth.uid() or not is_blocked(id));
drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles for insert
  with check (id = auth.uid());
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists follows_select on follows;
create policy follows_select on follows for select
  using (follower_id = auth.uid() or followee_id = auth.uid());
drop policy if exists follows_write on follows;
create policy follows_write on follows for all
  using (follower_id = auth.uid()) with check (follower_id = auth.uid());

drop policy if exists blocks_all on blocks;
create policy blocks_all on blocks for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Private history: owner only, in every direction.
drop policy if exists watches_all on watches;
create policy watches_all on watches for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists ratings_all on ratings;
create policy ratings_all on ratings for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists watchlist_all on watchlist;
create policy watchlist_all on watchlist for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists library_all on library;
create policy library_all on library for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Reactions: readable by all (see the note on the table), writable only by author.
drop policy if exists reactions_select on reactions;
create policy reactions_select on reactions for select
  using (not deleted and not is_blocked(user_id));
drop policy if exists reactions_insert on reactions;
create policy reactions_insert on reactions for insert
  with check (user_id = auth.uid());
drop policy if exists reactions_update on reactions;
create policy reactions_update on reactions for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Comments: spoiler-gated by construction. You may read a comment on an episode
-- only once you have watched that episode — or if you wrote it yourself.
drop policy if exists comments_select on comments;
create policy comments_select on comments for select
  using (
    not deleted
    and not is_blocked(user_id)
    and (user_id = auth.uid() or has_watched(target_id))
  );
drop policy if exists comments_insert on comments;
create policy comments_insert on comments for insert
  -- Posting about an episode you have not watched is both a spoiler risk and
  -- almost always a mistake.
  with check (user_id = auth.uid() and has_watched(target_id));
drop policy if exists comments_update on comments;
create policy comments_update on comments for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Reports are write-only for ordinary users; only moderators (service role,
-- which bypasses RLS) read them.
drop policy if exists reports_insert on reports;
create policy reports_insert on reports for insert
  with check (reporter_id = auth.uid());
drop policy if exists reports_select on reports;
create policy reports_select on reports for select
  using (reporter_id = auth.uid());
