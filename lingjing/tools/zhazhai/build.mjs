// build.mjs — bundles 砸寨 (src/embed.ts + Phaser + matter-js) into one ESM file, and its fragment worker into
// another, then copies the assets beside them: everything lands in scripts/games/zhazhai/, which the skill ships.
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '../../scripts/games/zhazhai');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const common = { bundle: true, format: 'esm', minify: true, target: 'es2020', legalComments: 'none', logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"production"' } };
await build({ ...common, entryPoints: [join(here, 'src/embed.ts')], outfile: join(out, 'zhazhai.min.mjs'),
  banner: { js: '/* 砸寨 — a re-skin of Angry Aliens (MIT, LICENSE.txt here); Phaser 3.90.0 (MIT); matter-js 0.20.0 (MIT). Built by tools/zhazhai/build.mjs; do not edit. */' } });
await build({ ...common, entryPoints: [join(here, 'src/workers/fragmentWorker.ts')], outfile: join(out, 'fragment-worker.min.mjs') });
cpSync(join(here, 'game-assets'), out, { recursive: true });
copyFileSync(join(here, 'LICENSE'), join(out, 'LICENSE.txt'));
console.log('built →', out);
