// hash.mjs — one hash over what the 撒豆成兵 bundle is built from (src/, build.mjs, font.py): tests compare it with
// scripts/games/sadou/source.json, so a source change without a rebuild fails a test, not a play.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function sourceHash(here) {
  const h = createHash('sha256');
  const files = [...readdirSync(join(here, 'src')).sort().map((f) => join('src', f)), 'build.mjs', 'font.py'];
  for (const f of files) h.update(f).update(readFileSync(join(here, f)));
  return h.digest('hex').slice(0, 16);
}
