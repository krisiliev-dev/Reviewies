-- Screenshots in comments.
--
-- Doc 8 §4: this is what people say they miss most about TV Time's comment sections.
-- "The comments section doesn't have the ability to add screen grabs of interesting
-- scenes that TV Time commenters loved doing, it added to the conversation."
--
-- `comments.image_url` has existed since migration 0001, is rendered, and is already
-- exempted from the effort filter — the only missing piece was somewhere to put the
-- file. This adds that bucket and the policies around it.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comment-images',
  'comment-images',
  -- Public reads. A comment image is only reachable by someone who already knows the
  -- URL, and the URL only appears on a comment that the spoiler gate has already
  -- decided you may see. Signed URLs would expire and break old comments.
  true,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table storage.objects enable row level security;

-- Uploads go to <user-id>/<file>, and the policy is what makes that layout mean
-- something: you can only write under your own ID, so one user cannot overwrite or
-- delete another's screenshots.
drop policy if exists comment_images_insert on storage.objects;
create policy comment_images_insert on storage.objects for insert
  with check (
    bucket_id = 'comment-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists comment_images_delete on storage.objects;
create policy comment_images_delete on storage.objects for delete
  using (
    bucket_id = 'comment-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists comment_images_select on storage.objects;
create policy comment_images_select on storage.objects for select
  using (bucket_id = 'comment-images');
