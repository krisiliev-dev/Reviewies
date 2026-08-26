import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { stripComments } from '@reviewies/core/test/source';

/**
 * One Supabase client, made in one place.
 *
 * `SupabaseBackend.fromEnv()` — the only backend the running app ever builds — called
 * `createClient` itself. `sync/auth.ts` keeps the session under its own `storageKey`,
 * and on a phone in AsyncStorage, so that second client had **never seen a session on
 * either platform**. Every sync raised *Not signed in*, and because that was classified
 * non-retryable the engine deleted the whole batch from the outbox: everything written
 * offline, dropped, silently, on the first attempt.
 *
 * Nothing caught it because nothing had ever called `fromEnv`. Both sync test files
 * construct `new SupabaseBackend(client)` with a client they signed in themselves — so
 * the tested path and the shipped path were not the same path, which is this
 * repository's oldest recurring shape. §6.67.
 *
 * The rule is mechanical rather than remembered: exactly one `createClient` call in the
 * product's own source. Anything else is a second session store waiting to disagree
 * with the first.
 */
const ROOT = resolve(import.meta.dirname, '../../..');

const TREES = ['core/src', 'app/src', 'mobile/app', 'mobile/src'];

/**
 * Where a client may legitimately be made.
 *
 * One entry, and it is the one place that knows where the session lives.
 */
const ALLOWED = new Set(['core/src/sync/auth.ts']);

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, out);
    // Tests are exempt on purpose: a live suite signs in as its own throwaway user and
    // must be able to build a client to do it.
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

/** One copy, in the core, since §6.72. */
const strip = stripComments;

describe('the Supabase client', () => {
  const files = TREES.flatMap((tree) => sources(resolve(ROOT, tree)));

  it('finds the source rather than passing on an empty list', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('is created in exactly one place', () => {
    const makers = files.filter((file) => /\bcreateClient\s*\(/.test(strip(readFileSync(file, 'utf8'))));
    expect(makers.map((f) => relative(ROOT, f)).sort()).toEqual([...ALLOWED].sort());
  });

  it('is the one the sync backend uses', () => {
    // The claim in prose, checked against the code: `fromEnv` must reach for the shared
    // client rather than building its own.
    const source = strip(readFileSync(resolve(ROOT, 'core/src/sync/supabaseBackend.ts'), 'utf8'));
    const fromEnv = /static fromEnv\(\)[\s\S]*?\n  \}/.exec(source)?.[0] ?? '';
    expect(fromEnv).toContain('getClient()');
    expect(fromEnv).not.toContain('createClient');
  });
});
