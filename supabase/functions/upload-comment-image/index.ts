/**
 * Accepts a comment screenshot and stores it.
 *
 * Uploads do not go direct from the browser. On this project `storage.objects` is
 * owned by `supabase_storage_admin` and the `postgres` role cannot add policies to it,
 * so the row-level rules that would have confined a client write to its own folder
 * cannot exist — see migration 0009. This function is the replacement, and a better
 * one: it runs with the service role, verifies the caller's JWT, and enforces size,
 * type and path before a single byte is stored.
 *
 * Deploy:
 *   supabase functions deploy upload-comment-image
 * or via the Management API — see scripts/deploy-functions.mjs.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const BUCKET = 'comment-images';
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  });

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, x-client-info, apikey',
  'access-control-allow-methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const authorization = req.headers.get('authorization');
  if (!authorization) return json({ error: 'Sign in to attach an image.' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey);

  // The token is verified explicitly rather than by building a second client around
  // it. An earlier version did the latter and needed SUPABASE_ANON_KEY, which is not
  // in this runtime's environment — createClient threw on the undefined key and every
  // upload came back as a 502. Passing the JWT straight to getUser needs no second
  // key at all, and the user ID still comes from auth rather than from the request.
  const jwt = authorization.replace(/^Bearer\s+/i, '');
  const { data: auth, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !auth?.user) return json({ error: 'Sign in to attach an image.' }, 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: 'Expected a multipart upload.' }, 400);
  }

  const file = form.get('file');
  if (!(file instanceof File)) return json({ error: 'No file was sent.' }, 400);

  const extension = TYPES[file.type];
  if (!extension) return json({ error: 'Images only — JPEG, PNG, WebP or GIF.' }, 415);
  if (file.size > MAX_BYTES) return json({ error: 'That image is over 5 MB.' }, 413);
  if (file.size === 0) return json({ error: 'That file is empty.' }, 400);

  // The path is derived here, never accepted from the client: it is what keeps one
  // person's uploads out of another's folder now that a policy cannot.
  const path = `${auth.user.id}/${crypto.randomUUID()}.${extension}`;

  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) return json({ error: error.message }, 500);

  const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
  return json({ url: data.publicUrl });
});
