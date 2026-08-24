import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

const outdir = new URL('./dist/', import.meta.url).pathname;
mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: ['src/content.ts', 'src/background.ts', 'src/options.ts', 'src/inject.ts'],
  bundle: true,
  format: 'esm',
  target: 'chrome110',
  outdir,
  logLevel: 'info',
});

for (const file of ['manifest.json', 'options.html']) {
  cpSync(new URL(`./${file}`, import.meta.url).pathname, outdir + file);
}

console.log('Extension built to extension/dist — load it unpacked.');
