/**
 * Build and deploy the web app, then check the site is actually serving it.
 *
 * Every step here was a step somebody had to remember, and the consequence of forgetting
 * was three weeks of a deployed app that still had the bugs fixed in the repository.
 * Documenting the procedure helped; not needing to remember it helps more.
 *
 * Two of the steps are non-obvious enough to be worth naming:
 *
 *  - **Deploying from inside the checkout fails.** Vercel attributes a CLI deployment to
 *    the git commit author, and if that address has no seat on the team the deployment
 *    is created and then BLOCKED. The CLI reports `Error: fetch failed`, from a later
 *    and unrelated attempt to stream build logs, so the message names the wrong cause
 *    entirely. Staging the built directory outside the repository avoids it, because
 *    there is no git metadata to attribute.
 *  - **The serving rules do not travel by themselves.** A prebuilt deployment ignores
 *    `buildCommand` and `outputDirectory` — there is nothing left to build — but it
 *    still needs `rewrites`, or every deep link 404s on a static host with no `/stats`
 *    file to serve.
 *
 * Usage:
 *   VERCEL_TOKEN=… node scripts/deploy-web.mjs
 *   VERCEL_TOKEN=… node scripts/deploy-web.mjs --skip-build
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const token = process.env.VERCEL_TOKEN;
const org = process.env.VERCEL_ORG_ID ?? 'team_xbe2wFNKq7oLCXZzICvFAnGf';
const project = process.env.VERCEL_PROJECT_ID ?? 'prj_BR3j8EDMcRzLqcg6HxWLdZogP95Q';
const site = process.env.SITE_URL ?? 'https://reviewies-beryl.vercel.app';

if (!token) {
  console.error('Set VERCEL_TOKEN (Account Settings → Tokens).');
  process.exit(2);
}

const run = (command, args, options = {}) =>
  execFileSync(command, args, { stdio: 'inherit', ...options });

// --- Build -------------------------------------------------------------------
if (!process.argv.includes('--skip-build')) {
  console.log('building…');
  run('npm', ['run', 'build', '--workspace', 'app'], { cwd: root });
}

const dist = join(root, 'app', 'dist');
const bundle = readdirSync(join(dist, 'assets')).find((f) => /^index-.*\.js$/.test(f));
if (!bundle) {
  console.error('No index bundle in app/dist/assets — did the build succeed?');
  process.exit(1);
}

// --- Stage outside the repository --------------------------------------------
const staging = mkdtempSync(join(tmpdir(), 'reviewies-deploy-'));
cpSync(dist, staging, { recursive: true });

const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
writeFileSync(
  join(staging, 'vercel.json'),
  JSON.stringify({ rewrites: config.rewrites, headers: config.headers }, null, 2),
);

// --- Deploy ------------------------------------------------------------------
console.log(`deploying ${bundle} from ${staging}…`);
run('npx', ['vercel', 'deploy', '--prod', '--yes', '--archive=tgz', '--token', token], {
  cwd: staging,
  env: {
    ...process.env,
    VERCEL_ORG_ID: org,
    VERCEL_PROJECT_ID: project,
    // The CLI uses Node's built-in fetch, which ignores HTTPS_PROXY without this.
    NODE_USE_ENV_PROXY: '1',
  },
});

// --- Verify ------------------------------------------------------------------
//
// A deployment reporting READY says a build succeeded, not that the alias serves it.
// Bundle filenames are content-hashed, so this is evidence rather than inference.
console.log('\nchecking what the site is serving…');
for (let attempt = 0; attempt < 5; attempt++) {
  const html = await fetch(site, { cache: 'no-store' }).then((r) => r.text());
  if (html.includes(bundle)) {
    console.log(`✅ ${site} is serving ${bundle}`);
    process.exit(0);
  }
  // Alias propagation is not instant; a few seconds of patience beats a false alarm.
  await new Promise((r) => setTimeout(r, 3000));
}

console.error(`⚠️  ${site} is not serving ${bundle} yet. Check the deployment in Vercel.`);
process.exit(1);
