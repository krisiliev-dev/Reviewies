import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Which suites in this repository skip themselves, and what each one is waiting for.
 *
 * A run of this package reports "811 passed | 34 skipped" and nothing anywhere says
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
 *
 * ## Every workspace, not just this one
 *
 * This scanned `core/src` alone until §6.74, which planted `it.skip` in `app/src` and
 * watched this suite pass: the other five workspaces could skip a test each and the
 * only trace would be a number in their own summaries that nothing reads. The scan now
 * starts at the repository root and walks every workspace named in its `package.json`,
 * so a new workspace is covered the day it is added rather than the day somebody
 * remembers this file.
 */
const ROOT = resolve(import.meta.dirname, '../../..');
const WORKSPACES = (
  JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { workspaces: string[] }
).workspaces;

interface Waiting {
  /** What has to be in the environment for this suite to run. */
  needs: string;
  /** What is only provable this way. */
  covers: string;
}

const SKIPS: Record<string, Waiting> = {
  'core/src/data/reconcile.live.test.ts': {
    needs: 'VITE_TMDB_TOKEN and RECONCILE_LIVE=1',
    covers:
      'matching a real two-hundred-show library against real TMDB, which is slow enough ' +
      'to be opt-in even when the token is present',
  },
  'core/src/metadata/tmdb.live.test.ts': {
    needs: 'VITE_TMDB_TOKEN',
    covers: 'that the provider agrees with the real API rather than with its own fixtures',
  },
  'core/src/metadata/anime.live.test.ts': {
    needs: 'VITE_TMDB_TOKEN',
    covers: 'that anime is identified from real listings, which is a core audience for this app',
  },
  'core/src/sync/supabase.live.test.ts': {
    needs: 'SB_SECRET',
    covers: 'real PostgREST, real JWTs, and row-level security deciding what comes back',
  },
  'core/src/social/account.live.test.ts': {
    needs: 'SB_SECRET',
    covers: 'that an account export reads back, and that restoring it twice does not duplicate',
  },
  'core/src/social/comments.live.test.ts': {
    needs: 'SB_SECRET',
    covers: 'that the spoiler gate is enforced by the server and not only explained by the client',
  },
  'core/src/social/images.live.test.ts': {
    needs: 'SB_SECRET',
    covers: 'that storage files an image under its uploader rather than wherever it is asked to',
  },
  'core/src/watching/reactions.live.test.ts': {
    needs: 'SB_SECRET',
    covers: 'that sampling spreads across the episode and that a blocked person stays hidden',
  },
  'core/src/data/adapters/dexieUpgrade.test.ts': {
    needs: 'an IndexedDB, which the SQLite run of this suite has no business providing',
    covers:
      'opening a version 1 browser database with the current code and finding every row ' +
      'still there — the other store’s upgrade is covered beside it, without skipping',
  },
  'core/src/fingerprint/promotion.live.test.ts': {
    needs: 'SB_SECRET',
    covers: 'that two people hearing the same thing is what promotes a reference, server-side',
  },
  'app/src/wiring/snapshotPass.test.ts': {
    needs: 'design/real, the 534 MB snapshot of TMDB, which is gitignored and taken by hand',
    covers:
      'that the snapshot on disk holds an answer for every question the provider asks at a ' +
      'fixed address — the clause beside it reads design/snapshot.mjs and can only say the ' +
      'script asks, which was green while every real-data box drew year only',
  },
};

/** Every test file in every workspace, as a path relative to the repository root. */
function testFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.expo') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) testFiles(path, out);
    // Not this file: it names the shapes it looks for, so it matches its own pattern.
    else if (/\.test\.[cm]?[jt]sx?$/.test(entry.name) && entry.name !== 'skips.test.ts') {
      out.push(relative(ROOT, path));
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
  const files = WORKSPACES.flatMap((name) => testFiles(join(ROOT, name)));

  it('finds the test files rather than trusting a list', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain('core/src/sync/supabase.live.test.ts');
    // Every workspace is reached, so a skip outside this one cannot hide. Each of the
    // six holds tests; if one stops, `everyWorkspaceRuns` is the guard that says so.
    for (const name of WORKSPACES) {
      expect(files.some((f) => f.startsWith(`${name}/`)), `nothing scanned in ${name}`).toBe(true);
    }
  });

  it('has an entry for every suite that can skip itself', () => {
    const skipping = files.filter((f) => skips(readFileSync(join(ROOT, f), 'utf8'))).sort();
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
      .concat(['core/src/test/setup.ts', 'core/src/test/setup.sqlite.ts'])
      .map((f) => readFileSync(join(ROOT, f), 'utf8'))
      .join('\n');
    for (const [file, waiting] of Object.entries(SKIPS)) {
      for (const variable of waiting.needs.match(/[A-Z][A-Z0-9_]{3,}/g) ?? []) {
        expect(everywhere, `${file} names ${variable}, which nothing reads`).toContain(variable);
      }
    }
  });
});
