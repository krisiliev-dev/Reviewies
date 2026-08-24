-- Let you see the profiles of people you blocked.
--
-- `profiles_select` in migration 0001 hid every blocked account, and `is_blocked` is
-- symmetric — so blocking someone also hid them from you. That is right for search and
-- for comments, and wrong for one screen: the block list itself, which would render as
-- a column of UUIDs with no way to tell who they were or to undo anything.
--
-- The extra clause is deliberately one-directional. It reveals accounts *you* blocked,
-- to you. Someone who blocked you stays hidden, and you stay hidden from them.

drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select
  using (
    id = auth.uid()
    or not is_blocked(id)
    or exists (
      select 1 from blocks b
      where b.user_id = auth.uid() and b.blocked_id = profiles.id
    )
  );
