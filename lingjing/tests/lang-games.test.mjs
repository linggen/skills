// Both languages on every board (Hanli 11-02: 「中英文切换问题挺多… 不少UI上没有英文」) — the games' side of
// tests/lang-words.test.mjs, read from the source (a board's words table is a module's own const, never exported, and
// most boards need a browser to load):
// - every `{ zh: …, en: … }` in games/ has the same keys in en as in zh, and no Chinese in its en;
// - a `zh` with Chinese and no `en` beside it fails;
// - a Chinese string anywhere else in games/ stands only in a language's own branch (`lang === 'en' ? … : '…'`,
//   `if (en) return …`), or is kept on purpose below (a glyph drawn as art, a machine tag) — so a new word written in
//   Chinese alone, outside a words table, fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GAMES = path.join(path.dirname(fileURLToPath(import.meta.url)), '../scripts/games');
// Tokenize JS just enough (no parser in the skill): strings, template literals (with ${} nesting), comments, regex-ish skipped crudely, braces.
const ESC = { n: '\n', t: '\t', r: '\r' };
function tokens(src) {
  const out = []; let i = 0; const n = src.length;
  const stack = []; // for template ${ nesting: 'tpl' markers on brace stack
  let prevSig = ''; // last significant char for regex detection
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { const j = src.indexOf('\n', i); i = j < 0 ? n : j; continue; }
    if (c === '/' && d === '*') { const j = src.indexOf('*/', i + 2); i = j < 0 ? n : j + 2; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1, s = '';
      while (j < n && src[j] !== c) { if (src[j] === '\\') { s += ESC[src[j + 1]] ?? src[j + 1]; j += 2; continue; } if (src[j] === '\n') break; s += src[j]; j++; }
      out.push({ t: 'str', v: s, at: i }); i = j + 1; prevSig = 'a'; continue;
    }
    if (c === '`' || (c === '}' && stack.at(-1) === 'tpl')) {
      if (c === '}') stack.pop();
      let j = i + 1, s = '';
      while (j < n && src[j] !== '`') {
        if (src[j] === '\\') { s += ESC[src[j + 1]] ?? src[j + 1]; j += 2; continue; }
        if (src[j] === '$' && src[j + 1] === '{') break;
        s += src[j]; j++;
      }
      out.push({ t: 'str', v: s, at: i, tpl: true });
      if (src[j] === '$') { stack.push('tpl'); i = j + 2; prevSig = '('; } else { i = j + 1; prevSig = 'a'; }
      continue;
    }
    if (c === '/' && /[(,=:\[!&|?{};+\-*%<>~^]|^$/.test(prevSig)) { // regex literal
      let j = i + 1, cls = false;
      while (j < n) { const x = src[j]; if (x === '\\') { j += 2; continue; } if (x === '[') cls = true; else if (x === ']') cls = false; else if (x === '/' && !cls) break; else if (x === '\n') break; j++; }
      i = j + 1; while (/[a-z]/i.test(src[i] ?? '')) i++; prevSig = 'a'; continue;
    }
    if (c === '{') { stack.push('{'); out.push({ t: '{', at: i }); i++; prevSig = '{'; continue; }
    if (c === '}') { stack.pop(); out.push({ t: '}', at: i }); i++; prevSig = '}'; continue; }
    if (/[A-Za-z_$]/.test(c)) { let j = i; while (/[\w$]/.test(src[j] ?? '')) j++; out.push({ t: 'id', v: src.slice(i, j), at: i }); i = j; prevSig = 'a'; continue; }
    if (/\s/.test(c)) { i++; continue; }
    out.push({ t: 'p', v: c, at: i }); prevSig = c; i++;
  }
  return out;
}
const CJK = /[㐀-鿿]/;
/* A machine tag the same in both languages (jinchat-rules.js TAG, the goal met). */
const TAGS = /<!--成-->/g;
/* Objects: for every `{`, the keys at its depth 1 and the token ranges of each key's value. */
function scan(src) {
  const tk = tokens(src);
  const objs = []; const st = [];
  for (let k = 0; k < tk.length; k++) {
    const t = tk[k];
    if (t.t === '{') st.push({ open: k, keys: [], parent: st.at(-1) ?? null });
    else if (t.t === '}') { const o = st.pop(); if (o) { o.close = k; objs.push(o); } }
    else if ((t.t === 'id' || (t.t === 'str' && !t.tpl)) && tk[k + 1]?.t === 'p' && tk[k + 1].v === ':' && st.length) {
      const prev = tk[k - 1];
      if (prev && (prev.t === '{' || (prev.t === 'p' && prev.v === ','))) st.at(-1).keys.push({ key: t.v, at: k });
    }
  }
  return { tk, objs };
}
const line = (src, at) => src.slice(0, at).split('\n').length;
/* Audit one file: zh/en pairs with missing en keys, en values in Chinese, and Chinese strings outside any zh branch. */
function audit(file) {
  const src = fs.readFileSync(file, 'utf8');
  const { tk, objs } = scan(src);
  const byOpen = new Map(objs.map(o => [o.open, o]));
  const missing = [], chinese = [], loose = [];
  // value range of a key: from key+2 to next key at same depth or close
  const valueOf = (o, i) => { const s = o.keys[i].at + 2, e = i + 1 < o.keys.length ? o.keys[i + 1].at - 1 : o.close; return [s, e]; };
  const zhRanges = [];
  for (const o of objs) {
    const zi = o.keys.findIndex(x => x.key === 'zh'), ei = o.keys.findIndex(x => x.key === 'en');
    if (zi < 0) continue;
    const [zs, ze] = valueOf(o, zi); zhRanges.push([zs, ze]);
    const zobj = tk[zs]?.t === '{' ? byOpen.get(zs) : null;
    if (ei < 0) { // zh with no en at all
      const hasCjk = tk.slice(zs, ze).some(t => t.t === 'str' && CJK.test(t.v));
      if (hasCjk) missing.push(`${line(src, tk[o.keys[zi].at].at)}: zh with no en`);
      continue;
    }
    const [es, ee] = valueOf(o, ei);
    const eobj = tk[es]?.t === '{' ? byOpen.get(es) : null;
    if (zobj && eobj) {
      const ek = new Set(eobj.keys.map(x => x.key));
      // en may spread another (…COMMON.en): then skip key comparison
      const spreads = tk.slice(es, ee).some((t, j, a) => t.t === 'p' && t.v === '.' && a[j + 1]?.t === 'p' && a[j + 1].v === '.');
      if (!spreads) for (const z of zobj.keys) if (!ek.has(z.key)) missing.push(`${line(src, tk[z.at].at)}: ${z.key}`);
    }
    zhRanges.push([es, ee]); // an en's Chinese is told below, never twice
    for (const t of tk.slice(es, ee)) if (t.t === 'str' && CJK.test(t.v.replace(TAGS, ''))) chinese.push(`${line(src, t.at)}: ${t.v.slice(0, 40)}`);
  }
  for (let k = 0; k < tk.length; k++) {
    const t = tk[k];
    if (t.t !== 'str' || !CJK.test(t.v)) continue;
    if (zhRanges.some(([s, e]) => k >= s && k < e)) continue;
    loose.push({ line: line(src, t.at), v: t.v, k });
  }
  return { missing, chinese, loose };
}

/* Chinese kept on purpose, by file: each a glyph the board draws as art (its English shows the name beside it, or none is
   needed), a machine tag, or a helper of the Chinese branch itself. */
const KEPT = {
  'fighter/draw.js': ['大比', '沉鼎', '敕', '令', '缚', '镇'], // the 大比 banners' calligraphy (vertical, two glyphs) · the talisman's script
  'jinchat-games.js': ['之乎者也而以于其兮'], // the Chinese branch's own filler particles
  'jinchat-rules.js': ['<!--成-->'], // the goal's machine tag, the same in both languages
  'prefetch-ling.js': ['台词预取'], // a side session's internal title, never shown
  'sadoushou/tide.js': ['左', '右'], // goldZh, beside its goldEn
  'shell.js': ['留'], // the 留 seal on the bar's keep button, a glyph like ✕ (its words are in both languages)
  'shoulu.js': ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'], // the numerals the zh table counts its waves in
  'shoulu/core.js': ['剑', '火', '寒', '雷'], // each 符's glyph on its tower (the names beside them are in the words table)
  'shoulu/draw.js': ['守', '炉', '丹', '符'], // the 守炉 seal · the furnace's 丹 · a spot's 符 mark
  'wen.js': ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '中'], // the 地支 the board teaches, as glyphs
  'xiangqi.js': ['帅', '仕', '相', '马', '车', '炮', '兵', '将', '士', '象', '卒', '<text x="2.5" y="5.18">楚 河'], // the pieces and the river, as a 象棋 board is drawn
  'drawguess-rules.js': ['[stub] 这画的什么东西？', '[stub] 哼，是', '。\n[stub] Hmph', '.\n猜：'], // the stub seam's guess: both languages in one reply, 猜： the marker its parser reads
};
/* A language's own branch: an `en` test within the lines just before the string. */
const BRANCH = /lang\s*[!=]==?\s*'en'|\ben\s*\?|\(en\)|\ben\s*&&|!en\b|=== 'zh'/;
const CSS = (s) => /[{}]/.test(s) && /:\s*[^;]+;/.test(s);

function files() {
  const out = [];
  const rec = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) rec(p); else if (/\.m?js$/.test(f) && !/\.min\.m?js$/.test(f)) out.push(p); } };
  rec(GAMES);
  return out.sort();
}

test('the scanner reads a words table, a zh without its en, and a word outside both', () => {
  const tmp = path.join(fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? '/tmp'), 'lang-games-')), 't.js');
  fs.writeFileSync(tmp, "const W = { zh: { a: '甲', b: '乙' }, en: { a: 'A', c: '丙' } };\nconst X = { zh: '丁' };\nel.textContent = '戊'; // 注\nconst y = lang === 'en' ? 'Y' : '己';\n");
  const a = audit(tmp);
  assert.deepEqual(a.missing, ['1: b', '2: zh with no en']);
  assert.deepEqual(a.chinese, ['1: 丙']);
  assert.deepEqual(a.loose.map((x) => x.v), ['戊', '己']);
});

test('every board\'s words: each zh key has its en, no en word is Chinese, no Chinese word outside its language\'s branch', () => {
  const all = files();
  assert.ok(all.length >= 100, `files read: ${all.length}`);
  const missing = [], chinese = [], loose = [];
  for (const f of all) {
    const at = path.relative(GAMES, f), lines = fs.readFileSync(f, 'utf8').split('\n'), kept = new Set(KEPT[at] ?? []);
    const a = audit(f);
    missing.push(...a.missing.map((m) => `${at}:${m}`));
    chinese.push(...a.chinese.map((c) => `${at}:${c}`));
    for (const x of a.loose) {
      if ([...kept].some((k) => x.v === k || (k.length > 3 && x.v.startsWith(k))) || CSS(x.v) || /console\.(warn|info|log|error)\(/.test(lines[x.line - 1])) continue;
      if (BRANCH.test(lines.slice(Math.max(0, x.line - 12), x.line).join('\n'))) continue;
      loose.push(`${at}:${x.line}: ${x.v.slice(0, 50)}`);
    }
  }
  assert.deepEqual(missing, [], 'a zh word with no en');
  assert.deepEqual(chinese, [], 'Chinese in an en word');
  assert.deepEqual(loose, [], 'a Chinese word outside its language\'s branch (or add it to KEPT, with why)');
});

test('the boards\' data (games.json, levels/): no Chinese in an English text', () => {
  const WORLD = path.join(GAMES, '../../worlds/jiuding');
  const files = ['games.json', ...fs.readdirSync(path.join(WORLD, 'levels'), { recursive: true }).map(String).filter((f) => f.endsWith('.json')).map((f) => `levels/${f}`)];
  const found = [];
  const walk = (v, at, file) => {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${at}[${i}]`, file));
    if (!v || typeof v !== 'object') return;
    if (typeof v.en === 'string' && CJK.test(v.en)) found.push(`${file} ${at}: ${v.en.slice(0, 50)}`);
    for (const [k, x] of Object.entries(v)) if (!k.startsWith('_')) walk(x, `${at}.${k}`, file);
  };
  for (const f of files) walk(JSON.parse(fs.readFileSync(path.join(WORLD, f), 'utf8')), '', f);
  assert.ok(files.length > 10, `files read: ${files.length}`);
  assert.deepEqual(found, []);
});
