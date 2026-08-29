import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Every design pass blanks a credential in **both** spellings, or it blanks nothing.
 *
 * `mobile/app.config.ts` resolves configuration through a fallback list:
 *
 * ```
 * const env = (...names) => { for (const name of names) { const v = process.env[name]; if (v) return v; } };
 * env('EXPO_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL')
 * ```
 *
 * An **empty** value is falsy, so blanking only the first name does not blank the setting —
 * it falls through to the second, and the second comes from the workspace `.env`.
 *
 * `design:phone` blanks all six names and its export carries no Supabase host at all.
 * `design:real` blanked only the two `EXPO_PUBLIC_` ones, and §6.165 measured the result in
 * the bundle it produces: `mobile/dist-real` alone among the five design builds carried the
 * **live project host and a real publishable key**. So `syncConfigured()` was true in the
 * pass whose whole subject is real *metadata*, and every real-data title shot ever taken has
 * shown **Add to list** and **Content warnings** — two controls `design/capture.mjs`'s own
 * comments state cannot exist without an account.
 *
 * It was found by looking at `r6-title-severance.png` and asking why a control was there.
 * This is the clause that does not need somebody to ask.
 *
 * Not about secrecy. A Supabase anon key is designed to ship in a client and RLS is what
 * protects the data — `app.config.ts` says so, and refuses to build with an `sb_secret_`.
 * This is about **determinism**: a design pass that can reach a live backend is a pass whose
 * screenshots depend on something outside the repository, which is §6.125's whole reason for
 * blanking them.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const scripts = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).scripts as Record<
  string,
  string
>;

/**
 * The settings `mobile/app.config.ts` reads under two names, as it lists them.
 *
 * Read from the config rather than typed here, so a third fallback added there fails this
 * instead of quietly widening the hole. §6.41's shape: a list copied is a list that drifts.
 */
function fallbackPairs(): Array<[string, string]> {
  const config = readFileSync(resolve(ROOT, 'mobile/app.config.ts'), 'utf8');
  return [...config.matchAll(/env\(\s*'([A-Z_]+)'\s*,\s*'([A-Z_]+)'\s*\)/g)].map((m) => [
    m[1],
    m[2],
  ]);
}

describe('what a design pass is allowed to reach', () => {
  it('reads more than one name for the same setting, or this clause is about nothing', () => {
    // Non-vacuity. If `app.config.ts` ever stops falling back, the pairs go empty and every
    // assertion below passes having checked nothing — §6.121, and the reason it is stated
    // rather than assumed.
    expect(fallbackPairs().length, 'app.config.ts has no fallback pairs to disagree about').toBeGreaterThan(2);
  });

  it('blanks both names of a setting, never one', () => {
    const pairs = fallbackPairs();
    const wrong: string[] = [];
    for (const [name, script] of Object.entries(scripts)) {
      /*
       * Phone builds only, and the distinction is the whole point.
       *
       * The fallback list lives in `mobile/app.config.ts`, so it is `expo export` that reads
       * two names for one setting. `design:web` and `design:web:real` build the Vite app,
       * which reads `import.meta.env.VITE_*` and nothing else — blanking only the `VITE_`
       * name there is complete, and requiring the `EXPO_PUBLIC_` one would be this clause
       * inventing a rule the code does not have.
       */
      if (!/--workspace mobile|expo export/.test(script)) continue;
      for (const [first, second] of pairs) {
        // `NAME=` followed by a space or end: an assignment to nothing, which is what the
        // design scripts use to take a credential away.
        const blanked = (variable: string) =>
          new RegExp(`(^|\\s)${variable}=(\\s|$)`).test(script);
        if (blanked(first) !== blanked(second)) {
          wrong.push(
            `${name} blanks ${blanked(first) ? first : second} and not ${blanked(first) ? second : first}, so app.config.ts falls through to the one it kept`,
          );
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});
