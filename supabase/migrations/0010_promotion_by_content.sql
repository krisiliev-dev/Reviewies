-- Promotion stops trusting frame counts.
--
-- `promote_fingerprint` decided that two contributions described the same audio if
-- their frame counts were within two percent of each other, and never looked at the
-- landmarks. The comment in 0005 said so and called it "deliberately crude", which was
-- defensible while contributions were thirty-second fragments hashed in a browser.
--
-- It is not defensible now. Two episodes of the same show are usually the same length,
-- so somebody who maps the wrong episode is corroborated by everybody who maps the
-- right one — and since the earliest contribution was always the candidate, one honest
-- mistake owned an episode permanently while every correct contribution afterwards
-- voted for it. The reference that resulted would misplace every viewer's reactions,
-- confidently, with nothing anywhere reporting a problem.
--
-- The check that replaces it locates one contribution inside another and requires them
-- to land at the same place in the episode. That needs the matcher, which is
-- TypeScript, so it lives in the `promote-fingerprint` edge function running as the
-- service role — a client cannot do it, because RLS deliberately stops anyone reading
-- someone else's raw contribution, which is exactly what forging agreement would need.
--
-- Until that function is deployed, nothing is promoted at all. That is the intended
-- failure direction: no reference means Watching Mode falls back to syncing by hand,
-- which works. A wrong reference means everyone is confidently wrong.

drop function if exists promote_fingerprint(text, text);

/**
 * Record a reference that has already been verified by content.
 *
 * Deliberately dumb: it takes a decision made elsewhere and applies the one invariant
 * that belongs in the database, which is that a reference is never replaced by a
 * less-supported one. Keeping that here rather than in the caller means it survives a
 * bug in, or a redeploy of, whatever is calling.
 *
 * Service role only. It writes the table every client reads for automatic sync, so an
 * ordinary user being able to call it would make the whole cross-validation pointless.
 */
create or replace function record_fingerprint_reference(
  p_target      text,
  p_track       text,
  p_hashes      text,
  p_frame_count int,
  p_hop_size    int,
  p_sample_rate int,
  p_agreement   int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  written int;
begin
  if p_agreement < 2 then
    raise exception 'a reference needs at least two contributors that agree, got %', p_agreement;
  end if;

  insert into fingerprint_references (
    target_id, audio_track, hashes, frame_count, hop_size, sample_rate, agreement, updated_at
  )
  values (
    p_target, p_track, p_hashes, p_frame_count, p_hop_size, p_sample_rate, p_agreement, now()
  )
  on conflict (target_id, audio_track) do update
    set hashes = excluded.hashes,
        frame_count = excluded.frame_count,
        hop_size = excluded.hop_size,
        sample_rate = excluded.sample_rate,
        agreement = excluded.agreement,
        updated_at = now()
    -- Never replace a better-supported reference with a weaker one.
    where fingerprint_references.agreement <= excluded.agreement;

  get diagnostics written = row_count;
  return written > 0;
end;
$$;

revoke all on function record_fingerprint_reference(text, text, text, int, int, int, int) from public;
revoke all on function record_fingerprint_reference(text, text, text, int, int, int, int) from anon;
revoke all on function record_fingerprint_reference(text, text, text, int, int, int, int) from authenticated;
grant execute on function record_fingerprint_reference(text, text, text, int, int, int, int) to service_role;
