/**
 * Deploy supabase/functions/* over HTTPS via the Management API.
 *
 * Exists for the same reason as apply-migrations.mjs: the Supabase CLI wants Docker
 * and a database connection this environment cannot make. The Management API needs
 * only outbound HTTPS.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=abc node scripts/deploy-functions.mjs
 *
 * Add --secrets to also push VAPID_*, CRON_SECRET and friends from the environment.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;

if (!token?.startsWith('sbp_') || !ref) {
  console.error(
    'Set SUPABASE_ACCESS_TOKEN (a personal access token from\n' +
      'https://supabase.com/dashboard/account/tokens) and SUPABASE_PROJECT_REF.',
  );
  process.exit(2);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'functions');

/**
 * Functions called by pg_cron, which cannot present a user JWT, so they authenticate
 * with a shared secret of their own instead. Everything else verifies the caller's
 * token the normal way.
 *
 * Both of these refuse any request without a matching `x-cron-secret`, so skipping JWT
 * verification does not make them openly callable — it swaps one credential for another
 * that a scheduler can actually supply.
 */
const NO_JWT = new Set(['send-notifications', 'promote-fingerprint']);

async function api(path, init = {}) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : undefined;
}

/**
 * Specifiers Deno resolves for itself and a bundler must not touch.
 *
 * `jsr:` and `npm:` are fetched by the edge runtime at deploy time; inlining them would
 * mean shipping a copy of the Supabase client with every function, and `node:` builtins
 * cannot be bundled at all.
 */
const RUNTIME_SPECIFIERS = ['jsr:*', 'npm:*', 'node:*', 'https://*', 'http://*'];

/**
 * Flatten a function to a single file before uploading.
 *
 * The Management API is not a bundler — it takes the files it is handed and puts them
 * on the edge. A function importing anything outside its own directory therefore
 * deploys successfully and then fails at runtime on the first request, which is a
 * miserable way to find out. `promote-fingerprint` imports the matcher from
 * `@reviewies/core`, deliberately: the alternative is a second copy of the matcher on
 * the server, which is how a server and a client come to disagree about what a
 * fingerprint means.
 */
async function bundle(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'esnext',
    external: RUNTIME_SPECIFIERS,
    write: false,
    // The core is written for bundlers that resolve extensionless relative imports,
    // which is every bundler this repository already uses.
    resolveExtensions: ['.ts', '.js', '.mjs'],
  });
  return result.outputFiles[0].text;
}

async function deploy(slug) {
  const dir = join(root, slug);
  const files = readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile());

  const form = new FormData();
  form.append(
    'metadata',
    JSON.stringify({ name: slug, entrypoint_path: 'index.ts', verify_jwt: !NO_JWT.has(slug) }),
  );

  const bundled = await bundle(join(dir, 'index.ts'));
  form.append('file', new File([bundled], 'index.ts', { type: 'application/typescript' }));

  // Anything else in the directory rides along unbundled — config the runtime reads
  // rather than code the entrypoint imports.
  for (const file of files.filter((f) => f !== 'index.ts')) {
    form.append(
      'file',
      new File([readFileSync(join(dir, file))], file, { type: 'application/typescript' }),
    );
  }

  const result = await api(`/functions/deploy?slug=${encodeURIComponent(slug)}`, {
    method: 'POST',
    body: form,
  });
  console.log(`deployed ${slug} (v${result.version}, verify_jwt=${result.verify_jwt})`);
}

async function pushSecrets() {
  const names = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'CRON_SECRET'];
  const secrets = names
    .filter((name) => process.env[name])
    .map((name) => ({ name, value: process.env[name] }));

  if (secrets.length === 0) {
    console.log('no secrets in the environment to push');
    return;
  }
  await api('/secrets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(secrets),
  });
  // Values are never printed: this output ends up in terminals and logs.
  console.log(`set ${secrets.length} secret(s): ${secrets.map((s) => s.name).join(', ')}`);
}

const slugs = readdirSync(root).filter((f) => statSync(join(root, f)).isDirectory());
if (slugs.length === 0) {
  console.error('No functions found in', root);
  process.exit(1);
}

if (process.argv.includes('--secrets')) await pushSecrets();
for (const slug of slugs) await deploy(slug);

const live = await api('/functions');
console.log(`\n${live.length} function(s) live: ${live.map((f) => f.slug).join(', ')}`);
