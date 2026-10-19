// Every skill page that speaks the person's language (scripts/strings.js)
// holds its two tables together: each English key has its Chinese, the
// Chinese fills the same {slots}, and every key the page's code asks for
// exists. A key missing from zh-Hans is a screen showing English to someone
// who chose 中文 — this is the lock against that coming back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const slots = (v) => {
  const text = typeof v === 'string' ? v : v && typeof v === 'object' ? `${v.one} ${v.other}` : '';
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
};

for (const skill of readdirSync(ROOT).sort()) {
  const file = join(ROOT, skill, 'scripts', 'strings.js');
  if (!existsSync(file)) continue;
  test(`${skill}: en and zh-Hans hold the same keys and slots`, async () => {
    const { TABLES } = await import(pathToFileURL(file).href);
    const en = TABLES.en, zh = TABLES['zh-Hans'];
    assert.deepEqual(Object.keys(en).filter((k) => !(k in zh)), [], 'missing Chinese');
    assert.deepEqual(Object.keys(zh).filter((k) => !(k in en)), [], 'Chinese with no English');
    for (const k of Object.keys(zh)) {
      if (typeof en[k] === 'function' || typeof zh[k] === 'function') continue;
      // A plural's {one} may drop the count; the slots it does use must exist.
      const want = slots(typeof en[k] === 'object' ? en[k].other : en[k]);
      assert.deepEqual(slots(typeof zh[k] === 'object' ? zh[k].other : zh[k]), want, k);
    }
  });
  test(`${skill}: every key the page asks for exists`, async () => {
    const { TABLES } = await import(pathToFileURL(file).href);
    const dir = join(ROOT, skill, 'scripts');
    const asked = new Set();
    for (const f of readdirSync(dir).filter((f) => /\.(m?js|html)$/.test(f) && f !== 'strings.js')) {
      const src = readFileSync(join(dir, f), 'utf8');
      for (const m of src.matchAll(/\b(?:tr|t)\('([\w.:-]+)'/g)) asked.add(m[1]);
      for (const m of src.matchAll(/data-i18n(?:-\w+)?="([\w.:-]+)"/g)) asked.add(m[1]);
    }
    assert.deepEqual([...asked].filter((k) => k.includes('.') && !(k in TABLES.en)).sort(), []);
  });
}
