/**
 * The address a client actually has to dial to reach the relay.
 *
 * The relay identifies a connection entirely from its query string: `role` says which
 * half of the pair you are, `token` says which pair. Anything without both is closed
 * with 1008 before a byte is exchanged — `relay/src/server.ts` reads them off the URL
 * and never looks at a message.
 *
 * Neither client built one. The app opened `new WebSocket(VITE_BRIDGE_RELAY)` and then
 * sent a `hello` message carrying the token; the bridge opened
 * `new WebSocket(REVIEWIES_RELAY)` and sent a `welcome`. Both were closed on connect, so
 * neither message was ever read by anything. Three documents each described a different
 * URL — the relay's README the query form, the bridge's README a `/bridge` path, the
 * deployment table just "your relay" — and no test dialled the running server, because
 * the relay's suite exercises the pairing class and the URL parser separately. Each side
 * was individually correct. §6.43.
 *
 * Built here rather than written into two env vars because the two clients need
 * different URLs — the role differs — and one variable cannot hold both. The token is
 * already configured separately on each side, so this is the only thing that was
 * missing.
 */

export type RelayRole = 'app' | 'bridge';

/**
 * Add the role and token the relay requires.
 *
 * An existing query is preserved and an existing `role` or `token` is replaced, so a URL
 * somebody has already annotated by hand — which is how anyone got this working before
 * now — does not end up with two of each.
 */
export function relayConnectionUrl(base: string, role: RelayRole, token: string): string {
  const url = new URL(base);
  url.searchParams.set('role', role);
  url.searchParams.set('token', token);
  return url.toString();
}
