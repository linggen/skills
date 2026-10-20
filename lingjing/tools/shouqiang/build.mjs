// build.mjs — bundles 守墙关's play (src/) into scripts/games/shouqiang/shouqiang.min.mjs. Phaser and the engine stay
// OUT of the bundle: `phaser` → the shared scripts/vendor/phaser.min.mjs, `shouqiang-core` → ./core.js beside the
// bundle (the engine is plain source, tested headless). Then the font subset (font.py) and the source hash.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceHash } from './hash.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '../../scripts/games/shouqiang');
const shared = {
  name: 'shared',
  setup(b) {
    b.onResolve({ filter: /^phaser$/ }, () => ({ path: '../../vendor/phaser.min.mjs', external: true }));
    b.onResolve({ filter: /^shouqiang-core$/ }, () => ({ path: './core.js', external: true }));
  },
};
await build({
  entryPoints: [join(here, 'src/main.js')], outfile: join(out, 'shouqiang.min.mjs'), bundle: true, format: 'esm',
  minify: !process.env.SHOUQIANG_DEBUG, target: 'es2022', legalComments: 'none', logLevel: 'warning', plugins: [shared],
  banner: { js: '/* 守墙关 — built by tools/shouqiang/build.mjs from tools/shouqiang/src; do not edit. Loads Phaser 3.90.0 (MIT) from scripts/vendor/phaser.min.mjs. */' },
});
execFileSync('python3', [join(here, 'font.py')], { stdio: 'inherit' });
writeFileSync(join(out, 'source.json'), JSON.stringify({ source: sourceHash(here) }) + '\n');
console.log('built →', out);
