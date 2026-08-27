import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { stripComments } from '@reviewies/core/test/source';

/**
 * The phone's build-time configuration has to come from somewhere.
 *
 * `mobile/src/platform.ts` reads three keys out of `Constants.expoConfig.extra` and
 * carried a comment saying they were "populated from the environment at build time".
 * They were not: `app.json` is static, it held three empty strings, and Expo only
 * substitutes environment variables through a JS config. Every native build would have
 * shipped with no provider token and no backend — Search and Discover quietly on
 * fixtures, sync unconfigured — and nothing said so, because nobody has ever made a
 * native build.
 *
 * That is §6.68's shape one layer out: a value read from a place it can never arrive.
 * The web end of the same three is checked by `injection`; this is the phone's.
 *
 * It lives in `mobile/` rather than beside the other guards because vitest resolves
 * modules from its own root, and this one evaluates the real `app.config.ts` rather
 * than reading it as text — which is the only way to prove the substitution happens.
 */
const ROOT = resolve(import.meta.dirname, '../..');
const CONFIG = resolve(ROOT, 'mobile/app.config.ts');

const read = (file: string) => stripComments(readFileSync(resolve(ROOT, file), 'utf8'));

/** Every `extra.<name>` the phone reads at runtime. */
function keysRead(): string[] {
  const source = read('mobile/src/platform.ts');
  return [...source.matchAll(/\bextra\.(\w+)/g)].map((m) => m[1]);
}

/** Every key the build-time config puts into `extra`. */
function keysProduced(): string[] {
  const source = read('mobile/app.config.ts');
  const block = source.slice(source.indexOf('extra: {'));
  return [...block.matchAll(/^\s{4}(\w+)[,:]/gm)].map((m) => m[1]);
}

/**
 * A fresh evaluation of the real config file under a chosen environment.
 *
 * `delete` rather than assigning `undefined`: Node's env object coerces every value to
 * a string, so `Object.assign(process.env, { KEY: undefined })` sets it to the literal
 * `'undefined'` — which is truthy, and made the first version of this file assert that
 * a token was absent while handing the config a five-letter one. It also made the
 * service-key case pass without the check ever running.
 *
 * The `?url` query defeats the ES module cache, which `vi.resetModules()` does not
 * reach for a `file://` import — without it every case after the first would read the
 * environment of the first.
 */
let evaluation = 0;
async function configWith(env: Record<string, string | undefined>) {
  vi.resetModules();
  const before = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    const mod = await import(/* @vite-ignore */ `file://${CONFIG}?v=${evaluation++}`);
    return mod.default as { extra?: Record<string, unknown>; plugins?: unknown[] };
  } finally {
    process.env = before;
  }
}

afterEach(() => vi.resetModules());

describe("the phone's build-time configuration", () => {
  it('reads a set of keys rather than none', () => {
    // A platform.ts that had stopped reading `extra` would pass everything below.
    expect(keysRead().length).toBeGreaterThanOrEqual(3);
    expect(keysRead()).toContain('tmdbToken');
  });

  it('produces every key the phone reads', () => {
    const produced = new Set(keysProduced());
    const missing = keysRead().filter((key) => !produced.has(key));
    expect(missing, 'read from `extra` but nothing ever puts them there').toEqual([]);
  });

  it('carries the environment through to the manifest', async () => {
    const config = await configWith({
      EXPO_PUBLIC_TMDB_TOKEN: undefined,
      EXPO_PUBLIC_SUPABASE_URL: undefined,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: undefined,
      VITE_TMDB_TOKEN: 'tmdb-from-env',
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_example',
    });
    expect(config.extra?.tmdbToken).toBe('tmdb-from-env');
    expect(config.extra?.supabaseUrl).toBe('https://example.supabase.co');
    expect(config.extra?.supabaseAnonKey).toBe('sb_publishable_example');
  });

  it('prefers the Expo names over the web ones when both are set', async () => {
    const config = await configWith({
      EXPO_PUBLIC_TMDB_TOKEN: 'expo-name',
      VITE_TMDB_TOKEN: 'vite-name',
    });
    expect(config.extra?.tmdbToken).toBe('expo-name');
  });

  /**
   * Signing with a free Apple ID.
   *
   * `expo-notifications` is autolinked, so prebuild writes `aps-environment` into the
   * entitlements whether anybody asked for it or not — and a personal team cannot sign
   * an app that declares it. Verified by running prebuild both ways: without the flag
   * the entitlements carry `aps-environment: development`, with it they are empty, and
   * the Bonjour services, background audio mode and microphone description survive
   * either way. §6.81.
   */
  it('leaves the push entitlement alone by default', async () => {
    const config = await configWith({ REVIEWIES_PERSONAL_TEAM: undefined });
    expect(JSON.stringify(config.plugins)).not.toContain('withPersonalTeamSigning');
  });

  it('strips the push entitlement when signing with a personal team', async () => {
    const config = await configWith({ REVIEWIES_PERSONAL_TEAM: '1' });
    expect(JSON.stringify(config.plugins)).toContain('withPersonalTeamSigning');
  });

  it('keeps the plugins app.json already declared either way', async () => {
    for (const flag of [undefined, '1']) {
      const config = await configWith({ REVIEWIES_PERSONAL_TEAM: flag });
      const plugins = JSON.stringify(config.plugins);
      // The four the phone cannot work without: routing, the store, and the two that
      // write the Info.plist entries the remote and the fingerprinter depend on.
      for (const name of ['expo-router', 'expo-sqlite', 'expo-audio', 'expo-image-picker']) {
        expect(plugins, `${name} missing with flag ${String(flag)}`).toContain(name);
      }
    }
  });

  /**
   * The one that must never be a warning. Everything in `extra` reaches the device in
   * plain text, so a service key there would hand every reader full access to the
   * database, and no amount of RLS would matter.
   */
  it('refuses to build with a service key in the anon slot', async () => {
    await expect(
      configWith({
        EXPO_PUBLIC_SUPABASE_ANON_KEY: undefined,
        VITE_SUPABASE_ANON_KEY: 'sb_secret_pretend',
      }),
    ).rejects.toThrow(/service key/i);
  });

  /**
   * An unset key has to arrive as `undefined`, not `''`.
   *
   * The app distinguishes "no provider configured" from "configured and failing" and
   * says different things for each (§6.57). An empty string is truthy enough to look
   * like the second, which is how somebody ends up reading "the provider is
   * unreachable" about a token nobody ever set.
   *
   * Written as empty values rather than absent ones on purpose: `app.config.ts` reads
   * the repository's own `.env`, so deleting a key from `process.env` does not make it
   * unset — and `VITE_TMDB_TOKEN=` in a `.env` is exactly the real case anyway.
   */
  it('treats an empty value as unconfigured rather than as a value', async () => {
    const config = await configWith({
      EXPO_PUBLIC_TMDB_TOKEN: '',
      VITE_TMDB_TOKEN: '',
      EXPO_PUBLIC_SUPABASE_URL: '',
      VITE_SUPABASE_URL: '',
    });
    expect(config.extra?.tmdbToken).toBeUndefined();
    expect(config.extra?.supabaseUrl).toBeUndefined();
  });
});

/**
 * The Mac toolchain the native build needs, which nothing in this repository stated.
 *
 * §6.81 checked what prebuild *generates* and stopped there, because prebuild is the
 * part that runs without a Mac. The part that needs one was left as a prediction, and
 * the first time it ran the compile failed before any of this project's own code was
 * touched:
 *
 * > xcodebuild: error: Could not resolve package dependencies:
 * >   package 'apple' is using Swift tools version 6.2.0 but the installed version is 6.1.0
 *
 * `expo-modules-jsi` builds itself as an xcframework from a Swift package during
 * `pod install`'s build phase, and that package declares `swift-tools-version: 6.2`.
 * Swift 6.2 ships with Xcode 26. Xcode 16.4 carries 6.1, so the build is impossible
 * rather than misconfigured — no flag, plugin or entitlement reaches it.
 *
 * The guide now says so. This ties that sentence to the dependency it describes, so a
 * future Expo bump cannot leave the guide quietly naming an Xcode that stopped being
 * enough — the §6.68 shape again, a stated requirement with nothing holding it to the
 * thing it is a requirement for.
 */
describe('the Mac toolchain the native build needs', () => {
  /** The Expo packages that compile themselves from a Swift package, not a podspec. */
  const SWIFT_PACKAGES = ['expo-modules-jsi', '@expo/expo-modules-macros-plugin'];

  /** The first Xcode to carry each Swift toolchain, written as the guide writes it. */
  const XCODE_FOR_SWIFT: Record<string, string> = {
    '5.9': '15',
    '5.10': '15.3',
    '6.0': '16',
    '6.1': '16.3',
    '6.2': '26',
  };

  const older = (a: string, b: string) => {
    const [x, y] = [a, b].map((v) => v.split('.').map(Number));
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
    }
    return false;
  };

  /**
   * Read rather than parsed: `swift-tools-version` lives in a *comment* on the first
   * line of `Package.swift`, which is why `stripComments` is not used here — it would
   * remove the only line that matters.
   */
  function requiredSwiftTools(): string {
    const require_ = createRequire(join(ROOT, 'mobile/'));
    let highest = '0';
    for (const name of SWIFT_PACKAGES) {
      const file = join(dirname(require_.resolve(`${name}/package.json`)), 'apple/Package.swift');
      const match = /swift-tools-version:\s*([\d.]+)/.exec(readFileSync(file, 'utf8'));
      expect(match, `no swift-tools-version in ${file}`).not.toBeNull();
      if (older(highest, match![1])) highest = match![1];
    }
    return highest;
  }

  it('needs a Swift toolchain the guide can name an Xcode for', () => {
    const swift = requiredSwiftTools();
    expect(
      XCODE_FOR_SWIFT[swift],
      `Expo now wants Swift ${swift} and nothing here says which Xcode carries it`,
    ).toBeDefined();
  });

  it('names that Xcode in the install guide', () => {
    const xcode = XCODE_FOR_SWIFT[requiredSwiftTools()];
    const guide = readFileSync(resolve(ROOT, 'docs/installing-on-iphone.md'), 'utf8');
    expect(
      guide,
      `the pods need Xcode ${xcode} and docs/installing-on-iphone.md does not say so`,
    ).toContain(`Xcode ${xcode}`);
  });
});
