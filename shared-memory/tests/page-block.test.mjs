// The page block the model writes into its reply: read back from either
// shape, the last good one wins, and the trailing commas models leave are
// forgiven. A block that does not parse must never blank the page.
//
//   node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePageBlock } from '../scripts/page-renderer.js';

test('the hidden comment shape is read', () => {
  assert.deepEqual(parsePageBlock('hi <!--page {"body": [{"type": "text"}]} --> bye'), { body: [{ type: 'text' }] });
});

test('the fenced shape is read when there is no comment', () => {
  assert.deepEqual(parsePageBlock('```page\n{"footer": {"text": "ok"}}\n```'), { footer: { text: 'ok' } });
});

test('trailing commas are forgiven', () => {
  assert.deepEqual(parsePageBlock('<!--page {"top_bar": [1, 2,], } -->'), { top_bar: [1, 2] });
});

test('the last block that parses wins; a broken last one falls back', () => {
  const warn = console.warn; console.warn = () => {};
  try {
    assert.deepEqual(parsePageBlock('<!--page {"n": 1} --> <!--page {"n": 2} -->'), { n: 2 });
    assert.deepEqual(parsePageBlock('<!--page {"n": 1} --> <!--page {nope -->'), { n: 1 });
    assert.equal(parsePageBlock('<!--page {nope -->'), null);
  } finally {
    console.warn = warn;
  }
});

test('no block, no page', () => {
  assert.equal(parsePageBlock('just words'), null);
});
