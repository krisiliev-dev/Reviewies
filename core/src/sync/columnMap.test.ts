import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COLUMN_MAP, fromRemote, toRemote } from './supabaseBackend.ts';
import type { SyncTable } from './types.ts';

/**
 * The mapping, against the schema it claims to map to.
 *
 * `toRemote` skips any field it has no column for. That is the right behaviour — a local
 * field with no remote home should not be invented — and it means a missing entry is
 * not an error anywhere: the value simply never leaves the device, and the only place
 * that shows is a second one, later, when somebody notices their poster is gone.
 *
 * The live suite round-trips every table against the real project and is the better
 * check, but it needs a service key to make and unmake its own user. This needs nothing,
 * so it runs everywhere, and it catches the failure that is actually silent.
 */
const ROOT = resolve(__dirname, '../../..');
const SYNCED: SyncTable[] = ['watches', 'ratings', 'watchlist', 'library', 'reactions'];

/** Columns the server owns and no client should send. */
const SERVER_OWNED = new Set(['user_id', 'updated_at', 'deleted']);

function columnsOf(table: string): string[] {
  const sql = readFileSync(resolve(ROOT, 'supabase/migrations/0001_init.sql'), 'utf8');
  const start = sql.indexOf(`create table if not exists ${table} (`);
  expect(start, `${table} is not in the migration`).toBeGreaterThan(-1);

  const body = sql.slice(start, sql.indexOf('\n);', start));
  return body
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/)[0])
    .filter((name) => /^[a-z_]+$/.test(name) && !['primary', 'unique', 'check'].includes(name));
}

describe('the column mapping', () => {
  it('is checked against a schema this can actually read', () => {
    // Non-vacuous: a parser that found nothing would let every assertion below pass.
    expect(columnsOf('library')).toContain('poster_override');
    expect(columnsOf('watches')).toContain('runtime_min');
  });

  it.each(SYNCED)('carries every column of %s', (table) => {
    const mapped = new Set(Object.values(COLUMN_MAP[table]));
    const missing = columnsOf(table).filter(
      (column) => !SERVER_OWNED.has(column) && !mapped.has(column),
    );

    expect(missing, `${table} has columns nothing will ever write`).toEqual([]);
  });

  it.each(SYNCED)('invents no column of %s that does not exist', (table) => {
    // The other direction, which fails loudly rather than silently — PostgREST rejects
    // the insert — but only for somebody who has a server in front of them.
    const real = new Set(columnsOf(table));
    expect(Object.values(COLUMN_MAP[table]).filter((column) => !real.has(column))).toEqual([]);
  });

  it('survives a round trip through both directions', () => {
    const row = {
      titleId: 'tmdb:tv:1',
      kind: 'show',
      status: 'watching',
      posterOverride: 'https://example.test/p.jpg',
      ordering: 'absolute',
      addedAt: 1_700_000_000_000,
    };

    // Timestamps go out as ISO and come back as epoch milliseconds; everything else has
    // to survive unchanged, including the two optional fields.
    expect(fromRemote('library', toRemote('library', row))).toEqual(row);
  });
});
