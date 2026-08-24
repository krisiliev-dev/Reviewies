import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyWal, databasePageSize, walChecksum } from './sqliteWal';

/**
 * These run against write-ahead logs produced by real SQLite, not hand-built bytes.
 * A hand-built fixture would only prove the merge agrees with my reading of the spec;
 * the point is that it agrees with SQLite.
 */

/**
 * Build a database whose recent writes live only in the log.
 *
 * The copy happens inside the child process, while the connection is still open —
 * closing SQLite checkpoints the log and deletes it, which is precisely the state a
 * recovered backup is *not* in. TV Time was killed, not closed cleanly.
 */
function makeWalPair(rows: string[], checkpointFirst = false) {
  const dir = mkdtempSync(join(tmpdir(), 'wal-'));
  const path = join(dir, 'test.db');
  const inserts = checkpointFirst
    ? `for (const v of rows.slice(0, 5)) db.prepare("insert into t (v) values (?)").run(v);
       db.exec("pragma wal_checkpoint(full)");
       for (const v of rows.slice(5)) db.prepare("insert into t (v) values (?)").run(v);`
    : `for (const v of rows) db.prepare("insert into t (v) values (?)").run(v);`;

  execFileSync(
    process.execPath,
    [
      '-e',
      `
      const fs = require('node:fs');
      const { DatabaseSync } = require('node:sqlite');
      const p = ${JSON.stringify(path)};
      const db = new DatabaseSync(p);
      db.exec("pragma journal_mode = wal");
      db.exec("create table t (id integer primary key, v text)");
      const rows = ${JSON.stringify(rows)};
      ${inserts}
      fs.copyFileSync(p, p + '.copy');
      fs.copyFileSync(p + '-wal', p + '.copy-wal');
    `,
    ],
    { stdio: 'pipe' },
  );

  return {
    db: new Uint8Array(readFileSync(`${path}.copy`)),
    wal: new Uint8Array(readFileSync(`${path}.copy-wal`)),
    dir,
  };
}

/** Read the rows back by handing the merged bytes to a fresh SQLite. */
function readRows(merged: Uint8Array): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'walread-'));
  const path = join(dir, 'merged.db');
  try {
    const out = execFileSync(
      process.execPath,
      [
        '-e',
        `
        const fs = require('node:fs');
        const p = ${JSON.stringify(path)};
        fs.writeFileSync(p, Buffer.from(process.env.DATA, 'base64'));
        const { DatabaseSync } = require('node:sqlite');
        const db = new DatabaseSync(p, { readOnly: true });
        process.stdout.write(JSON.stringify(db.prepare('select v from t order by id').all()));
      `,
      ],
      { stdio: 'pipe', env: { ...process.env, DATA: Buffer.from(merged).toString('base64') } },
    ).toString();
    return (JSON.parse(out) as Array<{ v: string }>).map((r) => r.v);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('page size', () => {
  it('reads it out of the database header', () => {
    const { db, dir } = makeWalPair(['a']);
    expect([512, 1024, 2048, 4096, 8192, 16384, 32768, 65536]).toContain(databasePageSize(db));
    rmSync(dir, { recursive: true, force: true });
  });

  it('reports nothing for something that is not a database', () => {
    expect(databasePageSize(new Uint8Array(8))).toBe(0);
  });
});

describe('checksum', () => {
  it('matches the header checksum SQLite itself wrote', () => {
    // If this disagreed, every frame would be rejected and the log silently dropped.
    const { wal, dir } = makeWalPair(['a']);
    const view = new DataView(wal.buffer, wal.byteOffset, wal.byteLength);
    const bigEndian = view.getUint32(0) === 0x377f0683;
    const [s0, s1] = walChecksum(wal.subarray(0, 24), bigEndian);

    expect(s0).toBe(view.getUint32(24));
    expect(s1).toBe(view.getUint32(28));
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('applying a log', () => {
  it('recovers rows that exist only in the -wal', () => {
    // The case the module exists for: without the merge these rows are gone.
    const rows = ['one', 'two', 'three'];
    const { db, wal, dir } = makeWalPair(rows);
    const merged = applyWal(db, wal);

    expect(merged.pagesApplied).toBeGreaterThan(0);
    expect(readRows(merged.database)).toEqual(rows);
    rmSync(dir, { recursive: true, force: true });
  });

  it('demonstrates what is lost without it', () => {
    // This is the failure mode doc 8 describes: the file opens, and the history is
    // quietly incomplete.
    const { db, dir } = makeWalPair(['one', 'two']);
    let rows: string[] | undefined;
    try {
      rows = readRows(db);
    } catch {
      rows = undefined;
    }
    expect(rows).not.toEqual(['one', 'two']);
    rmSync(dir, { recursive: true, force: true });
  });

  it('handles a log whose early pages were already checkpointed', () => {
    const rows = Array.from({ length: 50 }, (_, i) => `row-${i}`);
    const { db, wal, dir } = makeWalPair(rows, true);
    expect(readRows(applyWal(db, wal).database)).toEqual(rows);
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns the database untouched when there is no log', () => {
    const { db, dir } = makeWalPair(['a']);
    const merged = applyWal(db, undefined);

    expect(merged.database).toBe(db);
    expect(merged.pagesApplied).toBe(0);
    expect(merged.warnings).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuses a log from a different database rather than corrupting this one', () => {
    const { db, wal, dir } = makeWalPair(['a']);
    const wrong = new Uint8Array(wal);
    // A different salt is SQLite's own marker for "another generation of the log".
    new DataView(wrong.buffer).setUint32(16, 0xdeadbeef);
    const merged = applyWal(db, wrong);

    expect(merged.pagesApplied).toBe(0);
    expect(merged.database).toBe(db);
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects a log whose pages are a different size', () => {
    const { db, wal, dir } = makeWalPair(['a']);
    const wrong = new Uint8Array(wal);
    new DataView(wrong.buffer).setUint32(8, 512);
    const merged = applyWal(db, wrong);

    expect(merged.pagesApplied).toBe(0);
    expect(merged.warnings.join(' ')).toMatch(/do not belong together/);
    rmSync(dir, { recursive: true, force: true });
  });

  it('stops at a corrupt frame instead of writing garbage over a good page', () => {
    const rows = Array.from({ length: 40 }, (_, i) => `row-${i}`);
    const { db, wal, dir } = makeWalPair(rows);
    const damaged = new Uint8Array(wal);
    // Flip a byte inside the first frame's page content; its checksum no longer holds.
    damaged[32 + 24 + 10] ^= 0xff;

    expect(applyWal(db, damaged).pagesApplied).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });

  it('ignores a log that is not a log at all', () => {
    const { db, dir } = makeWalPair(['a']);
    const merged = applyWal(db, new Uint8Array(64));

    expect(merged.warnings.join(' ')).toMatch(/not a SQLite write-ahead log/);
    expect(merged.database).toBe(db);
    rmSync(dir, { recursive: true, force: true });
  });
});
