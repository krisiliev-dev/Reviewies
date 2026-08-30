import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { setConfig } from '@reviewies/core/config';
import { setAuthStorage } from '@reviewies/core/sync/auth';
import { setDatabase } from '@reviewies/core/data/db';
import { SqliteDatabase, type SqlDriver } from '@reviewies/core/data/adapters/sqlite';
import { setStorage, type KeyValueStore } from '@reviewies/core/data/storage';
import { setFileSaver } from '@reviewies/core/data/transfer';
import { setSqlJsLoader } from '@reviewies/core/data/sqlWasm';
import { toResultTable } from './sqlResult';

/**
 * Everything the core needs a phone for.
 *
 * Four bindings, done once before anything renders. Keeping them in one file makes
 * the platform surface visible: if this grows, the core has started depending on the
 * device in ways it should not.
 */

/** expo-sqlite's async API, shaped to the driver the core's SQLite adapter expects. */
function createDriver(database: SQLite.SQLiteDatabase): SqlDriver {
  return {
    async execute(sql, params) {
      await database.runAsync(sql, (params ?? []) as SQLite.SQLiteBindValue[]);
    },
    async select(sql, params) {
      return (await database.getAllAsync(
        sql,
        (params ?? []) as SQLite.SQLiteBindValue[],
      )) as never;
    },
  };
}

/**
 * A synchronous view over AsyncStorage.
 *
 * The core reads preferences during render, so it needs them synchronously. These are
 * a handful of small values that only change when the person looking at them changes
 * them, so hydrating once at startup and writing through is both correct and simpler
 * than threading loading states through the UI for the sake of a boolean.
 */
class HydratedStore implements KeyValueStore {
  private readonly values = new Map<string, string>();

  async hydrate(): Promise<void> {
    const keys = await AsyncStorage.getAllKeys();
    for (const [key, value] of await AsyncStorage.multiGet(keys)) {
      if (value !== null) this.values.set(key, value);
    }
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
    // Fire and forget: the in-memory copy is already correct, and a failed write
    // must not be able to break the interaction that caused it.
    void AsyncStorage.setItem(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
    void AsyncStorage.removeItem(key);
  }
}

/**
 * Read configuration from the Expo manifest.
 *
 * `extra` is populated from the environment at build time by `mobile/app.config.ts`,
 * which is the Metro equivalent of Vite replacing `import.meta.env`.
 *
 * That sentence used to name `app.json` and was simply untrue: a static JSON file
 * interpolates nothing, and the three keys were empty strings there. No native build
 * had ever been made, so nothing noticed that the phone would have shipped with no
 * provider token and no backend. `mobile/src/nativeConfig.test.ts` now requires every
 * key read here to be one the build-time config actually produces.
 */
function readConfig() {
  // Five keys now: the three below and the two endpoints, which are unset in every build
  // but the design harness's snapshot pass (§6.151). This also read `vapidPublicKey`,
  // `bridgeRelay` and
  // `bridgeToken` — none of which app.json's `extra` has ever contained, and none of
  // which anything on the phone consumes: web push is a browser mechanism and this app
  // uses Expo's, and the phone reaches a television directly rather than through the
  // relay, which is what going native bought (§1.1). Reading a key from a place it can
  // never arrive is the same shape as §6.43 one layer down. §6.43.
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;
  return {
    tmdbToken: extra.tmdbToken,
    tmdbBase: extra.tmdbBase,
    tmdbImage: extra.tmdbImage,
    supabaseUrl: extra.supabaseUrl,
    supabaseAnonKey: extra.supabaseAnonKey,
  };
}

let ready: Promise<void> | undefined;

export function bindNativePlatform(): Promise<void> {
  ready ??= (async () => {
    setConfig(readConfig());

    // Before anything can create the Supabase client. supabase-js reaches for
    // localStorage by default, which does not exist here — without this the session
    // is lost on every launch and the user is signed out each time they open the app.
    setAuthStorage(AsyncStorage);

    const store = new HydratedStore();
    await store.hydrate();
    setStorage(store);

    // Write-ahead logging, for the same reason TV Time used it: it keeps reads from
    // blocking on writes, which is what makes marking an episode feel instant.
    const database = await SQLite.openDatabaseAsync('reviewies.db', {
      enableChangeListener: true,
    });
    await database.execAsync('PRAGMA journal_mode = WAL');
    setDatabase(await SqliteDatabase.open(createDriver(database)));

    // Reading a recovered `DioCache.db` needs a second SQLite: not the app's own
    // database but a throwaway one over bytes a person picked out of Files. The web
    // fetches sql.js' WebAssembly for this; the phone cannot, because Hermes has no
    // WebAssembly at all — and does not need to, with expo-sqlite already compiled in.
    //
    // Until 6.85 nothing here bound one, and `coreWiring` carried a written reason
    // saying the phone "never asks for one". It asks the first time anybody imports a
    // database, and failed on a device with the error naming this very function.
    setSqlJsLoader(async () => ({
      Database: class {
        private readonly database: SQLite.SQLiteDatabase;

        constructor(data?: Uint8Array) {
          // `deserializeDatabaseSync` opens the bytes in memory, so nothing is written
          // to disk and there is no temporary file to clean up after a failed import.
          this.database = data
            ? SQLite.deserializeDatabaseSync(data)
            : SQLite.openDatabaseSync(':memory:');
        }

        exec(sql: string) {
          return toResultTable(this.database.getAllSync(sql) as Array<Record<string, unknown>>);
        }

        close() {
          this.database.closeSync();
        }
      },
    }));

    setFileSaver(async (name, content) => {
      const { documentDirectory, writeAsStringAsync } = await import('expo-file-system/legacy');
      const { isAvailableAsync, shareAsync } = await import('expo-sharing');
      const path = `${documentDirectory}${name}`;
      await writeAsStringAsync(path, content);
      // Sharing is how a file leaves an app on a phone; without it the export would
      // be written somewhere the user cannot reach, which is worse than not offering.
      if (await isAvailableAsync()) await shareAsync(path);
    });
  })();

  return ready;
}
