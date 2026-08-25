/**
 * Apply supabase/migrations/*.sql to a Supabase project over HTTPS.
 *
 * Exists because the usual routes are unavailable from a locked-down environment:
 * the direct database host is IPv6-only, and the IPv4 poolers listen on 5432/6543,
 * which egress filtering commonly blocks. The Management API runs SQL over plain
 * HTTPS, so it works anywhere curl does.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=abc node scripts/apply-migrations.mjs
 *
 * SUPABASE_ACCESS_TOKEN is a *personal access token* from
 * https://supabase.com/dashboard/account/tokens — not a project API key. Project
 * keys (sb_secret_/sb_publishable_) are rejected by this API.
 *
 * Migrations are written to be idempotent (create ... if not exists), so re-running
 * is safe.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;

if (!token || !ref) {
  console.error('Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF.');
  process.exit(2);
}
if (!token.startsWith('sbp_')) {
  console.error(
    'SUPABASE_ACCESS_TOKEN must be a personal access token (sbp_...).\n' +
      'Project API keys cannot run DDL.',
  );
  process.exit(2);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

if (files.length === 0) {
  console.error('No migrations found in', dir);
  process.exit(1);
}

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * A ledger of what has been applied.
 *
 * Migrations here are idempotent, so re-running everything is safe and this is not
 * needed to decide *what* to run. It is needed to answer a question nothing could
 * answer before: whether the deployed schema matches the repository. That question went
 * unasked for weeks while the deployed web app drifted three versions behind, and the
 * reason nobody noticed is that there was no way to look.
 *
 * The hash is of the file's contents, so editing a migration after applying it shows up
 * as drift rather than as agreement — which is the case most likely to be wrong and
 * least likely to be noticed.
 */
await runSql(`
  create table if not exists schema_migrations (
    filename    text primary key,
    sha256      text not null,
    applied_at  timestamptz not null default now()
  );
  alter table schema_migrations enable row level security;
`);

const sha = (text) => createHash('sha256').update(text).digest('hex');

for (const file of files) {
  process.stdout.write(`applying ${file} ... `);
  try {
    const sql = readFileSync(join(dir, file), 'utf8');
    await runSql(sql);
    await runSql(`
      insert into schema_migrations (filename, sha256, applied_at)
      values ('${file}', '${sha(sql)}', now())
      on conflict (filename) do update
        set sha256 = excluded.sha256, applied_at = now();
    `);
    console.log('ok');
  } catch (err) {
    console.log('FAILED');
    console.error(err.message);
    process.exit(1);
  }
}

// Confirm the tables actually landed, rather than trusting a 200.
const tables = await runSql(
  `select table_name from information_schema.tables
   where table_schema = 'public' order by table_name`,
);
console.log('\npublic tables:', tables.map((r) => r.table_name).join(', '));

const rls = await runSql(
  `select relname, relrowsecurity from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname`,
);
const unprotected = rls.filter((r) => !r.relrowsecurity).map((r) => r.relname);
console.log(
  unprotected.length
    ? `\n⚠️  RLS NOT enabled on: ${unprotected.join(', ')}`
    : '\n✅ row-level security enabled on every table',
);
