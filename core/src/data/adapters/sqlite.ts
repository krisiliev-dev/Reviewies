import type { Database, Query, Table, WhereClause } from '../store.ts';
import { TABLES, createTableSql, quote, type TableSpec } from './schema.ts';

/**
 * SQLite implementation of the core's `Database`.
 *
 * Driver-agnostic on purpose: `sql.js` in tests, `expo-sqlite` on a phone. That is not
 * an abstraction for its own sake — it is what lets the core's existing test suite run
 * against this implementation in CI, rather than being replaced by a second suite
 * written to agree with whatever it happens to do.
 *
 * Rows are stored as JSON with the queried fields lifted into real columns. See
 * `schema.ts` for why.
 */

export interface SqlDriver {
  execute(sql: string, params?: unknown[]): void | Promise<void>;
  select<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[] | Promise<T[]>;
}

/** Dexie throws a `ConstraintError` on a duplicate key, and callers rely on it. */
export class ConstraintError extends Error {
  constructor(table: string, key: string) {
    super(`Key already exists in ${table}: ${key}`);
    this.name = 'ConstraintError';
  }
}

const parse = <T>(row: { doc: string }): T => JSON.parse(row.doc) as T;

/**
 * Sort by a field, using the real column when there is one.
 *
 * Falls back to `json_extract` so that sorting by an unindexed field still works —
 * Dexie's `sortBy` allows any field, and quietly failing on some of them would be a
 * nasty class of bug to chase.
 */
function orderExpression(spec: TableSpec, field: string): string {
  if (field === spec.primaryKey || spec.indexed.includes(field)) return quote(field);
  return `json_extract(doc, '$.${field}')`;
}

class SqliteQuery<T> implements Query<T> {
  private readonly driver: SqlDriver;
  private readonly spec: TableSpec;
  private readonly where: { clause: string; params: unknown[] };
  private readonly order?: { field: string; descending: boolean };
  private readonly max?: number;

  constructor(
    driver: SqlDriver,
    spec: TableSpec,
    where: { clause: string; params: unknown[] },
    order?: { field: string; descending: boolean },
    max?: number,
  ) {
    this.driver = driver;
    this.spec = spec;
    this.where = where;
    this.order = order;
    this.max = max;
  }

  private with(changes: Partial<{ order: SqliteQuery<T>['order']; max: number }>): SqliteQuery<T> {
    return new SqliteQuery<T>(
      this.driver,
      this.spec,
      this.where,
      'order' in changes ? changes.order : this.order,
      changes.max ?? this.max,
    );
  }

  limit(count: number): Query<T> {
    return this.with({ max: count });
  }

  reverse(): Query<T> {
    // Reversing with no ordering means reversing the primary key, which is what
    // Dexie does for a plain table scan.
    const field = this.order?.field ?? this.spec.primaryKey;
    return this.with({ order: { field, descending: !(this.order?.descending ?? false) } });
  }

  private sql(select: string): string {
    let sql = `SELECT ${select} FROM ${quote(this.spec.name)} ${this.where.clause}`;
    if (this.order) {
      sql += ` ORDER BY ${orderExpression(this.spec, this.order.field)}`;
      sql += this.order.descending ? ' DESC' : ' ASC';
    }
    if (this.max !== undefined) sql += ` LIMIT ${Number(this.max)}`;
    return sql;
  }

  async toArray(): Promise<T[]> {
    const rows = await this.driver.select<{ doc: string }>(this.sql('doc'), this.where.params);
    return rows.map(parse<T>);
  }

  async count(): Promise<number> {
    // A limit changes what "how many" means, so count the rows rather than the matches.
    if (this.max !== undefined) return (await this.toArray()).length;
    const rows = await this.driver.select<{ n: number }>(
      this.sql('COUNT(*) AS n'),
      this.where.params,
    );
    return Number(rows[0]?.n ?? 0);
  }

  async delete(): Promise<number> {
    const doomed = await this.count();
    await this.driver.execute(
      `DELETE FROM ${quote(this.spec.name)} ${this.where.clause}`,
      this.where.params,
    );
    return doomed;
  }

  sortBy(field: string): Promise<T[]> {
    return this.with({ order: { field, descending: false } }).toArray();
  }
}

class SqliteTable<T> implements Table<T> {
  private readonly driver: SqlDriver;
  private readonly spec: TableSpec;

  constructor(driver: SqlDriver, spec: TableSpec) {
    this.driver = driver;
    this.spec = spec;
  }

  private columnsFor(value: T): { names: string[]; values: unknown[] } {
    const record = value as Record<string, unknown>;
    const names = [this.spec.primaryKey, ...this.spec.indexed, 'doc'];
    const values = [
      String(record[this.spec.primaryKey]),
      ...this.spec.indexed.map((field) => {
        const raw = record[field];
        // SQLite has no boolean; storing them as 0/1 keeps comparisons working.
        if (typeof raw === 'boolean') return raw ? 1 : 0;
        return raw === undefined ? null : (raw as unknown);
      }),
      JSON.stringify(value),
    ];
    return { names, values };
  }

  private async write(value: T, replace: boolean): Promise<void> {
    const { names, values } = this.columnsFor(value);
    const verb = replace ? 'INSERT OR REPLACE' : 'INSERT';
    await this.driver.execute(
      `${verb} INTO ${quote(this.spec.name)} (${names.map(quote).join(', ')}) ` +
        `VALUES (${names.map(() => '?').join(', ')})`,
      values,
    );
  }

  async get(key: string): Promise<T | undefined> {
    const rows = await this.driver.select<{ doc: string }>(
      `SELECT doc FROM ${quote(this.spec.name)} WHERE ${quote(this.spec.primaryKey)} = ?`,
      [key],
    );
    return rows[0] ? parse<T>(rows[0]) : undefined;
  }

  async put(value: T): Promise<unknown> {
    await this.write(value, true);
    return (value as Record<string, unknown>)[this.spec.primaryKey];
  }

  async add(value: T): Promise<unknown> {
    const key = String((value as Record<string, unknown>)[this.spec.primaryKey]);
    if (await this.get(key)) throw new ConstraintError(this.spec.name, key);
    await this.write(value, false);
    return key;
  }

  async update(key: string, changes: Partial<T>): Promise<number> {
    const existing = await this.get(key);
    if (!existing) return 0;
    await this.put({ ...existing, ...changes });
    return 1;
  }

  async delete(key: string): Promise<void> {
    await this.driver.execute(
      `DELETE FROM ${quote(this.spec.name)} WHERE ${quote(this.spec.primaryKey)} = ?`,
      [key],
    );
  }

  async bulkPut(values: T[]): Promise<unknown> {
    for (const value of values) await this.write(value, true);
    return values.length;
  }

  async bulkAdd(values: T[]): Promise<unknown> {
    for (const value of values) await this.add(value);
    return values.length;
  }

  count(): Promise<number> {
    return this.all().count();
  }

  toArray(): Promise<T[]> {
    return this.all().toArray();
  }

  async clear(): Promise<void> {
    await this.driver.execute(`DELETE FROM ${quote(this.spec.name)}`);
  }

  private all(): SqliteQuery<T> {
    return new SqliteQuery<T>(this.driver, this.spec, { clause: '', params: [] });
  }

  where(field: string): WhereClause<T> {
    const column = orderExpression(this.spec, field);
    return {
      equals: (value) =>
        new SqliteQuery<T>(this.driver, this.spec, {
          clause: `WHERE ${column} = ?`,
          params: [value],
        }),
      above: (value) =>
        new SqliteQuery<T>(this.driver, this.spec, {
          clause: `WHERE ${column} > ?`,
          params: [value],
        }),
    };
  }

  orderBy(field: string): Query<T> {
    return new SqliteQuery<T>(this.driver, this.spec, { clause: '', params: [] }, {
      field,
      descending: false,
    });
  }
}

export class SqliteDatabase implements Database {
  private readonly tables = new Map<string, SqliteTable<never>>();
  /** SQLite has no nested BEGIN, and the repository does nest. */
  private depth = 0;

  private readonly driver: SqlDriver;

  constructor(driver: SqlDriver) {
    this.driver = driver;
    for (const spec of TABLES) {
      this.tables.set(spec.name, new SqliteTable(driver, spec));
    }
  }

  static async open(driver: SqlDriver): Promise<SqliteDatabase> {
    for (const spec of TABLES) {
      for (const statement of createTableSql(spec)) await driver.execute(statement);
    }
    return new SqliteDatabase(driver);
  }

  table(name: string): Table<Record<string, unknown>> {
    const table = this.tables.get(name);
    if (!table) throw new Error(`No such table: ${name}`);
    return table as unknown as Table<Record<string, unknown>>;
  }

  get watches() { return this.table('watches') as never; }
  get ratings() { return this.table('ratings') as never; }
  get watchlist() { return this.table('watchlist') as never; }
  get library() { return this.table('library') as never; }
  get reactions() { return this.table('reactions') as never; }
  get titles() { return this.table('titles') as never; }
  get episodes() { return this.table('episodes') as never; }
  get providers() { return this.table('providers') as never; }
  get animeIds() { return this.table('animeIds') as never; }
  get outbox() { return this.table('outbox') as never; }
  get syncState() { return this.table('syncState') as never; }

  /**
   * The table arguments are accepted and ignored: they exist so Dexie can lock the
   * right stores, and SQLite locks the whole connection anyway. Only the trailing
   * function matters.
   *
   * Nesting is counted rather than rejected, because the repository legitimately
   * nests — `catchUpTo` writes inside a transaction and each write enqueues — and
   * SQLite has no nested BEGIN. The outermost call owns the commit.
   */
  async transaction(_mode: 'r' | 'rw', ...args: unknown[]): Promise<unknown> {
    const body = args[args.length - 1];
    if (typeof body !== 'function') throw new Error('transaction() needs a function');

    if (this.depth > 0) {
      this.depth++;
      try {
        return await (body as () => Promise<unknown>)();
      } finally {
        this.depth--;
      }
    }

    this.depth = 1;
    await this.driver.execute('BEGIN');
    try {
      const result = await (body as () => Promise<unknown>)();
      await this.driver.execute('COMMIT');
      return result;
    } catch (error) {
      await this.driver.execute('ROLLBACK');
      throw error;
    } finally {
      this.depth = 0;
    }
  }

}
