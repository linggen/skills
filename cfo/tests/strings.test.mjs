// strings.js — one language for the page: every zh-Hans key has an en twin,
// fallbacks land on English, plurals and params fill, and every key the page
// asks for exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { t, TABLES, setLanguage, normalizeLanguage, intlLocale, catLabel, language } from '../scripts/strings.js';

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts');
const en = TABLES.en, zh = TABLES['zh-Hans'];

test('S1 every zh-Hans key exists in en', () => {
  assert.deepEqual(Object.keys(zh).filter((k) => !(k in en)), []);
});

test('S2 language tags normalize: zh* → zh-Hans, anything else → en', () => {
  for (const tag of ['zh', 'zh-CN', 'zh-Hans', 'zh-Hans-CA', 'zh_TW', 'ZH-hk']) assert.equal(normalizeLanguage(tag), 'zh-Hans', tag);
  for (const tag of ['en', 'en-CA', 'fr-FR', '', null, undefined, 'xx']) assert.equal(normalizeLanguage(tag), 'en', String(tag));
});

test('S3 unknown language reads English; intl locale follows', () => {
  setLanguage('fr-FR');
  assert.equal(language(), 'en');
  assert.equal(intlLocale(), 'en-US');
  assert.equal(t('ui.tab.report'), 'Report');
  setLanguage('zh-Hans');
  assert.equal(intlLocale(), 'zh-CN');
  assert.equal(t('ui.tab.report'), '报告');
  setLanguage('en');
});

test('S4 a key missing from zh-Hans falls back to its en text; an unknown key returns itself', () => {
  en['test.only.en'] = 'Only {x}';
  try {
    setLanguage('zh-Hans');
    assert.equal(t('test.only.en', { x: 'here' }), 'Only here');
    assert.equal(t('no.such.key'), 'no.such.key');
  } finally { delete en['test.only.en']; setLanguage('en'); }
});

test('S5 plurals pick by n; params fill; unfilled braces stay', () => {
  assert.equal(t('ui.stage.count', { n: 1 }), '1 transaction');
  assert.equal(t('ui.stage.count', { n: 3 }), '3 transactions');
  assert.equal(t('ui.stage.count', { n: 0 }), '0 transactions');
  assert.equal(t('ui.stage.busy', {}), 'Finish the current import review first, then re-drop {file}.');
  setLanguage('zh-Hans');
  assert.equal(t('ui.stage.count', { n: 1 }), '1 笔交易');
  assert.equal(t('ui.stage.count', { n: 3 }), '3 笔交易');
  setLanguage('en');
});

test('S6 function values render with params', () => {
  assert.equal(t('ui.fx.at', { src: '', date: '2026-10-14' }), '≈ at the rate of 2026-10-14');
  assert.equal(t('ui.fx.at', { src: 'ECB', date: '2026-10-14' }), '≈ at ECB rate of 2026-10-14');
});

test('S7 built-in categories translate; made-up ones stay as written', () => {
  setLanguage('zh-Hans');
  assert.equal(catLabel('dining'), '餐饮');
  assert.equal(catLabel('pet stuff'), 'pet stuff');
  setLanguage('en');
  assert.equal(catLabel('dining'), 'dining');
});

test('S8 every literal key the page uses exists in en', () => {
  const missing = [];
  for (const f of readdirSync(SCRIPTS).filter((n) => /\.(js|html)$/.test(n))) {
    const src = readFileSync(join(SCRIPTS, f), 'utf8');
    for (const [, k] of src.matchAll(/\b(?:t|tr|L)\('([A-Za-z0-9_.:-]+)'/g)) if (!(k in en)) missing.push(`${f}: ${k}`);
    for (const [, k] of src.matchAll(/data-i18n(?:-[a-z]+)?="([^"]+)"/g)) if (!(k in en)) missing.push(`${f}: ${k}`);
  }
  assert.deepEqual(missing, []);
});

test('S9 zh-Hans copy never names the person', () => {
  const named = Object.entries(zh).filter(([, v]) => /Liang|Hanli/i.test(typeof v === 'function' ? v.toString() : JSON.stringify(v)));
  assert.deepEqual(named, []);
});
