-- User lists.
--
-- Mixed film and television in one list, which r/Simkl called a "severe unmet need".
-- We are unified from the start, whereas Letterboxd is bolting TV onto a film product
-- and Simkl keeps the two apart — so this costs us nothing and is awkward for both.

create table if not exists lists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  description text check (char_length(description) <= 2000),
  is_public   boolean not null default false,
  -- Manual ordering was requested on r/Letterboxd; a sparse rank leaves room to
  -- reorder without rewriting every row.
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  deleted     boolean not null default false
);
create index if not exists lists_user on lists (user_id) where not deleted;

create table if not exists list_items (
  list_id    uuid not null references lists(id) on delete cascade,
  title_id   text not null,
  kind       text not null check (kind in ('show', 'film')),
  note       text check (char_length(note) <= 1000),
  rank       int not null default 0,
  added_at   timestamptz not null default now(),
  primary key (list_id, title_id)
);
create index if not exists list_items_order on list_items (list_id, rank, added_at);

alter table lists      enable row level security;
alter table list_items enable row level security;

-- Your own lists always; other people's only when published and not blocked.
drop policy if exists lists_select on lists;
create policy lists_select on lists for select
  using (
    not deleted
    and (user_id = auth.uid() or (is_public and not is_blocked(user_id)))
  );

drop policy if exists lists_write on lists;
create policy lists_write on lists for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Items inherit their list's visibility. Expressing it as a subquery rather than
-- duplicating the rule means the two can never drift apart.
drop policy if exists list_items_select on list_items;
create policy list_items_select on list_items for select
  using (
    exists (
      select 1 from lists l
      where l.id = list_items.list_id
        and not l.deleted
        and (l.user_id = auth.uid() or (l.is_public and not is_blocked(l.user_id)))
    )
  );

drop policy if exists list_items_write on list_items;
create policy list_items_write on list_items for all
  using (exists (select 1 from lists l where l.id = list_items.list_id and l.user_id = auth.uid()))
  with check (exists (select 1 from lists l where l.id = list_items.list_id and l.user_id = auth.uid()));
