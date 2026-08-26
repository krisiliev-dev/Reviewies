-- Stop one device's wrong clock from costing everybody else their sync.
--
-- Research doc 9 §6.67. Every syncable row carries `updated_at`, and `updated_at` was
-- whatever number the client wrote — the engine sends it, the upsert stores it, and
-- nothing compared it to anything. A phone a week fast (a dead coin cell, a bad NTP
-- server, a date set by hand to unlock a trial) therefore did two things, both silent:
--
--   1. Stamped every row it touched a week ahead, so no other device — and not the
--      person themselves — could overwrite one until the real clock caught up.
--   2. Moved *other* devices' pull cursors a week into the future, because the cursor
--      was the newest `updated_at` seen. Each of them then asked for everything later
--      than that and received nothing. For a week.
--
-- Two columns with two different jobs, which is what was missing:
--
--   `updated_at`  — when the device says the change happened. Still the client's, so
--                   that two devices editing offline resolve in the order the person
--                   actually did things. Clamped so it can never be in the future.
--   `synced_at`   — when this server learned of it. Entirely the server's, never
--                   accepted from a client, and what the pull cursor now reads.
--
-- The cursor being server-assigned is the important half. It makes paging correct no
-- matter what any device believes the time is, and it fixes the opposite failure too: a
-- phone a week *slow* used to push rows stamped a week ago, which every other device's
-- cursor had already passed — the row arrived and nobody ever saw it.

alter table watches   add column if not exists synced_at timestamptz not null default now();
alter table ratings   add column if not exists synced_at timestamptz not null default now();
alter table watchlist add column if not exists synced_at timestamptz not null default now();
alter table library   add column if not exists synced_at timestamptz not null default now();
alter table reactions add column if not exists synced_at timestamptz not null default now();

-- Paging is keyset — (synced_at, id) — so the index has to carry both, and `user_id`
-- first because every pull is scoped to one person.
create index if not exists watches_user_synced   on watches   (user_id, synced_at, id);
create index if not exists ratings_user_synced   on ratings   (user_id, synced_at, target_id);
create index if not exists watchlist_user_synced on watchlist (user_id, synced_at, title_id);
create index if not exists library_user_synced   on library   (user_id, synced_at, title_id);
create index if not exists reactions_synced      on reactions (synced_at, id);

/**
 * Assign `synced_at`, and refuse a future `updated_at`.
 *
 * `least(..., now())` rather than a rejection: a person whose clock is wrong has done
 * nothing wrong, and losing their write would be a worse answer than dating it slightly
 * early. Past timestamps are left alone on purpose — a genuinely offline device coming
 * back after a week is telling the truth about when the edit happened, and that is the
 * ordering `updated_at` exists to carry.
 */
create or replace function stamp_sync_columns()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := least(coalesce(new.updated_at, now()), now());

  -- An older write must not overwrite a newer one. Returning null from a BEFORE UPDATE
  -- row trigger skips the row entirely, so `synced_at` is not touched either — nothing
  -- changed, and no other device is woken to fetch a row that did not move.
  --
  -- This was assumed everywhere and implemented nowhere. `MemoryBackend` compares
  -- timestamps on push and its comment says it "implements the same last-write-wins
  -- semantics the real server must"; the real server did a plain upsert, so whoever
  -- pushed last won regardless of when they actually made the change. Two devices
  -- offline for a week resolved by who happened to reconnect second. §6.67.
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;

  new.synced_at := now();
  return new;
end;
$$;

drop trigger if exists watches_stamp_sync on watches;
create trigger watches_stamp_sync before insert or update on watches
  for each row execute function stamp_sync_columns();

drop trigger if exists ratings_stamp_sync on ratings;
create trigger ratings_stamp_sync before insert or update on ratings
  for each row execute function stamp_sync_columns();

drop trigger if exists watchlist_stamp_sync on watchlist;
create trigger watchlist_stamp_sync before insert or update on watchlist
  for each row execute function stamp_sync_columns();

drop trigger if exists library_stamp_sync on library;
create trigger library_stamp_sync before insert or update on library
  for each row execute function stamp_sync_columns();

drop trigger if exists reactions_stamp_sync on reactions;
create trigger reactions_stamp_sync before insert or update on reactions
  for each row execute function stamp_sync_columns();
