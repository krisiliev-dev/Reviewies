/**
 * The shape of each table, shared by every SQL-backed implementation.
 *
 * Rows are stored as JSON in a `doc` column, with the queried fields lifted into real
 * columns beside it. That keeps the schema honest about what is actually indexed —
 * this list is exactly the set of fields the code filters or orders by, taken from the
 * Dexie schema — without needing a column per property or a migration every time a
 * type gains a field.
 */
export interface TableSpec {
  name: string;
  primaryKey: string;
  /** Fields promoted to real columns because something queries them. */
  indexed: string[];
}

export const TABLES: TableSpec[] = [
  // User data.
  { name: 'library', primaryKey: 'titleId', indexed: ['kind', 'status', 'addedAt'] },
  // targetId is not unique — repeat rows are rewatches, which is the point.
  { name: 'watches', primaryKey: 'id', indexed: ['targetId', 'seriesId', 'watchedAt'] },
  { name: 'ratings', primaryKey: 'targetId', indexed: ['ratedAt'] },
  { name: 'watchlist', primaryKey: 'titleId', indexed: ['kind', 'addedAt'] },
  { name: 'reactions', primaryKey: 'id', indexed: ['targetId', 'tMs'] },

  // Provider metadata, TTL'd and disposable. Kept physically separate from the above
  // so a complete export of your own history is trivially defined.
  { name: 'titles', primaryKey: 'id', indexed: ['kind', 'fetchedAt'] },
  { name: 'episodes', primaryKey: 'id', indexed: ['seriesId', 'season', 'fetchedAt'] },
  { name: 'providers', primaryKey: 'id', indexed: ['fetchedAt'] },
  { name: 'animeIds', primaryKey: 'id', indexed: ['fetchedAt'] },

  // Sync bookkeeping.
  { name: 'outbox', primaryKey: 'key', indexed: ['table', 'updatedAt'] },
  { name: 'syncState', primaryKey: 'key', indexed: [] },
];


/** `table` is a reserved word in SQL, and one of our columns is called that. */
export const quote = (identifier: string): string => `"${identifier.replace(/"/g, '""')}"`;

export function createTableSql(spec: TableSpec): string[] {
  const columns = [
    `${quote(spec.primaryKey)} TEXT PRIMARY KEY`,
    ...spec.indexed.map((field) => `${quote(field)} ANY`),
    'doc TEXT NOT NULL',
  ];
  return [
    `CREATE TABLE IF NOT EXISTS ${quote(spec.name)} (${columns.join(', ')})`,
    ...spec.indexed.map(
      (field) =>
        `CREATE INDEX IF NOT EXISTS ${quote(`${spec.name}_${field}`)} ` +
        `ON ${quote(spec.name)} (${quote(field)})`,
    ),
  ];
}
