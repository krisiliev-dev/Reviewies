-- Add the sync clock to `reactions`.
--
-- Every replicated table needs `updated_at`: the pull query filters on it and
-- last-write-wins uses it to order conflicting writes. `reactions` was created
-- without one, so syncing reactions failed with "column reactions.updated_at does
-- not exist" — caught by a live round-trip against a real project, which the
-- in-memory and PGlite tests could not reach.
--
-- Idempotent, so it is a no-op on databases created from the corrected 0001.

alter table reactions add column if not exists updated_at timestamptz not null default now();
create index if not exists reactions_updated on reactions (updated_at);
