// Both languages, everywhere the page draws words (Hanli 11-02: 「中英文切换问题挺多… 不少UI上没有英文」):
// - every page dictionary's zh key has its en (a key in one language only is listed below, with why);
// - no en word is Chinese, past the names and the verse the English page keeps on purpose;
// - every world-data text with a zh has an en.
// The save's side — a name cached instead of an id — is tests/lang-cache.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.join(HERE, '../scripts');
const WORLD = path.join(HERE, '../worlds/jiuding');
const CJK = /[一-鿿]/;

/* The page's own dictionaries ({zh, en}, exported): every page module node can load as it is (a module that needs the
   browser to load is skipped — the count below says how many were read). */
const MODULES = fs.readdirSync(SCRIPTS).filter(f => /\.m?js$/.test(f));
/* One language's own: 对对子's checks are the language's own rules (平仄 and 不重位 in Chinese, rhyme in English). */
const ONE_LANGUAGE = new Set(['aigames-cards.js DUIZI_WORDS.checks.tail', 'aigames-cards.js DUIZI_WORDS.checks.same', 'aigames-cards.js DUIZI_WORDS.tailNote', 'aigames-cards.js DUIZI_WORDS.sameNote']);
/* Chinese kept in English on purpose: 银月's @-name (the chat's address), a monastery's own name in a source line. */
const KEPT = [/^@银月/, /宝聚寺/, /^\{y\} year/];

async function dictionaries() {
  const out = [];
  for (const f of MODULES) {
    let m;
    try { m = await import(path.join(SCRIPTS, f)); } catch { continue; }
    for (const [name, v] of Object.entries(m)) if (v && typeof v === 'object' && v.zh && v.en && typeof v.zh === 'object' && !Array.isArray(v.zh)) out.push({ at: `${f} ${name}`, zh: v.zh, en: v.en });
  }
  return out;
}
function gaps({ at, zh, en }, found = { missing: [], chinese: [] }) {
  for (const [k, v] of Object.entries(zh)) {
    const key = `${at}.${k}`;
    if (!(k in (en ?? {}))) { if (!ONE_LANGUAGE.has(key)) found.missing.push(key); continue; }
    if (v && typeof v === 'object' && !Array.isArray(v)) gaps({ at: key, zh: v, en: en[k] }, found);
  }
  for (const [k, e] of Object.entries(en ?? {})) if (typeof e === 'string' && CJK.test(e) && !KEPT.some(r => r.test(e))) found.chinese.push(`${at}.${k} = ${e.slice(0, 60)}`);
  return found;
}

test('every page dictionary: each zh word has its en, and no en word is Chinese', async () => {
  const all = await dictionaries();
  assert.ok(all.length >= 24, `dictionaries read: ${all.length}`);
  const found = { missing: [], chinese: [] };
  for (const d of all) gaps(d, found);
  assert.deepEqual(found.missing, [], 'zh only');
  assert.deepEqual(found.chinese, [], 'Chinese in English');
});

test('world data: every text with a zh has an en', () => {
  const missing = [];
  const walk = (v, at, file) => {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${at}[${i}]`, file));
    if (!v || typeof v !== 'object') return;
    if (typeof v.zh === 'string' && !('en' in v)) missing.push(`${file} ${at}: ${v.zh.slice(0, 30)}`);
    for (const [k, x] of Object.entries(v)) if (!k.startsWith('_')) walk(x, `${at}.${k}`, file);
  };
  const files = [];
  const rec = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) rec(p); else if (f.endsWith('.json')) files.push(p); } };
  rec(WORLD);
  for (const f of files) walk(JSON.parse(fs.readFileSync(f, 'utf8')), '', path.relative(WORLD, f));
  assert.ok(files.length > 50);
  assert.deepEqual(missing, []);
});

test('a list is joined in its own language: 、 in Chinese, a comma in English', async () => {
  const { WORDS } = await import('../scripts/cards.js');
  const { MIJING_WORDS } = await import('../scripts/mijing.js');
  const { LU_WORDS } = await import('../scripts/lu.js');
  for (const [at, zh, en] of [['WORDS.listSep', WORDS.zh.listSep, WORDS.en.listSep], ['MIJING_WORDS.sep', MIJING_WORDS.zh.sep, MIJING_WORDS.en.sep], ['LU_WORDS.listSep', LU_WORDS.zh.listSep, LU_WORDS.en.listSep]]) {
    assert.equal(zh, '、', at);
    assert.equal(en, ', ', at);
  }
  // No page script joins a list with 、 whatever the language (a join of the zh branch only is fine: it names its language).
  const bare = [];
  const files = [...fs.readdirSync(SCRIPTS).filter(f => /\.m?js$/.test(f)), ...fs.readdirSync(path.join(SCRIPTS, 'rules')).filter(f => f.endsWith('.mjs')).map(f => `rules/${f}`)];
  for (const f of files) {
    fs.readFileSync(path.join(SCRIPTS, f), 'utf8').split('\n').forEach((line, i) => {
      if (/\.join\('、'\)/.test(line) && !/zh \?|=== 'zh'|lang\(\) === 'en' \?|`[^`]*[\u4e00-\u9fff][^`]*\$\{[^}]*\.join\('、'\)/.test(line)) bare.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(bare, []);
});
