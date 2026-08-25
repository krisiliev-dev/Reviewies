-- Local test shim. NOT part of the deployed schema.
--
-- Supabase provides `auth.uid()`, reading the subject claim from the request JWT.
-- Locally we provide the same function backed by a session setting, so the
-- migration SQL under test is byte-for-byte what would be deployed.

create schema if not exists auth;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid;
$$;

-- A deliberately unprivileged role.
--
-- This matters: Postgres bypasses row-level security for superusers and, unless
-- FORCE is set, for table owners. Running these tests as the owner would make every
-- policy assertion pass vacuously and prove nothing. Everything below runs as
-- app_user, which is neither.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user nologin;
  end if;
end
$$;

grant usage on schema public, auth to app_user;
grant execute on all functions in schema auth to app_user;
grant execute on all functions in schema public to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;

-- The roles Supabase provides, which migrations grant to by name.
--
-- Nothing here runs as them — app_user is still what the policy tests use, because it
-- is unprivileged in the way that makes RLS assertions mean something. They exist so
-- that a migration granting execute to `service_role` is exercised rather than skipped,
-- and so a typo in one of those names fails here instead of at deploy time.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end
$$;

-- Minimal stand-in for Supabase Storage.
--
-- Storage is a real Postgres schema in Supabase: `storage.buckets` and
-- `storage.objects`, with row-level security on objects like any other table. That is
-- what makes the migration's storage policies testable here rather than only in
-- production. Only the columns and the one helper the policies actually reference are
-- reproduced; this is a test double, not an emulation.
create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id       uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id),
  name     text not null,
  owner    uuid,
  unique (bucket_id, name)
);

-- Splits an object name on "/", the way Supabase's own helper does. The policies use
-- it to read the owning user's ID out of the first path segment.
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select string_to_array(name, '/');
$$;

grant usage on schema storage to app_user;
grant select, insert, update, delete on all tables in schema storage to app_user;
grant execute on all functions in schema storage to app_user;
