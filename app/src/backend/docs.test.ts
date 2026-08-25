import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The deploy documentation has to keep up with the directory.
 *
 * Not pedantry. The README claimed "all 9 migrations" deployed while the code had come
 * to depend on functions that arrive in the tenth and eleventh, and a status table that
 * overstates what is deployed is worse than no table — it is exactly what someone checks
 * before trusting the system. A test is the only thing that keeps prose honest, because
 * prose does not fail.
 */
const ROOT = resolve(__dirname, '../../..');

describe('deploy documentation', () => {
  it('names every migration', () => {
    const migrations = readdirSync(resolve(ROOT, 'supabase/migrations')).filter((f) =>
      f.endsWith('.sql'),
    );
    const doc = readFileSync(resolve(ROOT, 'supabase/README.md'), 'utf8');

    expect(migrations.length).toBeGreaterThan(0);
    const missing = migrations.filter((file) => !doc.includes(file));
    expect(missing).toEqual([]);
  });

  it('names every edge function', () => {
    // Same failure, different directory: a function nobody deploys is a feature that
    // silently does not exist.
    const functions = readdirSync(resolve(ROOT, 'supabase/functions'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    const doc = readFileSync(resolve(ROOT, 'supabase/README.md'), 'utf8');

    expect(functions.length).toBeGreaterThan(0);
    expect(functions.filter((name) => !doc.includes(name))).toEqual([]);
  });
});
