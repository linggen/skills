// The Browse page (scripts/browse.html) is the row browser the retired memory
// console used to serve. It lives in the skill, so it must reach memory only
// through the engine's own origin (/mem), load its own assets by relative
// path, and carry nothing of the old daemon.
//
//   node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

test('the page loads its assets by relative path', () => {
  const html = read('browse.html');
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    assert.ok(!m[1].startsWith('/'), `absolute asset link: ${m[1]}`);
    assert.ok(fs.existsSync(path.join(DIR, m[1])), `missing asset: ${m[1]}`);
  }
});

test('every memory call goes through the one /mem base', () => {
  const js = read('browse-app.js');
  assert.match(js, /import \{ MEM_BASE \} from '\.\/memory-path\.js'/);
  const direct = [...js.matchAll(/fetch\(\s*(['"`])\/api\//g)];
  assert.equal(direct.length, 0, 'a fetch on a bare /api path');
  assert.ok(!js.includes('/api/bash'));
});

test('nothing of the old daemon is left, and no Settings of the engine\'s own', () => {
  for (const f of ['browse.html', 'browse-app.js', 'browse.css']) {
    const text = read(f);
    assert.ok(!/ling-mem|9528|daemon/i.test(text), `${f} names the old daemon`);
    assert.ok(!/devices-pill|connect-banner|api\/network|api\/sync/.test(text), `${f} keeps an engine setting`);
  }
});
