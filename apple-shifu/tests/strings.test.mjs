// strings.js puts the page's English into the person's language in place.
// A word that reads the same in both languages must not be rewritten: the
// DOM watcher answers every write by translating again, so a same-value
// write looped for ever and froze the System tab (2026-11-03).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLanguage, translateDom, translate, TABLES } from '../scripts/strings.js';

setLanguage('zh-Hans');

/** A text node that counts its writes. */
function textNode(value) {
  const node = { nodeType: 3, parentElement: null, writes: 0 };
  Object.defineProperty(node, 'nodeValue', {
    get: () => value,
    set: (v) => { value = v; node.writes += 1; },
  });
  return node;
}

test('a word the same in both languages is left alone', () => {
  const node = textNode('Xcode DerivedData');
  translateDom(node);
  assert.equal(node.writes, 0);
});

test('a word that changes is written once, and its translation stays put', () => {
  const node = textNode(' Disk ');
  translateDom(node);
  translateDom(node);
  assert.equal(node.nodeValue, ' 磁盘 ');
  assert.equal(node.writes, 1);
});

test('no translation translates into something else again (no chain to loop on)', () => {
  for (const v of Object.values(TABLES['zh-Hans'])) {
    if (typeof v !== 'string') continue;
    const said = v.replace(/\{(\w+)\}/g, '12');
    const again = translate(said);
    assert.ok(again == null || again === said, `${said} → ${again}`);
  }
});
