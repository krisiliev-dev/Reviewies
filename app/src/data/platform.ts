import { setConfig } from '@reviewies/core/config';
import { setStorage } from '@reviewies/core/data/storage';
import { setFileSaver } from '@reviewies/core/data/transfer';
import { setSqlJsLoader } from '@reviewies/core/data/sqlWasm';
import { sqlWasmUrl } from './sqlWasm';
import { COPY } from '@reviewies/core/copy';
import { loadChunk } from './chunk';

/**
 * Everything the core needs a browser for.
 *
 * Three small bindings, imported once from the entry point. Keeping them together
 * makes the platform surface visible: if this file grows, the core has started
 * depending on the web in ways it should not.
 */
export function bindWebPlatform(): void {
  // Vite replaces these at build time. The core never sees import.meta.env itself,
  // because that is a Vite invention and Metro does not provide it.
  setConfig({
    tmdbToken: import.meta.env?.VITE_TMDB_TOKEN,
    // Unset in every build but the design harness's snapshot pass. §6.151.
    tmdbBase: import.meta.env?.VITE_TMDB_BASE,
    tmdbImage: import.meta.env?.VITE_TMDB_IMAGE,
    supabaseUrl: import.meta.env?.VITE_SUPABASE_URL,
    supabaseAnonKey: import.meta.env?.VITE_SUPABASE_ANON_KEY,
    vapidPublicKey: import.meta.env?.VITE_VAPID_PUBLIC_KEY,
    bridgeRelay: import.meta.env?.VITE_BRIDGE_RELAY,
    bridgeToken: import.meta.env?.VITE_BRIDGE_TOKEN,
  });

  setStorage(localStorage);

  setFileSaver((name, content, type) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Dynamic, so neither the loader nor its 650 KB of WebAssembly reaches the bundle
  // everyone downloads. Only someone importing a recovered TV Time cache pays for it.
  setSqlJsLoader(async () => {
    // Through `loadChunk`, because this is the biggest lazily-loaded thing in the app and
    // the one somebody reaches for at the worst moment — importing the history they came
    // here to rescue. §6.65.
    const module = await loadChunk(() => import('sql.js'));
    if (!module) throw new Error(COPY.app.updated);
    const initSqlJs = module.default;
    return (await initSqlJs({ locateFile: () => sqlWasmUrl })) as never;
  });
}
