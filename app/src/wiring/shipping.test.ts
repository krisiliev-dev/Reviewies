import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { color } from '@reviewies/core/tokens';

/**
 * The manifest a phone actually installs from, which nothing in this repository had read.
 *
 * §6.111. Every suite here drives the react-native-web export; `mobile/app.json` is the
 * half that only matters once somebody generates a native project, and until this sprint
 * nobody ever had. Running `expo prebuild` for the first time reported two problems by
 * name and produced three more that only reading the generated XML showed:
 *
 *   - Six icon and splash assets in `mobile/assets/`, 512KB of them, referenced by
 *     nothing. The app would install with Expo's template icon — a blue chevron on pale
 *     blue, with the construction guides still on it.
 *   - `userInterfaceStyle: "dark"` declared with nothing to implement it. This app is dark
 *     by decision rather than by preference (`tokens.ts` says so) and Android was left
 *     following the system.
 *   - `splashscreen_background: #FFFFFF` — a white flash before a near-black app.
 *   - `colorPrimary: #023c69`, Expo's scaffold navy, tinting every native ripple and
 *     text-selection handle in a colour that appears nowhere in this product.
 *   - `edgeToEdgeEnabled`, which Android 16 makes meaningless.
 *
 * Two of those were fixed *twice*, because the first fix silenced the warning without
 * changing the output: SDK 57 does not read the top-level `splash` key, and setting it to
 * the app's ground left the generated colour white. §6.87's rule, in a new place — emitted
 * is not rendered, and a warning that stops is not a feature that starts.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const manifest = JSON.parse(readFileSync(resolve(ROOT, 'mobile/app.json'), 'utf8')) as {
  expo: Record<string, never>;
};
const expo = manifest.expo as unknown as {
  icon?: string;
  primaryColor?: string;
  backgroundColor?: string;
  userInterfaceStyle?: string;
  android?: { backgroundColor?: string; adaptiveIcon?: Record<string, string>; edgeToEdgeEnabled?: unknown };
  web?: { favicon?: string };
  plugins?: unknown[];
};
const phonePackage = JSON.parse(readFileSync(resolve(ROOT, 'mobile/package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
};

/** Every hex the manifest names, wherever it names it. */
function hexes(value: unknown, into: string[] = []): string[] {
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) into.push(value.toUpperCase());
  else if (Array.isArray(value)) for (const v of value) hexes(v, into);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) hexes(v, into);
  return into;
}

/**
 * The *other* manifest a phone installs from, which this file did not read for four sprints.
 *
 * §6.111 wrote everything below for `mobile/app.json` and caught a product about to ship with
 * Expo's template icon on it. `app/vite.config.ts` declares the same kind of thing for the web
 * — and the web is the half anybody can actually install today, by Share → Add to Home Screen,
 * which `docs/research/01` records as the whole reason a local-first design is viable on iOS at
 * all: an installed home-screen app is exempt from Safari's 7-day eviction.
 *
 * It had both of the defects this file was written to catch. §6.185.
 *
 *   - `icon-192.png` and `icon-512.png` were named three times between them and **neither file
 *     existed** — not in `app/public`, not in any build, nowhere in the tree. `scripts/make-icons.mjs`
 *     draws them now.
 *   - `theme_color` and `background_color` were `#0b0b0f`, which is in neither palette. That is
 *     the splash and the status-bar tint of an installed app, in a colour nobody chose.
 *
 * Read from the built manifest rather than from the config, because that is the file a phone
 * fetches and `vite-plugin-pwa` is what writes it — the config could be right and the plugin
 * still emit something else. It needs `npm run build --workspace app` to have run, which
 * `npm run verify` does; the clause says so rather than silently passing on a stale one.
 */
const WEB_DIST = resolve(ROOT, 'app/dist');
const webManifestPath = resolve(WEB_DIST, 'manifest.webmanifest');

describe('what a phone would install from the web', () => {
  it('points every icon at a file that is actually in the build', () => {
    expect(
      existsSync(webManifestPath),
      'no built web manifest — run `npm run build --workspace app` first; this clause cannot read the config instead, because the plugin is what writes the file a phone fetches',
    ).toBe(true);

    const web = JSON.parse(readFileSync(webManifestPath, 'utf8')) as {
      icons?: { src: string }[];
    };
    const icons = web.icons ?? [];
    expect(icons.length, 'the web manifest declares no icons at all').toBeGreaterThan(1);

    // The file, in the build, beside the manifest — which is where `src` is resolved from.
    const missing = [...new Set(icons.map((i) => i.src))].filter(
      (src) => !existsSync(resolve(WEB_DIST, src)),
    );
    // Read a failure as: an installed app shows whatever the platform invents instead.
    expect(missing).toEqual([]);
  });

  it('paints its splash and its tint out of the token table', () => {
    const web = JSON.parse(readFileSync(webManifestPath, 'utf8')) as Record<string, unknown>;
    const known = new Set(
      [...Object.values(color.dark), ...Object.values(color.light)].map((v) => v.toUpperCase()),
    );
    const found = hexes(web);
    expect(found.length, 'the web manifest names no colours at all').toBeGreaterThan(1);
    expect([...new Set(found)].filter((hex) => !known.has(hex))).toEqual([]);
  });
});

describe('what a phone would install', () => {
  it('references every asset that ships beside it', () => {
    /*
     * The class §6.67 swept the code for — something that ships and nothing executes —
     * in the one file nothing had ever read. An unreferenced icon is not a missing icon:
     * it is Expo's icon, installed under this product's name.
     */
    const assets = readdirSync(resolve(ROOT, 'mobile/assets')).filter((f) => f.endsWith('.png'));
    /*
     * By the path it would be referenced *as*, not by its bare name.
     *
     * The first version asked whether the manifest text contained `icon.png`, and it did —
     * inside `splash-icon.png`. So the plant that removed the app icon entirely, which is
     * the exact state this project shipped in for its whole life, passed. §6.109's shape
     * for the third sprint running, twenty minutes after writing the clause, in a guard
     * whose whole subject is "referenced by nothing".
     */
    const declared = new Set(
      JSON.stringify(expo)
        .match(/\.\/assets\/[A-Za-z0-9._-]+/g)
        ?.map((path) => path.replace('./assets/', '')) ?? [],
    );
    const orphans = assets.filter((file) => !declared.has(file));
    expect(assets.length, 'no assets found, so this proved nothing').toBeGreaterThan(3);
    expect(orphans).toEqual([]);
  });

  it('paints every native surface out of the token table', () => {
    /*
     * The splash background, the activity background, the adaptive icon's ground and the
     * tint on every native ripple. Four colours a person sees before a single React
     * component has rendered, and three of them were scaffold defaults.
     */
    /*
     * No `.filter((v): v is string => ...)` here. There was one, and it is the reason this
     * file's first typecheck failed: every value in both tables is a hex string literal, so
     * the predicate *widened* `'#131114' | ...` to `string` rather than narrowing anything,
     * which TS rejects outright. It had guarded against nothing since it was written, and
     * nothing said so because no test file in this workspace had ever been typechecked.
     */
    const known = new Set(
      [...Object.values(color.dark), ...Object.values(color.light)].map((v) => v.toUpperCase()),
    );
    const found = hexes(expo);
    expect(found.length, 'the manifest names no colours at all').toBeGreaterThan(3);
    const strangers = [...new Set(found)].filter((hex) => !known.has(hex));
    // Read a failure as: this colour is in the manifest and in no token table, so nobody
    // chose it — Expo's scaffold navy `#023c69` is what that looks like.
    expect(strangers).toEqual([]);
  });

  it('has something to implement every appearance it declares', () => {
    // `userInterfaceStyle: "dark"` is inert on Android without expo-system-ui, and prebuild
    // says so by name — once anybody runs it.
    expect(expo.userInterfaceStyle).toBe('dark');
    expect(phonePackage.dependencies, 'nothing implements the declared appearance')
      .toHaveProperty('expo-system-ui');
    expect(phonePackage.dependencies, 'the splash key is inert without its plugin')
      .toHaveProperty('expo-splash-screen');
    expect(JSON.stringify(expo.plugins)).toContain('expo-splash-screen');
  });

  it('keeps no setting the platform has stopped reading', () => {
    // §6.41's rule, in the manifest: an excuse — or a switch — outlives the thing it was
    // for unless something checks. Android 16 makes edge-to-edge mandatory.
    expect(expo.android?.edgeToEdgeEnabled, 'edgeToEdgeEnabled does nothing since Android 16')
      .toBeUndefined();
  });
});
