/**
 * Where to find the SQLite WebAssembly binary, and how to load it.
 *
 * Bound by the app, because there is no portable answer: Vite resolves it with a
 * `?url` import, Metro bundles assets differently again, and Node needs a filesystem
 * path. The core only needs to be told.
 *
 * This exists solely for reading a recovered `DioCache.db`, which is a once-ever act,
 * so nothing here is loaded until someone actually imports one.
 */
export type SqlJsLoader = () => Promise<{
  Database: new (data?: Uint8Array) => {
    exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
    close(): void;
  };
}>;

let loader: SqlJsLoader | undefined;

export function setSqlJsLoader(load: SqlJsLoader): void {
  loader = load;
}

export function getSqlJsLoader(): SqlJsLoader {
  if (!loader) {
    throw new Error(
      'Reading a TV Time cache needs SQLite, which this app has not set up. Call ' +
        'setSqlJsLoader() from your entry point.',
    );
  }
  return loader;
}
