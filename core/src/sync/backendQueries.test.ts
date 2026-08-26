import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Every column the client names, against the schema it names them in.
 *
 * supabase-js does not throw on a bad column. It answers `{ data: null, error }`, and
 * almost every read in this codebase falls back to an empty array or undefined on
 * error — which is the right behaviour for a network blip and indistinguishable from
 * "you have no lists". A misspelled column, a renamed table or a policy that forbids
 * the read all produce the same thing: an export that looks complete and is empty.
 * That is precisely what the export exists to prevent.
 *
 * `columnMap.test.ts` does this for the five synced tables. The account export and
 * restore added reads and writes across five more — profiles, lists, list_items,
 * follows, comments — and none of it has ever run against the real project, because
 * the live suite needs a service key this checkout does not have. So this reads the
 * migrations instead, and covers every `.from(...)` in the core rather than the new
 * ones only.
 *
 * What this cannot check is behaviour: whether a policy lets a particular row through,
 * whether a join resolves, whether an insert satisfies a constraint. That is
 * `supabase.live.test.ts` and `account.live.test.ts`, both of which need a service key
 * this checkout does not have and both of which ship unrun.
 *
 * The policies behind the account export were read rather than run, and this is what
 * that reading found — recorded here because a reading nobody wrote down is a reading
 * that has to be done again:
 *
 *  - `lists_select` admits `user_id = auth.uid()` before it considers `is_public`, so a
 *    private list does reach its owner's export. This was the one worth checking: a
 *    policy written only around publication would have exported nothing but the lists
 *    you had already shared.
 *  - `list_items_select` inherits the list's visibility through a subquery, so items of
 *    an owned list follow it.
 *  - `comments_select` requires `has_watched(target_id)` *or* `user_id = auth.uid()`.
 *    Your own comments come back on the second arm, so the export does not depend on
 *    still having the watch that let you post.
 *  - `follows_select` admits either side of the edge, and the embedded profile is
 *    subject to `profiles_select` — so a followee who has blocked you resolves to a
 *    null embed and `embeddedPerson` drops it. Their handle is absent from the export
 *    by design rather than by accident.
 *  - `lists_write`, `list_items_write` and `follows_write` all check ownership on
 *    insert, which is what `createList`, `addToList` and `follow` set.
 */
const ROOT = resolve(__dirname, '../../..');
const MIGRATIONS = resolve(ROOT, 'supabase/migrations');

type Operation = 'select' | 'insert' | 'update' | 'delete';
const OPERATIONS: Operation[] = ['select', 'insert', 'update', 'delete'];

// ---------------------------------------------------------------------------
// The schema, as the migrations describe it.
// ---------------------------------------------------------------------------

interface Column {
  name: string;
  /** The table this column references, when it is a foreign key. */
  references?: string;
}

function readSchema(): Map<string, Column[]> {
  const sql = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(resolve(MIGRATIONS, f), 'utf8'))
    .join('\n');

  const tables = new Map<string, Column[]>();

  for (const match of sql.matchAll(/create table if not exists ([a-z_]+) \(([\s\S]*?)\n\);/g)) {
    const columns: Column[] = [];
    for (const line of match[2].split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('--')) continue;
      const name = trimmed.split(/\s+/)[0];
      // Table-level constraints are not columns.
      if (!/^[a-z_]+$/.test(name)) continue;
      if (['primary', 'unique', 'check', 'constraint', 'foreign'].includes(name)) continue;
      const referenced = /references\s+([a-z_]+)\s*\(/.exec(trimmed)?.[1];
      columns.push({ name, references: referenced });
    }
    tables.set(match[1], columns);
  }

  // `alter table ... add column` is rare here but it exists, and a column added in a
  // later migration is exactly the sort of thing a create-table-only parser misses.
  //
  // `\s+` rather than a literal space: 0013 wraps the statement over two lines, and a
  // guard that stops seeing a column because somebody reformatted the SQL is a guard
  // that reports a clean sweep while covering less. §6.66.
  for (const match of sql.matchAll(
    /alter table\s+([a-z_]+)\s+add column(?:\s+if not exists)?\s+([a-z_]+)/g,
  )) {
    tables.get(match[1])?.push({ name: match[2] });
  }

  return tables;
}

const allSql = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(MIGRATIONS, f), 'utf8'))
  .join('\n');

const schema = readSchema();
const policies = readPolicies(allSql);
/** Tables that have RLS turned on at all. Without it a policy is beside the point. */
const secured = new Set(
  [...allSql.matchAll(/alter table\s+([a-z_]+)\s+enable row level security/g)].map((m) => m[1]),
);

// ---------------------------------------------------------------------------
// The queries, as the client writes them.
// ---------------------------------------------------------------------------

interface Query {
  file: string;
  table: string;
  /** Column names this query names, in selects, filters, ordering and writes. */
  columns: string[];
  /** What this chain does to the table. */
  operations: Operation[];
}

/** An embedded resource, as `profiles!follows_followee_id_fkey`. */
interface Join {
  file: string;
  target: string;
  constraint?: string;
}

/**
 * Which operations each table has a policy for.
 *
 * Row-level security enabled with no matching policy is not an error — it is zero
 * rows, and on a write it is a refusal that reads exactly like any other. So a table
 * the client reads and the schema never granted a select on behaves as an empty table
 * forever, which is the same silent-empty failure as a misspelled column.
 */
function readPolicies(sql: string): Map<string, Set<Operation>> {
  const policies = new Map<string, Set<Operation>>();
  for (const match of sql.matchAll(
    /create policy [a-z_]+\s+on ([a-z_]+)\s+for (select|insert|update|delete|all)/g,
  )) {
    const table = match[1];
    const granted = policies.get(table) ?? new Set<Operation>();
    if (match[2] === 'all') for (const op of OPERATIONS) granted.add(op);
    else granted.add(match[2] as Operation);
    policies.set(table, granted);
  }
  return policies;
}

function sourceFiles(): string[] {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) walk(path, out);
      else if (entry.name.endsWith('.ts') && !entry.name.includes('.test.')) out.push(path);
    }
    return out;
  };
  return walk(resolve(ROOT, 'core/src'));
}

/**
 * Pull the columns out of one `.from(...)` chain.
 *
 * A parser rather than a regex over the whole file, because the same column name means
 * different things against different tables and the point is to check each against its
 * own. The chain is taken as the text from `.from('x')` up to the next `.from(` or the
 * end of the statement, which is how these are written throughout.
 */
function queriesIn(path: string): Query[] {
  const source = readFileSync(path, 'utf8');
  const file = path.slice(ROOT.length + 1);
  const found: Query[] = [];

  for (const match of source.matchAll(/\.from\('([a-z_]+)'\)/g)) {
    const start = match.index! + match[0].length;
    const next = source.indexOf(".from('", start);
    const chain = source.slice(start, next === -1 ? start + 900 : next);

    const columns: string[] = [];

    // .select('a, b, c') and .select(`a, profiles!fkey (id, handle)`)
    for (const select of chain.matchAll(/\.select\(\s*[`'"]([^`'"]*)[`'"]/g)) {
      // An embedded resource brings its own bracketed column list, which belongs to a
      // different table; strip it here and check the join separately.
      let list = select[1];
      for (const embed of list.matchAll(/([a-z_]+(?:![a-z_]+)?)\s*\(([^)]*)\)/g)) {
        list = list.replace(embed[0], '');
      }
      for (const name of list.split(',')) {
        const clean = name.trim();
        if (/^[a-z_]+$/.test(clean)) columns.push(clean);
      }
    }

    // .eq('col', …), .neq, .is, .order('col'), .in
    for (const filter of chain.matchAll(/\.(?:eq|neq|is|gt|gte|lt|lte|in|order)\('([a-z_]+)'/g)) {
      columns.push(filter[1]);
    }

    // .insert({ a: …, b: … }) / .update({ … }) / .upsert({ … })
    for (const write of chain.matchAll(/\.(?:insert|update|upsert)\(\s*\{([\s\S]*?)\n\s*\}/g)) {
      for (const key of write[1].matchAll(/^\s*([a-z_]+):/gm)) columns.push(key[1]);
    }
    // The single-line form, which several of these use.
    for (const write of chain.matchAll(/\.(?:insert|update|upsert)\(\{ ([^}]*) \}\)/g)) {
      for (const key of write[1].matchAll(/([a-z_]+):/g)) columns.push(key[1]);
    }

    const operations = new Set<Operation>();
    if (/\.select\(/.test(chain)) operations.add('select');
    if (/\.(?:insert|upsert)\(/.test(chain)) operations.add('insert');
    if (/\.(?:update|upsert)\(/.test(chain)) operations.add('update');
    if (/\.delete\(/.test(chain)) operations.add('delete');

    found.push({
      file,
      table: match[1],
      columns: [...new Set(columns)],
      operations: [...operations],
    });
  }

  return found;
}

/**
 * Every join-shaped literal in a file, wherever it is written.
 *
 * Not tied to a `.from(...)` chain on purpose. `fetchEdge` picks one of two embeds into
 * a variable before passing it to `.select`, and a scan that only looked inside the
 * chain would find nothing there and pass — the worst outcome for a check whose whole
 * job is these two names.
 */
function joinsIn(path: string): Join[] {
  const source = readFileSync(path, 'utf8');
  const file = path.slice(ROOT.length + 1);
  const found: Join[] = [];

  for (const match of source.matchAll(/'([a-z_]+)!([a-z_]+_fkey) \(/g)) {
    found.push({ file, target: match[1], constraint: match[2] });
  }
  return found;
}

const files = sourceFiles();
const queries = files.flatMap(queriesIn);
const joins = files.flatMap(joinsIn);

// ---------------------------------------------------------------------------

describe('what the client asks the backend for', () => {
  it('found the queries and the schema, so the checks below mean something', () => {
    // Both halves, because either one coming back empty would pass everything.
    expect(schema.size).toBeGreaterThan(10);
    expect(schema.get('lists')?.map((c) => c.name)).toContain('description');
    expect(queries.length).toBeGreaterThan(25);
    expect(queries.map((q) => q.table)).toContain('list_items');
    // Every embed in the core, or the join check below has nothing to check. Listed
    // rather than counted: an embed that disappears because somebody rewrote the query
    // as two round trips should be noticed here rather than quietly reduce the cover.
    expect(joins.map((j) => j.constraint).sort()).toEqual([
      'blocks_blocked_id_fkey',
      'follows_followee_id_fkey',
      'follows_follower_id_fkey',
    ]);
  });

  it('names only tables that exist', () => {
    const unknown = queries
      .filter((q) => !schema.has(q.table))
      .map((q) => `${q.file}: ${q.table}`);

    expect(unknown).toEqual([]);
  });

  it('names only columns that exist on the table it is querying', () => {
    const wrong: string[] = [];
    for (const query of queries) {
      const columns = new Set(schema.get(query.table)?.map((c) => c.name) ?? []);
      for (const column of query.columns) {
        if (!columns.has(column)) wrong.push(`${query.file}: ${query.table}.${column}`);
      }
    }

    expect(wrong).toEqual([]);
  });

  it('joins through foreign keys Postgres will actually have named', () => {
    // `profiles!follows_followee_id_fkey` is built by string concatenation in people.ts
    // and there is no explicit constraint name in any migration — Postgres derives
    // `<table>_<column>_fkey` from the inline `references`. So the column has to exist,
    // and it has to be a foreign key, and it has to point where the join says.
    const wrong: string[] = [];

    for (const join of joins) {
      if (!schema.has(join.target)) {
        wrong.push(`${join.file}: joins ${join.target}, which is not a table`);
        continue;
      }

      const parsed = /^([a-z_]+?)_([a-z_]+)_fkey$/.exec(join.constraint!);
      if (!parsed) {
        wrong.push(`${join.file}: ${join.constraint} is not a name Postgres would derive`);
        continue;
      }

      const [, table, column] = parsed;
      const found = schema.get(table)?.find((c) => c.name === column);
      if (!found) {
        wrong.push(`${join.file}: ${join.constraint} names ${table}.${column}, which does not exist`);
      } else if (found.references !== join.target) {
        wrong.push(
          `${join.file}: ${join.constraint} claims to reach ${join.target}, but ${table}.${column} references ${found.references ?? 'nothing'}`,
        );
      }
    }

    expect(wrong).toEqual([]);
  });

  it('does nothing to a secured table that has no policy for it', () => {
    // Read after the column checks because it is the same failure wearing a different
    // hat: a select with no policy behind it returns an empty set rather than an
    // error, so a table nobody granted reads on looks exactly like a table you have
    // nothing in.
    const missing: string[] = [];

    for (const query of queries) {
      if (!secured.has(query.table)) continue;
      const granted = policies.get(query.table) ?? new Set<Operation>();
      for (const operation of query.operations) {
        if (!granted.has(operation)) missing.push(`${query.file}: ${operation} on ${query.table}`);
      }
    }

    expect(missing).toEqual([]);
  });

  it('reads policies and row-level security from the same migrations', () => {
    // Non-vacuous: an empty policy map would make the check above pass for everything,
    // and an empty `secured` set would make it skip everything.
    expect(policies.get('lists')).toContain('insert');
    expect(policies.get('comments')).toContain('select');
    expect(secured.has('list_items')).toBe(true);
    expect(secured.size).toBeGreaterThan(10);
  });
});
