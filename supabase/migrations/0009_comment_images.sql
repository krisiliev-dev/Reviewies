-- Screenshots in comments: the storage bucket.
--
-- Doc 8 §4: this is what people say they miss most about TV Time's comment sections.
-- "The comments section doesn't have the ability to add screen grabs of interesting
-- scenes that TV Time commenters loved doing, it added to the conversation."
--
-- `comments.image_url` has existed since migration 0001, is rendered, and is already
-- exempted from the effort filter. The only missing piece was somewhere to put the
-- file.
--
-- ## Why there are no policies here
--
-- An earlier version of this migration enabled row-level security on
-- `storage.objects` and added three policies confining writes to `<user-id>/`. It
-- cannot be applied. On this project `storage.objects` is owned by
-- `supabase_storage_admin`, RLS is already enabled on it, and the `postgres` role the
-- Management API and the SQL editor both run as is not a member of that role and
-- cannot become one:
--
--   ERROR: 42501: must be owner of table objects
--
-- That is a platform constraint, not a missing grant, so no amount of SQL gets round
-- it. Uploads therefore do not go direct from the browser at all: they go through the
-- `upload-comment-image` edge function, which runs with the service role, verifies the
-- caller's JWT, and enforces size, type and path itself.
--
-- This ended up better than the policy version rather than merely equivalent. Limits
-- are checked before any bytes are stored rather than as a rejection afterwards, the
-- browser never holds write access to storage at all, and the rules live in code that
-- can be tested instead of in a policy expression that cannot.
--
-- Reads need no policy: the bucket is public, and a public bucket is served over a
-- route that does not apply RLS. A comment image is only reachable by someone who
-- already has its URL, and that URL only ever appears on a comment the spoiler gate
-- has already decided they may see.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comment-images',
  'comment-images',
  true,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
