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
