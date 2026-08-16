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
