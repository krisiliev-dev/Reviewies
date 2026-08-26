import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT } from './pairs';

/**
 * The numbers, on both platforms.
 *
 * §6.51 found the calendar looking sixty days ahead on the web and thirty on the phone —
 * the same screen showing a different amount of the future — and it surfaced by accident,
 * through a sentence whose wording had drifted with it. Twice running, the finding worth
 * having was a behaviour difference wearing a cosmetic disguise, which is a poor way to
 * find behaviour differences.
 *
 * Two things are checked here, both about the same failure: one decision, made twice.
 *
 *  - **Tuning constants.** Every module-scope `const NAME = <number>` in either app must
 *    either come from the core or be named in `PLATFORM_NUMBERS` with a line saying why
 *    it belongs to one platform. A timeout, a lifetime, a page size: if both apps need
 *    one, it is one number and it lives beside the thing it tunes.
 *  - **Arguments to shared core calls.** Where both apps call the same core function,
 *    the numbers they pass have to match. This is precisely the shape `getUpcoming(60)`
 *    against `getUpcoming()` had, and nothing in the repository could see it.
 *
 * What this cannot catch is the same decision under two different names — `TRAVEL_MS`
 * against `LIFETIME_MS`, which is how the reaction lifetime hid. Only reading finds
 * those; the exemption list below is where reading gets written down.
 */

/** Numbers that are genuinely one platform's own, and why. */
const PLATFORM_NUMBERS: Record<string, string> = {
  'app/src/remote/useBridge.ts PROTOCOL_VERSION':
    'the relay wire version, spoken by the web drawer and the bridge; the phone reaches devices through the same relay but does not speak the protocol itself',
  'app/src/remote/useBridge.ts RECONNECT_MS':
    'how long the browser waits before redialling a dropped relay socket — the phone has no long-lived socket of its own to redial',
  'app/src/watching/ReactionStream.tsx LANES':
    'how many rows of drifting emoji fit above the controls, which is a question about one layout at one size and is answered separately on each. Both happen to be four today; that is a coincidence rather than a constraint, and either may change without the other (§6.59 checked this rather than assuming it)',
  'mobile/src/ui/ReactionStream.tsx LANES': 'as above, for the phone’s layout and its own strip height',
  'app/src/watching/extensionBridge.ts STALE_AFTER_MS':
    'how old a position from the browser extension may be before it is ignored; there is no extension on the phone',
  'mobile/src/ui/StarRating.tsx MIN_HALF':
    'the smallest half-star target in device-independent pixels, which is a WCAG 2.5.8 measurement of a native control and has no web counterpart',
};

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function sources(...dirs: string[]): string[] {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!/node_modules|dist|\.expo/.test(entry.name)) walk(path, out);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        out.push(path);
      }
    }
    return out;
  };
  return dirs.flatMap((dir) => walk(resolve(ROOT, dir))).map((p) => p.slice(ROOT.length + 1));
}

const WEB = () => sources('app/src');
const PHONE = () => sources('mobile/app', 'mobile/src');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

/** Split an argument list on its own commas, ignoring commas inside nested calls. */
function topLevelArgs(args: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const c of args) {
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    if (c === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
    } else current += c;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** `const NAME = 1234;` at module scope, as `<file> <NAME>`. */
export function tuningConstants(files: string[]): Array<{ key: string; value: string }> {
  const found: Array<{ key: string; value: string }> = [];
  for (const file of files) {
    for (const m of strip(read(file)).matchAll(/\bconst\s+([A-Z][A-Z0-9_]{2,})\s*=\s*([\d_.]+)\s*;/g)) {
      found.push({ key: `${file} ${m[1]}`, value: m[2] });
    }
  }
  return found;
}

/** Numbers passed to functions imported from the core, per function name. */
export function numbersPassedToCore(files: string[]): Map<string, Set<string>> {
  const calls = new Map<string, Set<string>>();
  for (const file of files) {
    const src = strip(read(file));
    const imported = new Set<string>();
    for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*'@reviewies\/core[^']*'/g)) {
      for (const raw of m[1].split(',')) {
        const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()?.trim();
        if (name && !/^[A-Z][A-Z0-9_]*$/.test(name)) imported.add(name);
      }
    }
    for (const name of imported) {
      for (const m of src.matchAll(new RegExp(`\\b${name}\\s*\\(`, 'g'))) {
        // Balanced read of the argument list, so a nested call does not truncate it.
        let i = m.index + m[0].length;
        let depth = 1;
        let args = '';
        while (i < src.length && depth > 0) {
          const c = src[i];
          if ('([{'.includes(c)) depth++;
          else if (')]}'.includes(c)) {
            depth--;
            if (!depth) break;
          }
          args += c;
          i++;
        }
        // Top-level arguments only, and only the ones that are a bare number: the `10`
        // in `slice(0, 10)` inside a filename belongs to `slice`, not to this call.
        // Recorded even when there are none — an empty signature against a `60` is
        // exactly what `getUpcoming()` against `getUpcoming(60)` looked like.
        const numbers = topLevelArgs(args).filter((a) => /^\d[\d_]*$/.test(a));
        if (!calls.has(name)) calls.set(name, new Set());
        calls.get(name)!.add(numbers.join(','));
      }
    }
  }
  return calls;
}

/**
 * Calls where the two platforms pass different numbers. Keyed by function name, because
 * that is the decision — `getUpcoming` looks a certain distance ahead, once.
 */
const ARGUMENT_EXEMPT: Record<string, string> = {};

describe('the numbers, on both platforms', () => {
  it('keeps no tuning number that has not said which platform it belongs to', () => {
    const undeclared = [...tuningConstants(WEB()), ...tuningConstants(PHONE())]
      .filter((c) => !PLATFORM_NUMBERS[c.key])
      .map((c) => `${c.key} = ${c.value}`);
    // Read the failure as: this number is a decision, and the other platform either has
    // its own copy of it or is about to grow one. Move it into the core beside the thing
    // it tunes — `UPCOMING_DAYS`, `REACTION_VISIBLE_MS`, `SEARCH_TIMEOUT_MS` are the
    // pattern — or add a line above saying why it is one platform's own.
    expect(undeclared).toEqual([]);
  });

  it('keeps no declaration for a number that has gone', () => {
    const live = new Set([...tuningConstants(WEB()), ...tuningConstants(PHONE())].map((c) => c.key));
    expect(Object.keys(PLATFORM_NUMBERS).filter((key) => !live.has(key))).toEqual([]);
  });

  it('says why, for each of them', () => {
    for (const [key, why] of Object.entries(PLATFORM_NUMBERS)) {
      expect(why.length, key).toBeGreaterThan(30);
    }
  });

  it('passes the same numbers into the same core call', () => {
    const web = numbersPassedToCore(WEB());
    const phone = numbersPassedToCore(PHONE());
    const differing: string[] = [];
    for (const [name, webArgs] of web) {
      const phoneArgs = phone.get(name);
      if (!phoneArgs) continue;
      const a = [...webArgs].sort().join(' | ');
      const b = [...phoneArgs].sort().join(' | ');
      if (a !== b && !ARGUMENT_EXEMPT[name]) differing.push(`${name}: web (${a}) phone (${b})`);
    }
    // `getUpcoming(60)` on the web against the core's default of 30 on the phone is the
    // case this exists for: the same screen, a different amount of the future, and no
    // constant anywhere to compare.
    expect(differing).toEqual([]);
  });

  it('keeps no argument exemption that no longer describes a difference', () => {
    const web = numbersPassedToCore(WEB());
    const phone = numbersPassedToCore(PHONE());
    const live = new Set(
      [...web.keys()].filter((name) => {
        const other = phone.get(name);
        if (!other) return false;
        return [...web.get(name)!].sort().join('|') !== [...other].sort().join('|');
      }),
    );
    expect(Object.keys(ARGUMENT_EXEMPT).filter((name) => !live.has(name))).toEqual([]);
  });

  it('reads both trees, rather than comparing two empty sets', () => {
    // Non-vacuity: every assertion above passes if the readers return nothing, which is
    // what a moved directory would cause, silently.
    expect(WEB().length).toBeGreaterThan(30);
    expect(PHONE().length).toBeGreaterThan(20);
    expect(numbersPassedToCore(WEB()).size).toBeGreaterThan(0);
    expect(numbersPassedToCore(PHONE()).size).toBeGreaterThan(0);
    // And that the constant reader still recognises the shape it is looking for.
    expect(tuningConstants(WEB()).map((c) => c.key.split(' ')[1])).toContain('LANES');
  });
});
