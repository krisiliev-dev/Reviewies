import { createRequire } from 'node:module';

/** Node stand-in for the Vite asset URL; see `sqlWasm.ts`. */
export const sqlWasmUrl: string = createRequire(import.meta.url).resolve(
  'sql.js/dist/sql-wasm.wasm',
);
