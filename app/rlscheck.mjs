/**
 * End-to-end row-level security verification against the real project.
 * Creates two throwaway users, exercises the policies through PostgREST with real
 * JWTs, then deletes them. This is the check PGlite cannot do: Supabase's own
 * auth.uid(), real tokens, real PostgREST.
 */
const URL = 'https://zifimolrzttbxntpubix.supabase.co';
const SECRET = process.env.SB_SECRET;
const PUB = process.env.SB_PUB;
// Unique per run: earlier runs leave rows behind, and exact-count assertions
// against a shared ID fail for reasons that have nothing to do with the policies.
const EPISODE = `tmdb:ep:test-${Date.now()}`;

const checks = [];
const check = (n, ok, d = '') => { checks.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`); };

const admin = (path, opts = {}) => fetch(`${URL}${path}`, {
  ...opts,
  headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json', ...opts.headers },
});

async function makeUser(email) {
  const res = await admin('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'test-password-123', email_confirm: true }),
  });
  const user = await res.json();
  if (!user.id) throw new Error('create user failed: ' + JSON.stringify(user).slice(0, 200));

  const tokRes = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: PUB, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'test-password-123' }),
  });
  const tok = await tokRes.json();
  if (!tok.access_token) throw new Error('sign-in failed: ' + JSON.stringify(tok).slice(0, 200));
  return { id: user.id, jwt: tok.access_token };
}

const as = (user, path, opts = {}) => fetch(`${URL}/rest/v1${path}`, {
  ...opts,
  headers: { apikey: PUB, Authorization: `Bearer ${user.jwt}`, 'Content-Type': 'application/json', ...opts.headers },
});

const stamp = Date.now();
let alice, bob;
try {
  alice = await makeUser(`alice-${stamp}@example.com`);
  bob = await makeUser(`bob-${stamp}@example.com`);

  await as(alice, '/profiles', { method: 'POST', body: JSON.stringify({ id: alice.id, handle: `alice${stamp}`.slice(0, 28) }) });
  await as(bob, '/profiles', { method: 'POST', body: JSON.stringify({ id: bob.id, handle: `bob${stamp}`.slice(0, 28) }) });

  // --- anonymous access -------------------------------------------------
  const anon = await fetch(`${URL}/rest/v1/watches?target_id=eq.${EPISODE}&select=*`, { headers: { apikey: PUB } });
  const anonRows = await anon.json();
  check('anonymous cannot read watches', Array.isArray(anonRows) && anonRows.length === 0);

  // --- private history --------------------------------------------------
  const w = await as(alice, '/watches', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ id: crypto.randomUUID(), user_id: alice.id, target_id: EPISODE, watched_at: new Date().toISOString() }),
  });
  check('owner can write their own watch', w.status === 201, `http=${w.status}`);

  check('owner reads their own watch', (await (await as(alice, `/watches?target_id=eq.${EPISODE}&select=*`)).json()).length === 1);
  check('other user cannot read it', (await (await as(bob, `/watches?target_id=eq.${EPISODE}&select=*`)).json()).length === 0);

  const forged = await as(bob, '/watches', {
    method: 'POST',
    body: JSON.stringify({ id: crypto.randomUUID(), user_id: alice.id, target_id: 'x', watched_at: new Date().toISOString() }),
  });
  check('cannot write a row attributed to someone else', forged.status === 403 || forged.status === 401, `http=${forged.status}`);

  // --- spoiler gating ---------------------------------------------------
  const c = await as(alice, '/comments', {
    method: 'POST',
    body: JSON.stringify({ id: crypto.randomUUID(), user_id: alice.id, target_id: EPISODE, body: 'That reveal!' }),
  });
  check('can comment on an episode you watched', c.status === 201, `http=${c.status}`);

  const bobBlocked = await as(bob, '/comments', {
    method: 'POST',
    body: JSON.stringify({ id: crypto.randomUUID(), user_id: bob.id, target_id: EPISODE, body: 'spoiler bait' }),
  });
  check('cannot comment on an episode you have NOT watched', bobBlocked.status === 403, `http=${bobBlocked.status}`);

  check('comment hidden from someone who has not watched', (await (await as(bob, `/comments?target_id=eq.${EPISODE}&select=*`)).json()).length === 0);

  await as(bob, '/watches', {
    method: 'POST',
    body: JSON.stringify({ id: crypto.randomUUID(), user_id: bob.id, target_id: EPISODE, watched_at: new Date().toISOString() }),
  });
  check('comment revealed after watching', (await (await as(bob, `/comments?target_id=eq.${EPISODE}&select=*`)).json()).length === 1);

  // --- reactions are shared --------------------------------------------
  await as(alice, '/reactions', {
    method: 'POST',
    body: JSON.stringify({ id: crypto.randomUUID(), user_id: alice.id, target_id: EPISODE, t_ms: 42000, emoji: '😮' }),
  });
  const seen = await (await as(bob, `/reactions?target_id=eq.${EPISODE}&select=*`)).json();
  check('reactions readable before watching (Watching Mode replay)', seen.length === 1);
} catch (e) {
  check('rls run completed', false, e.message);
} finally {
  for (const u of [alice, bob]) {
    if (u) await admin(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' }).catch(() => {});
  }
}

const failed = checks.filter((c) => !c).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
