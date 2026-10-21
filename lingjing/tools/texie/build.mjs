// build.mjs — three.js 0.176.0 + @pixiv/three-vrm 3.5.4 (both MIT) into one ESM bundle for 施法特写's 3D close-up:
// scripts/vendor/three-vrm-0.176.0-3.5.4.min.mjs (VENDOR.md). Only what entry.js names is kept.
import { build } from 'esbuild';
import { copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const vendor = join(here, '../../scripts/vendor');
await build({
  entryPoints: [join(here, 'entry.js')], outfile: join(vendor, 'three-vrm-0.176.0-3.5.4.min.mjs'), bundle: true, format: 'esm',
  minify: true, target: 'es2022', legalComments: 'none', logLevel: 'warning',
  banner: { js: '/* three.js 0.176.0 (MIT, LICENSE.three.txt) + @pixiv/three-vrm 3.5.4 (MIT, LICENSE.three-vrm.txt) — built by tools/texie/build.mjs; do not edit. */' },
});
copyFileSync(join(here, 'node_modules/three/LICENSE'), join(vendor, 'LICENSE.three.txt'));
copyFileSync(join(here, 'node_modules/@pixiv/three-vrm/LICENSE'), join(vendor, 'LICENSE.three-vrm.txt'));
console.log('built →', vendor);
