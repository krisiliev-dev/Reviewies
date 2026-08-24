const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

/**
 * Metro, taught about the workspace.
 *
 * Two things it does not work out on its own:
 *
 * 1. **Where the code is.** `@reviewies/core` lives one directory up and is symlinked
 *    into the root `node_modules`, so Metro has to watch the workspace root and look
 *    for modules in both places — otherwise every core import fails to resolve.
 * 2. **What a `.wasm` file is.** expo-sqlite's web build imports its SQLite binary
 *    directly, and Metro does not treat wasm as an asset by default. Without this the
 *    web export fails on `Unable to resolve module ./wa-sqlite/wa-sqlite.wasm`.
 */
const project = __dirname;
const workspace = path.resolve(project, '..');

const config = getDefaultConfig(project);

config.watchFolders = [workspace];
config.resolver.nodeModulesPaths = [
  path.resolve(project, 'node_modules'),
  path.resolve(workspace, 'node_modules'),
];
// The core ships TypeScript source rather than a build step, so Metro compiles it
// along with everything else. That keeps one copy of the truth.
config.resolver.disableHierarchicalLookup = true;
config.resolver.assetExts = [...config.resolver.assetExts, 'wasm'];
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
