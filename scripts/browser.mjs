import { existsSync } from 'node:fs';

/**
 * Where to find a Chromium for the browser suites.
 *
 * This environment ships a pinned Chromium and Playwright is pointed at it, so the three
 * suites hardcoded that path. On any other machine the path does not exist and the run
 * dies with an uncaught `executable doesn't exist at /opt/pw-browsers/...` — a directory
 * the reader has never heard of, from a command the README hands them without warning.
 * §6.46 found that by cloning the repository and following it.
 *
 * So: use the pinned build when it is actually there, and otherwise say nothing and let
 * Playwright resolve the browser it downloaded, whose own error message is the right one
 * ("run npx playwright install"). An explicitly set `CHROMIUM_PATH` that does not exist
 * is a different matter and is refused, because silently ignoring what somebody asked
 * for is worse than failing.
 */
const PINNED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export function chromiumPath() {
  const asked = process.env.CHROMIUM_PATH;
  if (asked) {
    if (existsSync(asked)) return asked;
    throw new Error(`CHROMIUM_PATH is set to ${asked}, which does not exist.`);
  }
  return existsSync(PINNED) ? PINNED : undefined;
}

/**
 * Launch options, with `executablePath` present only when there is one to give.
 *
 * Playwright treats an explicit `undefined` the same as absent, but spelling it out here
 * keeps the call sites from having to know that.
 */
export function chromiumOptions(extra = {}) {
  const executablePath = chromiumPath();
  return { ...(executablePath ? { executablePath } : {}), ...extra };
}
