/**
 * expo-sqlite's rows, in the shape the core's SQLite interface expects.
 *
 * `data/sqlWasm.ts` describes sql.js's result: a column list and a matrix of values,
 * because that is what the web's SQLite is. expo-sqlite hands back an array of row
 * objects instead. Same rows, different arrangement, and this is the whole difference.
 *
 * Kept apart from `platform.ts` so it can be tested: importing that file pulls in
 * expo-sqlite and react-native, whose Flow syntax vitest cannot parse. The native call
 * either works on a device or does not and no suite here can tell — but the reshaping
 * around it is ordinary code, and this is the part a machine can hold. 6.85.
 */
export interface ResultTable {
  columns: string[];
  values: unknown[][];
}

/**
 * `[]` for no rows rather than one empty table: `readDioCache` destructures the first
 * result and treats a missing one as an empty cache, which is what sql.js does when a
 * query selects nothing.
 */
export function toResultTable(rows: Array<Record<string, unknown>>): ResultTable[] {
  const [first] = rows;
  if (!first) return [];
  // Columns come from the first row because SQLite gives every row of one result the
  // same shape. A key missing from a later row would read as `undefined`, which is what
  // a NULL in that column would have produced anyway.
  const columns = Object.keys(first);
  return [{ columns, values: rows.map((row) => columns.map((column) => row[column])) }];
}
