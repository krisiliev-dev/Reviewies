/**
 * A session, and a backend that answers, without a network or an account.
 *
 * Four of the twelve photographed routes showed a **gate** rather than a screen —
 * `10-lists` said "Lists need an account", `11-people` and `12-account` said sync was not
 * configured — so the social half of the product had never been seen by the design track.
 * Sprints 34 to 36 landed full-bleed rows, `Block` and the press direction in those
 * screens, and §6.123 had to say in its own commit message that its change appeared in no
 * photograph.
 *
 * §6.125 made the signed-out build deterministic by blanking every credential. This is the
 * other half: a **second export**, configured with a stub Supabase host that nothing ever
 * reaches, photographed in its own browser context. The session is fabricated and PostgREST
 * is intercepted, so there is no network, no account, and the same pixels every run.
 *
 * `mobile/src/platform.ts` needs no change. §6.124 claimed the export could not carry
 * configuration and was retracted in §6.125 — it carries it perfectly well, which is how a
 * stub host reaches the app at all.
 */

/** Matches `authStorageKey()` in `core/src/sync/auth.ts` outside a vitest worker. */
const AUTH_KEY = 'reviewies-auth';

/** A host that resolves to nothing. Every request to it is intercepted before it leaves. */
export const HARNESS_SUPABASE_URL = 'https://design-harness.invalid';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const ANA_ID = '00000000-0000-4000-8000-000000000002';
const BEN_ID = '00000000-0000-4000-8000-000000000003';

/**
 * Rows the intercepted PostgREST answers with, shaped by the **queries** rather than by the
 * tables.
 *
 * That distinction cost a run. `lists` needs `user_id` (not `owner_id`), `deleted` and an
 * embedded `list_items: [{ count }]`, because `fetchLists` selects
 * `id, user_id, name, description, is_public, list_items(count)` and filters
 * `deleted=eq.false`. `follows` needs the embedded `profiles` object, because `fetchEdge`
 * selects `profiles!follows_followee_id_fkey (...)` and reads `row.profiles` — a row
 * carrying only the two ids renders "Nobody yet" while looking like data. §6.43's rule at
 * the wire: a fixture that does not match the query proves the screen renders nothing.
 */
const ROWS = {
  profiles: [
    { id: USER_ID, handle: 'you', display_name: 'You' },
    { id: ANA_ID, handle: 'ana', display_name: 'Ana Ruiz' },
    { id: BEN_ID, handle: 'ben_w', display_name: null },
  ],
  follows: [
    { follower_id: USER_ID, followee_id: ANA_ID, profiles: { id: ANA_ID, handle: 'ana', display_name: 'Ana Ruiz' } },
    { follower_id: BEN_ID, followee_id: USER_ID, profiles: { id: BEN_ID, handle: 'ben_w', display_name: null } },
  ],
  blocks: [],
  lists: [
    { id: 'list-1', user_id: USER_ID, name: 'Sunday nights', description: null, is_public: true, deleted: false, list_items: [{ count: 2 }] },
    { id: 'list-2', user_id: ANA_ID, name: 'Ana recommends', description: null, is_public: true, deleted: false, list_items: [{ count: 1 }] },
  ],
  list_items: [
    { list_id: 'list-1', target_id: 'tmdb:tv:1', position: 0 },
    { list_id: 'list-1', target_id: 'tmdb:movie:2', position: 1 },
    { list_id: 'list-2', target_id: 'tmdb:tv:3', position: 0 },
  ],
  comments: [],
};

/**
 * A session supabase-js will take from storage without asking anybody.
 *
 * Expires a year out on purpose: a refresh is the one call that would reach the network and
 * make these photographs depend on something.
 */
function fakeSession() {
  const hour = 60 * 60;
  return {
    access_token: 'design-harness-not-a-real-token',
    refresh_token: 'design-harness-not-a-real-refresh',
    token_type: 'bearer',
    expires_in: hour,
    expires_at: Math.floor(Date.now() / 1000) + hour * 24 * 365,
    user: {
      id: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'you@example.com',
      app_metadata: { provider: 'email' },
      user_metadata: {},
      created_at: '2026-01-01T00:00:00Z',
    },
  };
}

/**
 * Put the session where the app looks, before the app looks.
 *
 * The **session object itself**, not `{ currentSession }`. That wrapper is supabase-js v1's
 * format; v2's `__loadSession` hands what it finds straight to `_isValidSession`, so the v1
 * shape is silently rejected and the app stays signed out — which is what the first attempt
 * did, and it failed by taking three screenshots of a sign-in form rather than by erroring.
 */
export async function signIn(page) {
  await page.addInitScript(
    ([key, session]) => window.localStorage.setItem(key, JSON.stringify(session)),
    [AUTH_KEY, fakeSession()],
  );
}

/**
 * Answer PostgREST out of `ROWS`, filtered the way the client asked.
 *
 * Not a PostgREST implementation — `eq`, `in` and the embeds, which is what
 * `core/src/social/*` sends. Anything unhandled returns `[]` rather than an error, because
 * a screen showing "nothing yet" is a truthful photograph of an unhandled query and an
 * error banner is not.
 */
export async function stubBackend(page, baseUrl) {
  await page.route(`${baseUrl}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.startsWith('/auth/v1/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeSession()) });
    }

    const table = /^\/rest\/v1\/([a-z_]+)/.exec(path)?.[1];
    if (!table) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });

    let rows = ROWS[table] ?? [];
    for (const [param, value] of url.searchParams) {
      if (['select', 'order', 'limit', 'offset'].includes(param)) continue;
      const [op, ...rest] = value.split('.');
      const wanted = rest.join('.');
      if (op === 'eq') rows = rows.filter((r) => String(r[param]) === wanted);
      else if (op === 'in') {
        const set = new Set(wanted.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')));
        rows = rows.filter((r) => set.has(String(r[param])));
      }
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` },
      body: JSON.stringify(rows),
    });
  });
}
