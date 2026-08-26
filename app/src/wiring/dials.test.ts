import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Every socket this product opens to the relay is addressed the way the relay reads.
 *
 * The relay identifies a connection entirely from its query string — `role` says which
 * half of the pair you are, `token` says which pair — and closes anything without both
 * with 1008 before a byte is exchanged. Both clients dialled a bare URL and then sent a
 * handshake *message* carrying the token, which nothing ever received because the socket
 * was already shut. The relay's suite tested the pairing class and the URL parser
 * separately; each was correct; the connection between them had never been made. §6.43.
 *
 * `relay/src/pairing.test.ts` now dials a running server, which is the check that would
 * have caught it. This is the cheaper one beside it: a second dial written somewhere else
 * next year has to go through the same helper, or say here why it does not.
 */
const ROOT = resolve(import.meta.dirname, '../../..');

/**
 * Files allowed to open a socket without the helper, and why.
 *
 * Empty on purpose. An entry here is a claim that some socket in this product does not
 * need a role and a token, and that claim should be uncomfortable to write.
 */
const EXEMPT: Record<string, string> = {};

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', '.expo', 'screenshots'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

describe('dialling the relay', () => {
  const files = sources(ROOT).filter((f) => !f.endsWith('relayUrl.ts'));
  const dialling = files.filter((f) => /new WebSocket\(/.test(readFileSync(f, 'utf8')));

  it('finds the sockets rather than passing on an empty list', () => {
    // Two: the app's bridge hook and the bridge itself. If this ever reads zero, the
    // assertion below is checking nothing.
    expect(dialling.length).toBeGreaterThanOrEqual(2);
  });

  it('addresses every one of them with a role and a token', () => {
    const bare = dialling
      .filter((f) => !readFileSync(f, 'utf8').includes('relayConnectionUrl('))
      .map((f) => relative(ROOT, f))
      .filter((f) => !(f in EXEMPT));
    expect(bare).toEqual([]);
  });

  it('has no stale exemptions', () => {
    const paths = dialling.map((f) => relative(ROOT, f));
    for (const exempt of Object.keys(EXEMPT)) expect(paths).toContain(exempt);
  });
});
