// A Mac with no JS runtime (Linggen.app from the DMG, no node): run-js.sh
// answers `{"ok":false,"error":"no JS runtime found …"}` with exit 1, the
// engine's door passes that through as HTTP 200 `{exit_code: 1, stdout}`, and
// verb() hands the page `{ok: false, error}` — no throw. The page used to take
// that for the game and sit on 「灵境还没醒来」 (2026-11-11). Now it is no Look,
// and the engine's runtime state picks the line: preparing, failed, offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LookFailed, runtimeWord } from '../scripts/rules.js';
import { WORDS } from '../scripts/cards.js';

const PAGE = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');

test('the runtime state picks the line', () => {
  assert.equal(runtimeWord({ state: 'preparing' }), 'preparing');
  assert.equal(runtimeWord({ state: 'missing' }), 'preparing');
  assert.equal(runtimeWord({ state: 'failed', reason: 'x' }), 'runtimeFailed');
  assert.equal(runtimeWord({ state: 'ready' }), 'offline');
  assert.equal(runtimeWord(null), 'offline');
});

test('every line is said in both languages', () => {
  for (const word of ['preparing', 'runtimeFailed', 'offline', 'connecting']) {
    assert.ok(WORDS.zh[word], `zh ${word}`);
    assert.ok(WORDS.en[word], `en ${word}`);
  }
});

test('a failed Look is thrown before it is taken for the game', () => {
  const start = PAGE.indexOf('async function readOnce()');
  const thrown = PAGE.indexOf('if (seen?.ok === false) throw new LookFailed(seen);', start);
  const taken = PAGE.indexOf('look = withArcade(', start);
  const left = PAGE.indexOf('leftLook(look)', start);
  assert.ok(thrown > start && thrown < taken && thrown < left);
  assert.equal(new LookFailed({ ok: false, error: 'no JS runtime found' }).name, 'LookFailed');
});

test('a LookFailed asks the engine; anything else stays offline', () => {
  const start = PAGE.indexOf('async function readOnce()');
  const at = PAGE.indexOf("console.warn('[lingjing] look', e);", start);
  const body = PAGE.slice(at, PAGE.indexOf('return;', at));
  assert.match(body, /'LookFailed' \? runtimeWord\(await runtimeState\(\)\) : 'offline'/);
});
