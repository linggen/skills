// hash.mjs — what the 砸寨 bundle is built from (build.mjs writes it into games/zhazhai/levels.json; the test recomputes it).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** sha256 over src/, game-assets/ and build.mjs, by path and bytes (sorted): what the bundle is built from. */
export function sourceHash(root) {
  const h = createHash('sha256');
  const walk = (d) => readdirSync(d).filter((n) => !n.startsWith('.')).sort().forEach((n) => {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else h.update(p.slice(root.length)).update(readFileSync(p));
  });
  walk(join(root, 'src'));
  walk(join(root, 'game-assets'));
  h.update(readFileSync(join(root, 'build.mjs')));
  return h.digest('hex');
}
