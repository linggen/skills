// The play bot's `no-spoils` rule (tools/playbot/spoils.mjs owedOf): a sheet is owed exactly when the page would open
// one. 2026-11-16: the first chapter's story fights pay nothing but a 符 on one win in three, and the bot called the
// other two "no spoils" — three false hard findings in one run, at sizes where the roll fell the other way.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { owedOf } from '../tools/playbot/spoils.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const won = (more = {}) => ({ ok: true, outcome: 'won', game: 'fox-bite', ...more });

test('a win that paid nothing owes no sheet (the story fox, 蠪侄 without the 符)', () => {
  assert.equal(owedOf(won()), null);
  assert.equal(owedOf(won({ first_win: true, first_met: true })), null);
  assert.equal(owedOf(won({ dropped: [], paid: null })), null);
  assert.equal(owedOf(won({ paid: { progress: 0, wealth: 0 } })), null);
});

test('a win that paid owes one: a drop, 修为, 灵石, a 符 spent, a variety bonus', () => {
  assert.deepEqual(owedOf(won({ dropped: [{ id: 'talisman', name: '符', n: 1 }] })).dropped, ['talisman']);
  assert.ok(owedOf(won({ paid: { progress: 40 } })).paid);
  assert.ok(owedOf(won({ paid: { wealth: 3 } })).paid);
  assert.deepEqual(owedOf(won({ spent: [{ id: 'talisman', name: '符' }] })).spent, ['talisman']);
  assert.ok(owedOf(won({ variety: { kinds: 2, paid: { progress: 5 } } })).variety);
});

test('what waits at the door (offered) is not in hand, so owes no sheet', () => {
  assert.equal(owedOf(won({ dropped: [{ id: 'bag', offered: true }] })), null);
});

test('a fight not won, or no answer, owes none', () => {
  assert.equal(owedOf({ ok: true, outcome: 'lost', dropped: [{ id: 'x' }] }), null);
  assert.equal(owedOf(null), null);
  assert.equal(owedOf(undefined), null);
});

// The pair: the page's gate and the bot's. If the page's changes, this reads it and fails until spoils.mjs follows.
test('the page opens 所得 on the same things the bot calls owed', () => {
  const src = fs.readFileSync(path.join(HERE, '../scripts/lingjing.js'), 'utf8');
  assert.match(src, /const got = r\.outcome === 'won' \? \(r\.dropped \?\? \[\]\)\.filter\(\(d\) => !d\.offered\) : \[\];/);
  assert.match(src, /const own = r\.outcome === 'won' && \(r\.paid\?\.progress \|\| r\.paid\?\.wealth\) \? r\.paid : null;/);
  assert.match(src, /if \(got\.length \|\| paid \|\| spent\.length\) keep\(\{ spoils:/);
});
