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

1. [vercel.com/new](https://vercel.com/new) → import `krisiliev-dev/Reviewies`.
2. Leave every build setting alone. `vercel.json` supplies them.
3. Add the environment variables below, for **all** environments.
4. Deploy.

Pushes to the branch redeploy automatically after that.

## Netlify

`netlify.toml` carries the same settings. Import the repo and add the same variables.

## Environment variables

| Variable | Where it comes from | Required |
|---|---|---|
| `VITE_TMDB_TOKEN` | TMDB → Settings → API → **API Read Access Token** (v4 bearer) | For real metadata |
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API | For accounts and the shared layer |
| `VITE_SUPABASE_ANON_KEY` | The same page — the **publishable/anon** key | As above |
| `VITE_VAPID_PUBLIC_KEY` | Generated with the deploy; the private half is a function secret | For push |
| `VITE_BRIDGE_RELAY`, `VITE_BRIDGE_TOKEN` | Your relay, if you run one | For the remote drawer |

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
interface in `app/src/metadata/provider.ts` already isolates every call behind one
class, so this is a change to `TmdbProvider`'s base URL, not a rewrite.

## Installing it on an iPhone

Open the deployed URL **in Safari** — not Chrome, not an in-app browser — then Share →
Add to Home Screen.

This is not cosmetic. An installed home-screen web app is exempt from Safari's
seven-day eviction of script-writable storage; a bookmark in a tab is not. Since your
watch history lives in IndexedDB, installing is what stops iOS deleting it after a week
of not opening the app. It is also the only way to get push notifications on iOS.
