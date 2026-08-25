# Backend

Postgres schema, row-level security, and the push notification sender.

## Applying migrations

```bash
SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=... node ../scripts/apply-migrations.mjs
```

The token is a **personal access token** from
[supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens),
not a project API key — project keys cannot run DDL. Migrations are idempotent, so
re-running is safe. Pasting them into the dashboard's SQL Editor works too.

Applying also records each file, with a hash of its contents, in a `schema_migrations`
table. Nothing here needs that to decide what to run — the migrations are idempotent — but
it is what makes `npm run whats-live` able to answer whether the deployed schema matches
the repository, which was unanswerable before and stayed unasked for weeks.

### What each one does

Listed because "the schema is deployed" is not a fact anyone can check by looking, and
the answer matters: the app assumes functions that arrive in specific migrations. A test
asserts every file here is named below, so this table cannot silently fall behind the
directory.

| Migration | Adds |
|---|---|
| `0001_init.sql` | Every table, row-level security on all of them, spoiler-gated comments |
| `0002_reactions_updated_at.sql` | The sync clock on reactions, separately so 0001 stays re-runnable |
| `0003_push_notifications.sql` | Subscriptions, preferences, the delivery queue |
| `0004_notification_scheduler.sql` | `queue_todays_notifications()` |
| `0005_fingerprint_references.sql` | Contributions and accepted references for listen-to-sync |
| `0006_lists.sql` | Lists mixing film and television |
| `0007_content_warnings.sql` | Community-voted content warnings |
| `0008_visible_blocks.sql` | Blocking, enforced in the policies rather than the client |
| `0009_comment_images.sql` | The screenshot bucket (rules live in an edge function — see below) |
| `0010_promotion_by_content.sql` | Drops length-only promotion; adds `record_fingerprint_reference` |
| `0011_reaction_sampling.sql` | `reactions_sample`, so a busy episode returns a spread rather than its first minutes |
| `0012_expo_push_tokens.sql` | `push_tokens`, so a phone can be notified at all — Web Push cannot reach one |

## Push notifications

Delivery needs three things beyond the schema.

**1. VAPID keys.** Generate a pair:

```bash
npx web-push generate-vapid-keys
```

Put the public key in `app/.env` as `VITE_VAPID_PUBLIC_KEY` — it is the public half and
ships in the client bundle by design. Keep the private key server-side only.

**2. Deploy the sender.**

```bash
supabase functions deploy send-notifications --no-verify-jwt
supabase secrets set \
  VAPID_PUBLIC_KEY=... \
  VAPID_PRIVATE_KEY=... \
  VAPID_SUBJECT=mailto:you@example.com \
  CRON_SECRET=$(openssl rand -hex 32)
```

`--no-verify-jwt` is needed because pg_cron calls it without a user session. The
function refuses any request lacking the matching `x-cron-secret` header, so it is not
openly callable.

**3. Schedule it.** In the SQL Editor:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Queue the day's notifications each morning.
select cron.schedule(
  'queue-notifications', '0 8 * * *',
  $$ select queue_todays_notifications() $$
);

-- Drain the queue every fifteen minutes.
select cron.schedule(
  'send-notifications', '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/send-notifications',
    headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>')
  )
  $$
);
```

## Screenshots in comments

Migration `0009_comment_images.sql` creates the bucket and nothing else, and the file
says at length why. `storage.objects` is owned by `supabase_storage_admin`; the
`postgres` role a migration runs as cannot create policies on it and cannot `set role`
to something that can. So the rules that would normally be row-level security — who may
upload, where their files land, what sizes and types are allowed — live in the
`upload-comment-image` function instead.

It holds the service role, so it verifies the caller's JWT itself and derives the storage
path from the *verified* user id rather than from anything the request asked for. A
caller cannot file an image under someone else's name, because the name is never taken
from the caller.

```bash
SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=... node ../scripts/deploy-functions.mjs
```

It is the one function deployed *with* JWT verification on: unlike the two below, it is
called by people rather than by a schedule.

## Promoting fingerprint references

Contributed timelines are cross-validated before any client relies on one. The check
locates each contribution inside the others and requires them to agree on where the
audio sits in the episode — which needs the matcher, which is TypeScript, so it runs in
an edge function rather than in SQL.

```bash
SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=... node ../scripts/deploy-functions.mjs
```

That script bundles each function before uploading. It has to: `promote-fingerprint`
imports the matcher from `@reviewies/core`, and the Management API is not a bundler — it
puts the files it is handed on the edge, so a function importing anything outside its own
directory would deploy successfully and fail on its first request. Sharing the matcher
rather than copying it is the point; a server and a client that disagree about what a
fingerprint means produce references that silently never match.

Schedule it alongside the sender:

```sql
select cron.schedule(
  'promote-fingerprints', '23 * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/promote-fingerprint',
    headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>')
  )
  $$
);
```

Like the sender it is deployed with JWT verification off, because pg_cron cannot present
a user session, and it refuses anything without the matching `x-cron-secret`. Until it
runs, nothing is promoted at all — which is the intended direction to fail in. No
reference means Watching Mode falls back to syncing by hand, which works; a wrong
reference means everyone is confidently wrong.

## How sending behaves

- **Idempotent.** A row is claimed by stamping `sent_at` before dispatch, so two
  overlapping runs cannot double-send. The queue's unique `(user_id, target_id)` means
  re-running the scheduler is harmless.
- **Granularity is enforced twice** — once when queueing and again before sending —
  so a stale client setting cannot cost a delivery.
- **Dead subscriptions are pruned.** A 404 or 410 from the push service marks the
  subscription expired rather than retrying forever.
- **Nothing already watched is announced.**

## Testing

Row-level security and the scheduler are tested against real Postgres (PGlite) using
the exact migration SQL that gets deployed:

```bash
cd ../app && npx vitest run src/backend/schema.test.ts
```

Tests run as an unprivileged role, because Postgres bypasses RLS for superusers and
table owners — testing as the owner would make every assertion pass vacuously.
