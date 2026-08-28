import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { type } from '@reviewies/core/tokens';

/**
 * G6, written out of `docs/design/tokens.md`, which specified it before anything existed.
 *
 * > The set of family names in `tokens.type.family` equals the set of faces in
 * > `mobile/src/ui/fonts.ts`'s `useFonts` map, equals the set of `@font-face` families in
 * > the generated CSS; every family's `stack` ends in a generic; and no raw `fontFamily:`
 * > literal exists in `mobile/{app,src}` outside `fonts.ts`.
 *
 * The failure it is for is the one the spec names: the three sets diverge and the phone
 * silently falls back to the system face — *the one type failure that looks fine in the
 * simulator and wrong on a device*. Nothing else in this repository could see it, because
 * every suite drives the react-native-web export, where the browser has the face anyway.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

const LOADER = read('mobile/src/ui/fonts.ts');
const CSS = read('app/src/tokens.generated.css');

/** Families that ship a file of their own, which is every one but `jp`. */
const bundled = Object.entries(type.family).filter(([, f]) => f.name);

describe('the faces', () => {
  it('is one set across the table, the loader and the stylesheet', () => {
    expect(bundled.length, 'no bundled families, so this proved nothing').toBeGreaterThan(4);
    for (const [role, face] of bundled) {
      expect(LOADER, `${role}: ${face.name} is in no useFonts map`).toContain(`'${face.name}':`);
      expect(LOADER, `${role}: ${face.name} has no file behind it`).toContain(`${face.name}.ttf`);
      expect(CSS, `${role}: ${face.name} reaches no browser`).toContain(`/fonts/${face.name}.ttf`);
    }
    // And nothing loaded that the table does not name — the other direction, which is how
    // a face outlives the role it was added for.
    const loaded = [...LOADER.matchAll(/'([A-Za-z-]+)':\s*require/g)].map((m) => m[1]);
    expect(loaded.sort()).toEqual(bundled.map(([, f]) => f.name).sort());
  });

  it('ships every file it names, at a size that is a real font', () => {
    const dir = resolve(ROOT, 'assets/fonts');
    const files = readdirSync(dir);
    for (const [role, face] of bundled) {
      expect(files, `${role}: no file for ${face.name}`).toContain(`${face.name}.ttf`);
      // A truncated download is a file that exists and renders nothing.
      expect(statSync(join(dir, `${face.name}.ttf`)).size, `${face.name} is too small to be a face`)
        .toBeGreaterThan(20_000);
    }
  });

  it('ends every stack in something the platform actually has', () => {
    /*
     * A `stack` is what runs when the face has not loaded, or has no glyph for what is
     * being set. Ending one in a made-up name is a stack that falls through to nothing.
     */
    const generic = /(ui-sans-serif|ui-serif|ui-monospace|sans-serif|serif|monospace|system-ui)\s*$/;
    for (const [role, face] of Object.entries(type.family)) {
      expect(face.stack, `${role}'s stack ends in nothing generic`).toMatch(generic);
    }
    // Japanese is not bundled, so its stack has to name real system faces rather than
    // leaning on a generic that has no Japanese in it either.
    expect(type.family.jp.name, 'jp claims a bundled file').toBeNull();
    expect(type.family.jp.stack).toContain('Hiragino Sans');
    expect(type.family.jp.stack).toContain('Noto Sans CJK JP');
  });

  it('names a font file in one place only', () => {
    /*
     * The spec's second plant: `fontFamily: 'Archivo'` typed into a screen, bypassing the
     * table and rendering a Japanese title in a face that has no Japanese in it.
     */
    const offenders: string[] = [];
    for (const file of sources('mobile/app').concat(sources('mobile/src'))) {
      if (file.endsWith('fonts.ts')) continue;
      for (const m of read(file).matchAll(/fontFamily:\s*(['"][^'"]*['"])/g)) {
        offenders.push(`${file}: fontFamily: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('is what the web is drawn in, not whatever the browser felt like', () => {
    // Sixteen sprints of design work happened on a system stack. The body face is the one
    // that decides what most of the app looks like, so it is asserted rather than assumed.
    expect(read('app/src/index.css')).toContain('font-family: var(--font-body)');
    for (const role of ['display', 'title', 'body', 'data']) {
      expect(CSS, `--font-${role} never reaches @theme`).toContain(`--font-${role}:`);
    }
  });
});

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist', '.expo', 'android', 'ios'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}
