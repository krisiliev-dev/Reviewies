/**
 * Compare what is deployed against what is in the repository.
 *
 * This exists because of a specific failure. The web app sat three weeks behind while
 * the backend was kept current, and nothing anywhere reported it — not because anyone
 * ignored a warning, but because there was no way to ask. A manual deployment step that
 * nobody scheduled happens once, and after that the only signal is a user noticing a bug
 * that was fixed a fortnight ago.
 *
 * Every check here answers with evidence rather than inference:
 *
 *  - the web bundle is content-hashed, so equal filenames mean equal bundles;
 *  - migrations are recorded with a hash of their contents, so an edited-after-applying
 *    file reads as drift rather than agreement;
 *  - functions are compared by slug, which at least catches one that was never deployed.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_… SUPABASE_PROJECT_REF=… node scripts/whats-live.mjs
 *
 * Exits non-zero when anything is behind, so it can gate a release.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
const site = process.env.SITE_URL ?? 'https://reviewies-beryl.vercel.app';

let behind = 0;
const say = (ok, label, detail = '') => {
  if (!ok) behind++;
  console.log(`${ok ? '✅' : '⚠️ '} ${label}${detail ? ` — ${detail}` : ''}`);
};

async function api(path) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const sql = async (query) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
};

// --- The web app ------------------------------------------------------------
console.log(`\n${site}`);
const dist = join(root, 'app', 'dist', 'assets');

if (!existsSync(dist)) {
  say(false, 'no local build to compare against', 'run: npm run build --workspace app');
} else {
  const local = readdirSync(dist).find((f) => /^index-.*\.js$/.test(f));
  try {
    const html = await fetch(site).then((r) => r.text());
    const live = html.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/)?.[1];

    say(
      live === local,
      live === local ? 'serving the current build' : 'serving an older build',
      live === local ? live : `live ${live ?? 'unknown'}, local ${local}`,
    );

    // A build older than its own sources is the state that produced the drift, and it
    // is invisible from the site alone: the deployed bundle can match a stale `dist`.
    const built = statSync(join(dist, local)).mtimeMs;
    const newest = newestSourceTime(join(root, 'app', 'src'));
    say(built >= newest, built >= newest ? 'local build is current' : 'local build is stale',
        built >= newest ? '' : 'sources changed since it was built');
  } catch (err) {
    say(false, 'could not reach the site', err.message);
  }
}

function newestSourceTime(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestSourceTime(path) : statSync(path).mtimeMs);
  }
  return newest;
}

// --- The database and its functions ------------------------------------------
if (!token || !ref) {
  console.log('\n(set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF to check the backend)');
  process.exit(behind ? 1 : 0);
}

console.log(`\nsupabase: ${ref}`);
const dir = join(root, 'supabase', 'migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

let applied = [];
try {
  applied = await sql('select filename, sha256 from schema_migrations');
} catch {
  // The ledger arrives with the migration that creates it, so its absence is itself
  // the answer rather than an error.
  say(false, 'no migration ledger', 'the project predates it — run apply-migrations.mjs');
}

if (Array.isArray(applied)) {
  const byName = new Map(applied.map((row) => [row.filename, row.sha256]));
  const missing = files.filter((f) => !byName.has(f));
  const changed = files.filter(
    (f) =>
      byName.has(f) &&
      byName.get(f) !== createHash('sha256').update(readFileSync(join(dir, f), 'utf8')).digest('hex'),
  );

  say(missing.length === 0, `${files.length} migrations`,
      missing.length ? `not applied: ${missing.join(', ')}` : 'all applied');
  if (changed.length) {
    // Worth separating: an edited migration is applied *and* wrong, which reads as
    // healthy on every other check.
    say(false, 'migrations edited since they were applied', changed.join(', '));
  }
}

const live = await api('/functions');
const slugs = new Set(live.map((f) => f.slug));
const local = readdirSync(join(root, 'supabase', 'functions'), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

const undeployed = local.filter((name) => !slugs.has(name));
say(undeployed.length === 0, `${local.length} edge functions`,
    undeployed.length ? `never deployed: ${undeployed.join(', ')}` : 'all deployed');

for (const fn of live) {
  const when = new Date(fn.updated_at ?? fn.created_at).toISOString().slice(0, 16).replace('T', ' ');
  console.log(`   ${fn.slug} v${fn.version} — ${when}`);
}

console.log(behind ? `\n${behind} thing(s) behind.` : '\nEverything deployed is current.');
process.exit(behind ? 1 : 0);
