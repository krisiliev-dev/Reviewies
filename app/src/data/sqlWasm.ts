import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

/**
 * Where the SQLite WebAssembly binary lives.
 *
 * Split into its own module so tests can point at the file on disk instead. Vite's
 * `?url` gives a browser path, which Node cannot open — and running the importer
 * against real SQLite files is the only way to know the WAL merge actually works, so
 * the tests must be able to load it.
 */
export const sqlWasmUrl: string = wasmUrl;
