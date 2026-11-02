// A first Look that waited out the data channel used to leave the page on
// 「灵境还没醒来」 until a reload (2026-11-02). The page now says it is
// connecting and asks again by itself — on a backoff, and at once when the
// channel opens or the page comes back into view.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const PAGE = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
const CARDS = fs.readFileSync(new URL('../scripts/cards.js', import.meta.url), 'utf8');

/** The body of `readOnce`'s catch: what a failed Look does. */
function failedLook() {
  const start = PAGE.indexOf('async function readOnce()');
  const at = PAGE.indexOf("console.warn('[lingjing] look', e);", start);
  assert.ok(start >= 0 && at > start, 'readOnce warns on a failed Look');
  return PAGE.slice(at, PAGE.indexOf('return;', at));
}

test('a failed Look is asked again, never left on the offline line', () => {
  assert.match(failedLook(), /lookAgainSoon\(\)/);
});

test('not connected reads as connecting, in both languages', () => {
  assert.match(failedLook(), /NotConnectedError'\s*\?\s*'connecting'/);
  assert.equal((CARDS.match(/connecting: '/g) ?? []).length, 2);
});

test('the retry backs off to 15 s and comes at once when the channel opens or the page is seen', () => {
  assert.match(PAGE, /Math\.min\(2000 \* 2 \*\* \(lookMisses - 1\), 15000\)/);
  assert.match(PAGE, /'linggen-channel'[^\n]*state === 'open'[^\n]*refreshSoon\(0\)/);
  assert.match(PAGE, /'visibilitychange'[^\n]*lookMisses[^\n]*refreshSoon\(0\)/);
});

test('a Look that comes back clears the misses', () => {
  const start = PAGE.indexOf('async function readOnce()');
  const after = PAGE.indexOf('lookMisses = 0;', start);
  assert.ok(after > start && after < PAGE.indexOf('\n}\n', start));
});
