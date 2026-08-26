import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Which suites skip themselves, and what each one is waiting for.
 *
 * A run of this package reports "639 passed | 34 skipped" and nothing anywhere says
 * which 34 or why. That is the §6.40 shape one layer down: a number reported green
 * every sprint, covering a set nobody has looked at. Thirty-four skipped tests could be
 * nine live suites waiting on credentials, or it could be one of them plus somebody's
 * `it.skip` from a debugging session that never came back — and the total reads the same
 * either way.
 *
 * So the skips are enumerated here, each with the environment it needs to run and one
 * line on what it covers that nothing else can. A skip outside this list fails. An entry
 * whose file has stopped skipping fails too, because a list that only grows is a list
 * that stops being read.
 */
const SRC = resolve(import.meta.dirname, '..');

interface Waiting {
  /** What has to be in the environment for this suite to run. */
  needs: string;
  /** What is only provable this way. */
  covers: string;
}

const SKIPS: Record<string, Waiting> = {
  'data/reconcile.live.test.ts': {
    needs: 'VITE_TMDB_TOKEN and RECONCILE_LIVE=1',
    covers:
      'matching a real two-hundred-show library against real TMDB, which is slow enough ' +
      'to be opt-in even when the token is present',
  },
  'metadata/tmdb.live.test.ts': {
    needs: 'VITE_TMDB_TOKEN',
    covers: 'that the provider agrees with the real API rather than with its own fixtures',
  },
  'metadata/anime.live.test.ts': {
    needs: 'VITE_TMDB_TOKEN',
    covers: 'that anime is identified from real listings, which is a core audience for this app',
  },
  'sync/supabase.live.test.ts': {
    needs: 'SB_SECRET',
    covers: 'real PostgREST, real JWTs, and row-level security deciding what comes back',
  },
  'social/account.live.test.ts': {
    needs: 'SB_SECRET',
    covers: 'that an account export reads back, and that restoring it twice does not duplicate',
  },
  'social/comments.live.test.ts': {
    needs: 'SB_SECRET',
    covers: 'that the spoiler gate is enforced by the server and not only explained by the client',
  },
  'social/images.live.test.ts': {
    needs: 'SB_SECRET',
    covers: 'that storage files an image under its uploader rather than wherever it is asked to',
  },
  'watching/reactions.live.test.ts': {
    needs: 'SB_SECRET',
    covers: 'that sampling spreads across the episode and that a blocked person stays hidden',
  },
  'fingerprint/promotion.live.test.ts': {
    needs: 'SB_SECRET',
    covers: 'that two people hearing the same thing is what promotes a reference, server-side',
  },
};

/** Every test file under src, as a path relative to it. */
function testFiles(dir = SRC, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) testFiles(path, out);
    // Not this file: it names the shapes it looks for, so it matches its own pattern.
    else if (entry.name.endsWith('.test.ts') && entry.name !== 'skips.test.ts') {
      out.push(relative(SRC, path));
    }
  }
  return out;
}

/**
 * Whether a file can skip its whole body.
 *
 * `describe.skip` reached through a name — `const live = ... ? describe : describe.skip`
 * — is the shape every live suite here uses, and a bare `it.skip` is the shape a
 * forgotten debugging session leaves. Both count; neither is allowed to be anonymous.
 */
const skips = (source: string) => /\b(describe|it|test)\.skip\b|\.skipIf\(/.test(source);

describe('suites that skip themselves', () => {
  const files = testFiles();

  it('finds the test files rather than trusting a list', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain('sync/supabase.live.test.ts');
  });

  it('has an entry for every suite that can skip itself', () => {
    const skipping = files.filter((f) => skips(readFileSync(join(SRC, f), 'utf8'))).sort();
    expect(skipping).toEqual(Object.keys(SKIPS).sort());
  });

  it('says what each one needs and what it covers', () => {
    for (const [file, waiting] of Object.entries(SKIPS)) {
      expect(waiting.needs, file).toMatch(/\w/);
      expect(waiting.covers.length, file).toBeGreaterThan(30);
    }
  });

  it('names an environment variable something actually reads', () => {
    // The reason is only useful if somebody can act on it, and the thing they act on is
    // an environment variable. A suite may read it directly — `process.env.SB_SECRET` —
    // or receive it through `setConfig` in the test setup, which is how the TMDB token
    // arrives. Either is fine; a name nothing reads at all is folklore, and that is what
    // this refuses.
    const everywhere = files
      .concat(['test/setup.ts', 'test/setup.sqlite.ts'])
      .map((f) => readFileSync(join(SRC, f), 'utf8'))
      .join('\n');
    for (const [file, waiting] of Object.entries(SKIPS)) {
      for (const variable of waiting.needs.match(/[A-Z][A-Z0-9_]{3,}/g) ?? []) {
        expect(everywhere, `${file} names ${variable}, which nothing reads`).toContain(variable);
      }
    }
  });
});
