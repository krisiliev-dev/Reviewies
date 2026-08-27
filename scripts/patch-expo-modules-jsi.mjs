/**
 * Remove `SWIFT_RETURNS_RETAINED` from two constructors in `expo-modules-jsi`.
 *
 * Xcode 26.3 (Swift 6.2.4) refuses to compile the SDK 57 version of this header:
 *
 *   RuntimeScheduler.h:53:26: error: 'RuntimeScheduler' cannot be annotated with either
 *   SWIFT_RETURNS_RETAINED or SWIFT_RETURNS_UNRETAINED because it is not returning a
 *   SWIFT_SHARED_REFERENCE type
 *
 * The class *is* a shared reference, but the `SWIFT_SHARED_REFERENCE(...)` annotation
 * sits on the closing brace at line 90 and the annotated constructors are at 53 and 61,
 * so clang has not seen it yet. Older Swift tolerated the ordering; 6.2.4 does not.
 *
 * This is not our bug and not our fix: `expo-modules-jsi@58.0.0-canary` deletes exactly
 * these two annotations and changes nothing else in the file. This applies that same
 * edit to the 57.x we are pinned to, so the diff against upstream is zero.
 *
 * It lives here rather than in `node_modules` because `node_modules` is not a place a
 * fix can live — the same rule as `mobile/ios/` and the push entitlement. 6.83.
 *
 * Deliberately quiet and idempotent. When Expo ships the fix in a 57.x patch the
 * pattern stops matching, this becomes a no-op, and `nativeConfig.test.ts` says so.
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const require_ = createRequire(import.meta.url);

/** The annotation, on a constructor rather than on a function returning the type. */
const BROKEN = /^(\s*)SWIFT_RETURNS_RETAINED (RuntimeScheduler\()/gm;

function headerPath() {
  const pkg = require_.resolve('expo-modules-jsi/package.json');
  return join(dirname(pkg), 'apple/Sources/ExpoModulesJSI-Cxx/include/RuntimeScheduler.h');
}

let file;
try {
  file = headerPath();
} catch {
  // Not installed — an install that skipped optional workspaces, or a future SDK that
  // dropped the package. Nothing to do, and not a reason to fail somebody's install.
  process.exit(0);
}

let source;
try {
  source = readFileSync(file, 'utf8');
} catch {
  process.exit(0);
}

if (!BROKEN.test(source)) process.exit(0);
BROKEN.lastIndex = 0;

writeFileSync(file, source.replace(BROKEN, '$1$2'));
console.log('patched expo-modules-jsi RuntimeScheduler.h for Xcode 26.3 (see 6.83)');
