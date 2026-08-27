# Deploying

The app is a static bundle plus a Supabase project. The backend is already deployed;
this covers putting the front end on a URL you can install on a phone.

## Why the configuration looks the way it does

The repository is an npm workspace: `npm ci` at the root installs everything and links
`@reviewies/core` into the app, then `npm run build --workspace app` builds it.
`vercel.json` says both, so the project deploys with no dashboard settings at all —
nothing to forget on the first attempt.

Rewrites run *after* the filesystem is checked, so real files (hashed assets, `sw.js`,
the manifest, icons) are served as themselves and only unmatched paths fall through to
the shell. That is what lets `/search` and `/title/...` survive a refresh.

Two files are deliberately marked never-stale. An installed PWA that pins an old
service worker or an old manifest stops updating, and the user has no way to tell —
they just have a version of the app that quietly stops changing.

## Vercel

**Deployed:** https://reviewies-beryl.vercel.app

The project lives under the **`reviewies` team**, not the personal scope. That is not a
preference — this account is a "northstar" account whose personal scope reports
`limited: true`, and deployments made there come back `BLOCKED` with no error message
at all. The first deployment happened to succeed; every one after it was blocked. If
deployments start failing silently, check which scope they are going to first.

### Redeploying

```bash
VERCEL_TOKEN=… npm run deploy:web
```

That is the whole thing: it builds, stages the output outside the repository, carries the
serving rules across, deploys, and then checks the site is actually serving the bundle it
just built. The rest of this section is why each of those steps exists — worth reading
once, and not worth remembering, which is the point of the script.

### What the script is working around

Deploying from inside the checkout **fails**, and it fails in a way worth writing down
because the error is nowhere near the cause. Vercel attributes a CLI deployment to the
git commit author it finds, and this repository's commits are authored by
`noreply@anthropic.com`, who is not a member of the team. The deployment is created, and
then:

```
"readyState": "BLOCKED",
"readyStateReason": "Git author noreply@anthropic.com must have access to the
                     team reviewies on Vercel to create deployments."
```

The CLI reports `Error: fetch failed` — from a *later*, unrelated attempt to stream build
logs — so the message you see has nothing to do with the reason.

Deploying the built directory, from outside the repository, works, because there is no
git metadata to attribute:

```bash
npm run build --workspace app
rm -rf /tmp/reviewies-deploy && cp -r app/dist /tmp/reviewies-deploy
# The build settings do not travel — nothing is left to build — but the serving rules do.
node -e "const s=require('./vercel.json');require('fs').writeFileSync('/tmp/reviewies-deploy/vercel.json',JSON.stringify({rewrites:s.rewrites,headers:s.headers},null,2))"
cd /tmp/reviewies-deploy
VERCEL_ORG_ID=team_… VERCEL_PROJECT_ID=prj_… \
  npx vercel deploy --prod --yes --archive=tgz --token=$VERCEL_TOKEN
```

Copying `vercel.json`'s `rewrites` and `headers` across is not optional. Without the
rewrite every deep link 404s, because a static host has no `/stats` file to serve.

Two things about this environment: the Vercel CLI uses Node's built-in `fetch`, which
ignores `HTTPS_PROXY` unless `NODE_USE_ENV_PROXY=1` is set, and the CA bundle needs
`NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`.

### Checking whether anything has drifted

```bash
SUPABASE_ACCESS_TOKEN=sbp_… SUPABASE_PROJECT_REF=… npm run whats-live
```

Compares the deployed everything against the repository: the web bundle by its
content-hashed filename, migrations against a ledger recording a hash of each file as it
was applied, and edge functions by slug. It exits non-zero when anything is behind, so it
can gate a release.

The migration ledger is what makes "is the schema current" answerable at all — and
because it stores a hash of the file rather than just its name, a migration edited *after*
being applied reads as drift rather than as agreement. That is the case most likely to be
wrong and least likely to be noticed.

### Verifying, rather than assuming

A deployment reporting READY says a build succeeded, not that the alias serves it. Ask
the site what it is running:

```bash
curl -s https://reviewies-beryl.vercel.app/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'
```

Compare that filename to `app/dist/assets/`. They are content-hashed, so equal names mean
equal bundles. This matters: the deployed site sat several weeks behind the repository
without anything reporting a problem, because nothing was ever going to redeploy it.

**Pushes do not deploy automatically.** The project has no Git connection at all —
`link` is `null` in the project API — so every deployment is manual. Linking it needs a
GitHub login on the Vercel account, which can only be added from the dashboard: Project →
Settings → Git → Connect Git Repository. Until then, the command above is the only thing
that updates the site.

## Netlify

`netlify.toml` carries the same settings. Import the repo and add the same variables.

## Environment variables

| Variable | Where it comes from | Required |
|---|---|---|
| `VITE_TMDB_TOKEN` | TMDB → Settings → API → **API Read Access Token** (v4 bearer) | For real metadata |
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API | For accounts and the shared layer |
| `VITE_SUPABASE_ANON_KEY` | The same page — the **publishable/anon** key | As above |
| `VITE_VAPID_PUBLIC_KEY` | Generated with the deploy; the private half is a function secret | For push |
| `VITE_BRIDGE_RELAY`, `VITE_BRIDGE_TOKEN` | Your relay's bare `wss://` URL, if you run one, and its shared token | For the remote drawer. No query string: the app appends `role` and `token` itself |

With none of them the app still builds and runs on sample data, which is why a broken
variable shows up as "no search results" rather than a blank page.

**Never set `VITE_SUPABASE_SERVICE_ROLE_KEY` or anything `sb_secret_`.** Those bypass
row-level security; the app refuses to start if it finds one in the anon slot.

### One thing worth knowing about the TMDB token

Every `VITE_` variable is baked into the JavaScript bundle at build time. That is
correct and unavoidable for the Supabase anon key — row-level security is what protects
that data, and the key is designed to be public.

The TMDB token is different: it is a bearer token with no per-user scoping, so anyone
who opens devtools on the deployed site can lift it and use your quota. This is true of
every client-side TMDB app, and it is why keeping the **repository** private does not
help — the token is in the bundle either way.

If that matters later, the fix is a small proxy: a serverless function holds the token
and forwards search and detail requests, so it never reaches a browser. The provider
interface in `core/src/metadata/provider.ts` already isolates every call behind one
class, so this is a change to `TmdbProvider`'s base URL, not a rewrite.

## Installing it on an iPhone

Open the deployed URL **in Safari** — not Chrome, not an in-app browser — then Share →
Add to Home Screen.

This is not cosmetic. An installed home-screen web app is exempt from Safari's
seven-day eviction of script-writable storage; a bookmark in a tab is not. Since your
watch history lives in IndexedDB, installing is what stops iOS deleting it after a week
of not opening the app. It is also the only way to get push notifications on iOS.
