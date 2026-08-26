import { defineConfig } from 'vitest/config';

/**
 * The extension had no unit tests at all, and `npm test` said nothing about that.
 *
 * `npm run test --workspaces --if-present` skips a workspace with no `test` script
 * silently, so `npm run verify` reported green over five hundred lines nothing had ever
 * executed. Its browser smoke suite is real (§6.42) and runs separately; what it cannot
 * do is exercise the parsing and matching against anything but its own fixture page.
 * §6.68.
 */
export default defineConfig({
  test: {
    // jsdom, because half of what is worth testing here reads a Document.
    environment: 'jsdom',
    globals: true,
  },
});
